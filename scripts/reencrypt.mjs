#!/usr/bin/env node
/**
 * Re-encrypts every durable secret column onto the active key of its ring.
 *
 * Rotating one of the four AES-256-GCM keys used to be unrecoverable: nothing
 * in a row said which key produced its ciphertext, so the new key simply could
 * not open the old rows. This walks each row off the retired key and stamps the
 * new key id into the `*_key_version` column added by
 * apps/web/db/neon/0104_key_version.sql.
 *
 * Idempotent by construction: the sweep selects `key_version <> <active id>`,
 * so a completed target selects nothing on a second run. Pagination is keyset
 * on the id column rather than an offset, so rows the sweep deliberately leaves
 * alone cannot make the loop spin.
 *
 * Layout: by default a row is re-sealed in the SAME wire layout it was found
 * in. `--format=versioned` writes the self-describing `v1.<keyId>.…` form
 * instead, and is refused for any target whose production reader cannot parse
 * it (`versionedReaderReady: false` below) — writing it there would be a
 * one-way door that bricks the column. See docs/security/key-rotation.md.
 *
 * Usage (see the runbook for the full sequence — this is a maintenance-window
 * operation, not a live one):
 *   node scripts/reencrypt.mjs --target=all                 # dry run
 *   node scripts/reencrypt.mjs --target=connector-grants --apply
 */
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { loadKeyRing, openEnvelope, sealEnvelope } from '../apps/web/lib/crypto/envelope.ts';

/**
 * Every durable secret column, with the key ring it belongs to and the wire
 * layout its reader expects. Short-lived ciphertext (PKCE verifiers, device
 * authorization codes) is deliberately absent: those rows expire within
 * minutes, so rotating their key strands in-flight flows only.
 *
 * `versionedReaderReady` says whether the production reader of that column
 * decrypts through lib/crypto/envelope.ts, which is the only way a
 * `v1.<keyId>.…` value can be read back. It gates `--format=versioned`.
 */
export const REENCRYPT_TARGETS = {
  'connector-grants': {
    table: 'public.connector_oauth_grants',
    idColumn: 'id',
    keyVersionColumn: 'token_key_version',
    secretColumns: ['access_token_enc', 'refresh_token_enc'],
    keyEnv: 'CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY',
    keyEncoding: 'hex',
    legacyLayout: 'hex-triple',
    // lib/custom-connector-crypto.ts -> openEnvelope (via lib/connectors/oauth-store.ts).
    versionedReaderReady: true,
  },
  'custom-connectors': {
    table: 'public.user_custom_connectors',
    idColumn: 'id',
    keyVersionColumn: 'auth_header_key_version',
    secretColumns: ['auth_header_enc'],
    keyEnv: 'CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY',
    keyEncoding: 'hex',
    legacyLayout: 'hex-triple',
    // lib/custom-connector-crypto.ts -> openEnvelope (via lib/user-connector-tools.ts).
    versionedReaderReady: true,
  },
  'github-installations': {
    table: 'public.github_installations',
    idColumn: 'id',
    keyVersionColumn: 'access_token_key_version',
    secretColumns: ['access_token_enc'],
    keyEnv: 'GITHUB_TOKEN_ENCRYPTION_KEY',
    keyEncoding: 'hex',
    legacyLayout: 'hex-triple',
    // lib/github-app.ts decryptToken() -> openEnvelope.
    versionedReaderReady: true,
  },
  'two-factor': {
    table: 'public.user_two_factor',
    idColumn: 'user_id',
    keyVersionColumn: 'totp_secret_key_version',
    secretColumns: ['totp_secret_enc'],
    keyEnv: 'TOTP_ENCRYPTION_KEY',
    // Matches getConfiguredTOTPKeyMaterial(): the first 32 characters of the
    // env value as raw bytes, not hex. Decoding it any other way would produce
    // a key that cannot open a single enrolled secret.
    keyEncoding: 'utf8',
    legacyLayout: 'b64-iv-ct-tag',
    // decryptTOTPSecret() still accepts pre-encryption secrets stored as plain
    // Base32. They hold no key, so they are reported and left untouched rather
    // than counted as rotated.
    plaintextValue: /^[A-Z2-7]+$/,
    // features/settings/services/user-preferences.ts still decrypts with its own
    // inline WebCrypto codec and would hit atob() on the dots. Until it reads
    // through the envelope module, a versioned value here is unreadable.
    versionedReaderReady: false,
  },
};

const DEFAULT_BATCH_SIZE = 200;

function isSkippableValue(target, value) {
  return Boolean(target.plaintextValue?.test(value));
}

/**
 * Re-seals one target. `client.query(sql, params)` must resolve to an array of
 * rows; the caller owns transactions and connection lifetime.
 *
 * `format` is not validated here — main() runs assertFormatSupported() over the
 * whole selected set first, so `--target=all` cannot rotate the ready columns
 * and then abort on one that is not. Any other caller must do the same.
 */
export async function reencryptTarget({
  target,
  ring,
  client,
  apply = false,
  format = 'preserve',
  batchSize = DEFAULT_BATCH_SIZE,
}) {
  const activeId = ring.active.id;
  const columns = target.secretColumns;
  const selectList = [target.idColumn, target.keyVersionColumn, ...columns].join(', ');
  const outcome = { scanned: 0, rewritten: 0, stamped: 0, plaintext: 0 };

  let cursor = null;
  for (;;) {
    const params = cursor === null ? [activeId, batchSize] : [activeId, batchSize, cursor];
    const rows = await client.query(
      `select ${selectList}
         from ${target.table}
        where ${target.keyVersionColumn} <> $1
          ${cursor === null ? '' : `and ${target.idColumn} > $3`}
        order by ${target.idColumn}
        limit $2`,
      params,
    );
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1][target.idColumn];

    for (const row of rows) {
      outcome.scanned += 1;

      // Checked before anything is sealed: stamping this row would claim that a
      // secret still stored as plaintext belongs to a key it never used.
      if (columns.some((column) => row[column] && isSkippableValue(target, row[column]))) {
        outcome.plaintext += 1;
        continue;
      }

      const updates = [];
      for (const column of columns) {
        const value = row[column];
        if (value === null || value === undefined || value === '') continue;
        const opened = openEnvelope(ring, value, target.legacyLayout);
        const layout = format === 'versioned' ? 'versioned' : opened.layout;
        // A value already sealed under the active key in the layout we want
        // needs only its bookkeeping column stamped; re-sealing would burn a
        // fresh IV for nothing. This is the normal shape of a row written by
        // production after the env swap: correct ciphertext, stale key_version
        // (the column defaults to '1').
        if (opened.keyId === activeId && opened.layout === layout) continue;
        updates.push([column, sealEnvelope(ring, opened.plaintext, layout)]);
      }

      const assignments = updates.map(([column], index) => `${column} = $${index + 2}`);
      assignments.push(`${target.keyVersionColumn} = $${updates.length + 2}`);
      const sql =
        `update ${target.table} set ${assignments.join(', ')} ` + `where ${target.idColumn} = $1`;
      const values = [row[target.idColumn], ...updates.map(([, sealed]) => sealed), activeId];

      if (apply) await client.query(sql, values);
      if (updates.length > 0) outcome.rewritten += 1;
      else outcome.stamped += 1;
    }
  }

  return outcome;
}

/**
 * The one-way door. A `v1.<keyId>.…` value can only be read back by a reader
 * that goes through lib/crypto/envelope.ts; written into a column whose reader
 * still parses one fixed layout it is unrecoverable without a restore.
 *
 * main() calls this for every selected target BEFORE it opens the database, so
 * `--target=all --format=versioned` refuses outright rather than rotating the
 * ready columns and aborting on the one that is not.
 */
export function assertFormatSupported(names, format) {
  if (format !== 'versioned') return;
  for (const name of names) {
    const target = REENCRYPT_TARGETS[name];
    if (!target.versionedReaderReady) {
      throw new Error(
        `${name} (${target.table}) cannot take --format=versioned: its production reader ` +
          'does not decrypt through lib/crypto/envelope.ts yet, so the value would be ' +
          'unreadable. Migrate the reader first, then set versionedReaderReady in this file.',
      );
    }
  }
}

function parseArgs(argv) {
  const args = { target: null, apply: false, format: 'preserve' };
  for (const arg of argv) {
    if (arg === '--apply') args.apply = true;
    else if (arg.startsWith('--target=')) args.target = arg.slice('--target='.length);
    else if (arg.startsWith('--format=')) args.format = arg.slice('--format='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.target) {
    throw new Error(
      `--target=<name> is required. Known targets: ${Object.keys(REENCRYPT_TARGETS).join(', ')}, all`,
    );
  }
  if (args.target !== 'all' && !REENCRYPT_TARGETS[args.target]) {
    throw new Error(`Unknown target "${args.target}"`);
  }
  if (args.format !== 'preserve' && args.format !== 'versioned') {
    throw new Error('--format must be "preserve" or "versioned"');
  }
  return args;
}

async function main(argv) {
  const args = parseArgs(argv);
  const names = args.target === 'all' ? Object.keys(REENCRYPT_TARGETS) : [args.target];
  assertFormatSupported(names, args.format);

  const databaseUrl = process.env['NEON_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('NEON_DATABASE_URL (or DATABASE_URL) must be set');
  }

  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(databaseUrl);
  const client = { query: (text, params) => sql.query(text, params) };

  for (const name of names) {
    const target = REENCRYPT_TARGETS[name];
    const ring = loadKeyRing(target.keyEnv, { encoding: target.keyEncoding });
    const outcome = await reencryptTarget({
      target,
      ring,
      client,
      apply: args.apply,
      format: args.format,
    });
    console.log(
      `${args.apply ? 'rotated' : 'would rotate'} ${name} -> key ${ring.active.id}: ` +
        `scanned=${outcome.scanned} rewritten=${outcome.rewritten} ` +
        `stamped=${outcome.stamped} plaintext=${outcome.plaintext}`,
    );
  }

  if (!args.apply) {
    console.log('Dry run. Re-run with --apply to write.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

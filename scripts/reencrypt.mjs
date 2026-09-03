#!/usr/bin/env node
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { loadKeyRing, openEnvelope, sealEnvelope } from '../apps/web/lib/crypto/envelope.ts';

export const REENCRYPT_TARGETS = {
  'connector-grants': {
    table: 'public.connector_oauth_grants',
    idColumn: 'id',
    keyVersionColumn: 'token_key_version',
    secretColumns: ['access_token_enc', 'refresh_token_enc'],
    keyEnv: 'CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY',
    keyEncoding: 'hex',
    legacyLayout: 'hex-triple',
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
    versionedReaderReady: true,
  },
  'two-factor': {
    table: 'public.user_two_factor',
    idColumn: 'user_id',
    keyVersionColumn: 'totp_secret_key_version',
    secretColumns: ['totp_secret_enc'],
    keyEnv: 'TOTP_ENCRYPTION_KEY',
    keyEncoding: 'utf8',
    legacyLayout: 'b64-iv-ct-tag',
    plaintextValue: /^[A-Z2-7]+$/,
    versionedReaderReady: true,
  },
};

const DEFAULT_BATCH_SIZE = 200;

function isSkippableValue(target, value) {
  return Boolean(target.plaintextValue?.test(value));
}

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

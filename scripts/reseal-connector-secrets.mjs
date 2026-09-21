#!/usr/bin/env node
/**
 * Binds every connector secret still sealed without its purpose to that
 * purpose. Until this has run to completion over a deployment's data,
 * `openConnectorSecret` has to keep admitting an unbound ciphertext, which is
 * a ciphertext that opens under any context.
 *
 * Dry run is the default. It reads and reports; only `--apply` writes.
 */
import module from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const webRoot = path.join(repoRoot, 'apps/web');

// The product module is TypeScript written for the bundler, so its own
// specifiers are resolved here the way the bundler resolves them.
module.registerHooks({
  resolve(specifier, context, next) {
    // The product module declares it is server-only, which this is.
    if (specifier === 'server-only') {
      return { url: 'data:text/javascript,', shortCircuit: true };
    }
    if (specifier.startsWith('@/')) {
      return next(pathToFileURL(path.join(webRoot, `${specifier.slice(2)}.ts`)).href, context);
    }
    if (specifier.startsWith('.') && context.parentURL?.endsWith('.ts')) {
      const resolved = new URL(specifier, context.parentURL);
      if (!/\.[cm]?[jt]s$/.test(resolved.pathname)) return next(`${resolved.href}.ts`, context);
    }
    return next(specifier, context);
  },
});

const { CONNECTOR_SECRET_COLUMNS, RESEAL_BATCH, RESEAL_MAX_BATCHES, resealConnectorSecrets } =
  await import('../apps/web/lib/crypto/connector-secret-reseal.ts');
const { loadKeyRing } = await import('../apps/web/lib/crypto/envelope.ts');
const { resolveOperator } = await import('./reencrypt.mjs');

export const CONNECTOR_SECRET_KEY_ENV = 'CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY';

export function columnName(column) {
  return `${column.table}.${column.column}`;
}

export function parseArgs(argv) {
  const args = {
    apply: false,
    column: null,
    batchSize: RESEAL_BATCH,
    maxBatches: RESEAL_MAX_BATCHES,
  };
  for (const arg of argv) {
    if (arg === '--apply') args.apply = true;
    else if (arg === '--dry-run') args.apply = false;
    else if (arg.startsWith('--column=')) args.column = arg.slice('--column='.length);
    else if (arg.startsWith('--batch=')) args.batchSize = Number(arg.slice('--batch='.length));
    else if (arg.startsWith('--max-batches='))
      args.maxBatches = Number(arg.slice('--max-batches='.length));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(args.batchSize) || args.batchSize < 1 || args.batchSize > RESEAL_BATCH) {
    throw new Error(`--batch must be between 1 and ${RESEAL_BATCH}`);
  }
  if (
    !Number.isInteger(args.maxBatches) ||
    args.maxBatches < 1 ||
    args.maxBatches > RESEAL_MAX_BATCHES
  ) {
    throw new Error(`--max-batches must be between 1 and ${RESEAL_MAX_BATCHES}`);
  }
  if (
    args.column !== null &&
    !CONNECTOR_SECRET_COLUMNS.some((c) => columnName(c) === args.column)
  ) {
    throw new Error(
      `Unknown column "${args.column}". Known: ${CONNECTOR_SECRET_COLUMNS.map(columnName).join(', ')}`,
    );
  }
  return args;
}

export function selectColumns(name) {
  return name === null
    ? CONNECTOR_SECRET_COLUMNS
    : CONNECTOR_SECRET_COLUMNS.filter((column) => columnName(column) === name);
}

/**
 * A dry run must not be able to write, so it is given a database whose write
 * path throws rather than a flag the walk is trusted to honour.
 */
export function readOnlyDatabase(db) {
  return {
    query: (text, params) => db.query(text, params),
    execute: () => {
      throw new Error('Dry run attempted a write. Re-run with --apply to re-seal.');
    },
  };
}

export async function resealOnce({ db, ring, columns, batchSize, maxBatches, apply }) {
  return resealConnectorSecrets({
    db: apply ? db : readOnlyDatabase(db),
    ring,
    columns,
    batchSize,
    maxBatches,
  });
}

export function describe(outcome, apply) {
  return (
    `${apply ? 're-sealed' : 'would re-seal'}: scanned=${outcome.scanned} ` +
    `rebound=${outcome.rebound} alreadyBound=${outcome.alreadyBound} ` +
    `failures=${outcome.failures.length}`
  );
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.apply) resolveOperator();

  const databaseUrl = process.env['NEON_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!databaseUrl) throw new Error('NEON_DATABASE_URL (or DATABASE_URL) must be set');

  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(databaseUrl);
  const db = {
    query: (text, params) => sql.query(text, params),
    execute: async (text, params) => {
      await sql.query(text, params);
    },
  };

  const outcome = await resealOnce({
    db,
    ring: loadKeyRing(CONNECTOR_SECRET_KEY_ENV),
    columns: selectColumns(args.column),
    batchSize: args.batchSize,
    maxBatches: args.maxBatches,
    apply: args.apply,
  });

  console.log(describe(outcome, args.apply));
  for (const failure of outcome.failures) {
    console.log(`  refused ${failure.table}.${failure.column} ${failure.id}: ${failure.reason}`);
  }
  if (!outcome.complete) {
    console.log('Not finished. Run again: the walk resumes from what is still unbound.');
  }
  if (!args.apply) console.log('Dry run. Re-run with --apply to write.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

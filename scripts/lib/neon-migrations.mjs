import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DEFAULT_MIGRATIONS_DIR = join(REPO_ROOT, 'apps', 'web', 'db', 'neon');
export const MIGRATION_RUNNER_VERSION = 1;

const ADVISORY_LOCK_NAMESPACE = 924_818;
const ADVISORY_LOCK_ID = 20_260_730;
const MIGRATION_NAME = /^(\d{4})_([a-z0-9][a-z0-9_]*)\.sql$/;

export class MigrationContractError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'MigrationContractError';
    this.details = details;
  }
}

export function loadMigrationInventory(migrationsDir = DEFAULT_MIGRATIONS_DIR) {
  if (!existsSync(migrationsDir)) {
    throw new MigrationContractError(`Migration directory does not exist: ${migrationsDir}`);
  }

  const filenames = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  if (filenames.length === 0) {
    throw new MigrationContractError('Migration inventory is empty');
  }

  const migrations = filenames.map((filename) => {
    const match = MIGRATION_NAME.exec(filename);
    if (!match) {
      throw new MigrationContractError(
        `Migration filename must match NNNN_lower_snake_case.sql: ${filename}`,
      );
    }
    const sequence = Number(match[1]);
    const sql = readFileSync(join(migrationsDir, filename), 'utf8');
    if (sql.trim().length === 0) {
      throw new MigrationContractError(`Migration is empty: ${filename}`);
    }
    return {
      sequence,
      filename,
      name: match[2],
      checksum: createHash('sha256').update(sql, 'utf8').digest('hex'),
      sql,
    };
  });

  for (let index = 0; index < migrations.length; index += 1) {
    const expected = index + 1;
    const migration = migrations[index];
    if (migration.sequence !== expected) {
      throw new MigrationContractError(
        `Migration sequence must be contiguous: expected ${String(expected).padStart(4, '0')}, found ${String(migration.sequence).padStart(4, '0')} (${migration.filename})`,
      );
    }
  }
  return migrations;
}

export function planMigrations(migrations, ledgerRows) {
  const migrationBySequence = new Map(
    migrations.map((migration) => [migration.sequence, migration]),
  );
  const appliedSequences = new Set();
  const drift = [];

  for (const row of ledgerRows) {
    const sequence = Number(row.sequence);
    const migration = migrationBySequence.get(sequence);
    if (!migration) {
      drift.push(`ledger contains unknown migration sequence ${sequence} (${row.filename})`);
      continue;
    }
    appliedSequences.add(sequence);
    if (row.filename !== migration.filename) {
      drift.push(
        `migration ${sequence} filename changed: ledger=${row.filename}, repo=${migration.filename}`,
      );
    }
    if (row.checksum !== migration.checksum) {
      drift.push(`migration ${migration.filename} checksum differs from the applied ledger`);
    }
  }

  let sawPending = false;
  for (const migration of migrations) {
    if (appliedSequences.has(migration.sequence)) {
      if (sawPending) {
        drift.push(`ledger has a gap before applied migration ${migration.filename}`);
      }
    } else {
      sawPending = true;
    }
  }

  return {
    drift,
    applied: migrations.filter((migration) => appliedSequences.has(migration.sequence)),
    pending: migrations.filter((migration) => !appliedSequences.has(migration.sequence)),
  };
}

export async function ensureMigrationLedger(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      sequence integer PRIMARY KEY CHECK (sequence > 0),
      filename text NOT NULL UNIQUE,
      checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
      applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      duration_ms integer NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
      execution_mode text NOT NULL CHECK (execution_mode IN ('apply', 'baseline')),
      runner_version integer NOT NULL CHECK (runner_version > 0),
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    )
  `);
}

export async function readMigrationLedger(client) {
  const ledger = await client.query("SELECT to_regclass('public.schema_migrations') AS relation");
  if (!ledger.rows[0]?.relation) return [];

  const result = await client.query(`
    SELECT sequence, filename, checksum, applied_at, duration_ms,
           execution_mode, runner_version, metadata
      FROM public.schema_migrations
     ORDER BY sequence
  `);
  return result.rows;
}

async function withMigrationLock(client, operation) {
  await client.query('SELECT pg_advisory_lock($1, $2)', [
    ADVISORY_LOCK_NAMESPACE,
    ADVISORY_LOCK_ID,
  ]);
  try {
    return await operation();
  } finally {
    await client.query('SELECT pg_advisory_unlock($1, $2)', [
      ADVISORY_LOCK_NAMESPACE,
      ADVISORY_LOCK_ID,
    ]);
  }
}

function assertDriftFree(plan) {
  if (plan.drift.length > 0) {
    throw new MigrationContractError('Migration ledger drift detected', plan.drift);
  }
}

export async function inspectMigrationState(client, migrations) {
  const ledgerRows = await readMigrationLedger(client);
  const plan = planMigrations(migrations, ledgerRows);
  return { ledgerRows, plan };
}

export async function applyMigrations(client, migrations, options = {}) {
  return withMigrationLock(client, async () => {
    await ensureMigrationLedger(client);
    const { plan } = await inspectMigrationState(client, migrations);
    assertDriftFree(plan);

    const appliedNow = [];
    for (const migration of plan.pending) {
      const startedAt = performance.now();
      await client.query('BEGIN');
      try {
        await client.query("SET LOCAL lock_timeout = '10s'");
        await client.query("SET LOCAL statement_timeout = '120s'");
        await client.query(migration.sql);
        const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
        await client.query(
          `INSERT INTO public.schema_migrations
             (sequence, filename, checksum, duration_ms, execution_mode, runner_version, metadata)
           VALUES ($1, $2, $3, $4, 'apply', $5, $6::jsonb)`,
          [
            migration.sequence,
            migration.filename,
            migration.checksum,
            durationMs,
            MIGRATION_RUNNER_VERSION,
            JSON.stringify({ target: options.target ?? 'unspecified' }),
          ],
        );
        await client.query('COMMIT');
        appliedNow.push({ ...migration, durationMs });
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Preserve the migration error.
        }
        throw new MigrationContractError(
          `Migration ${migration.filename} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const finalState = await inspectMigrationState(client, migrations);
    assertDriftFree(finalState.plan);
    return { appliedNow, ...finalState };
  });
}

function unquoteIdentifier(value) {
  return value.replace(/^"|"$/g, '');
}

export function expectedTablesAfter(migrations) {
  const tables = new Set();
  for (const migration of migrations) {
    const statementPattern =
      /\b(create|drop)\s+table\s+(?:if\s+(?:not\s+)?exists\s+)?(?:public\.)?("[a-zA-Z_][a-zA-Z0-9_]*"|[a-zA-Z_][a-zA-Z0-9_]*)/gi;
    for (const match of migration.sql.matchAll(statementPattern)) {
      const action = match[1].toLowerCase();
      const table = unquoteIdentifier(match[2]).toLowerCase();
      if (action === 'create') tables.add(table);
      else tables.delete(table);
    }
  }
  return [...tables].sort();
}

async function assertBaselineSchema(client, migrations) {
  const expectedTables = expectedTablesAfter(migrations);
  const missing = [];
  for (const table of expectedTables) {
    const result = await client.query('SELECT to_regclass($1) AS relation', [`public.${table}`]);
    if (!result.rows[0]?.relation) missing.push(table);
  }
  if (missing.length > 0) {
    throw new MigrationContractError(
      'Cannot baseline: expected schema objects are missing',
      missing.map((table) => `missing table public.${table}`),
    );
  }
  return expectedTables;
}

export async function baselineMigrations(client, migrations, options) {
  return withMigrationLock(client, async () => {
    await ensureMigrationLedger(client);
    const ledgerRows = await readMigrationLedger(client);
    if (ledgerRows.length > 0) {
      throw new MigrationContractError('Baseline requires an empty schema_migrations ledger');
    }

    const through = Number(options.through);
    if (!Number.isInteger(through) || through < 1) {
      throw new MigrationContractError('Baseline requires a positive --through sequence');
    }
    const selected = migrations.filter((migration) => migration.sequence <= through);
    if (selected.length === 0 || selected.at(-1)?.sequence !== through) {
      throw new MigrationContractError(`No migration exists at baseline sequence ${through}`);
    }
    const expectedTables = await assertBaselineSchema(client, selected);

    await client.query('BEGIN');
    try {
      for (const migration of selected) {
        await client.query(
          `INSERT INTO public.schema_migrations
             (sequence, filename, checksum, duration_ms, execution_mode, runner_version, metadata)
           VALUES ($1, $2, $3, 0, 'baseline', $4, $5::jsonb)`,
          [
            migration.sequence,
            migration.filename,
            migration.checksum,
            MIGRATION_RUNNER_VERSION,
            JSON.stringify({
              target: options.target,
              reason: options.reason,
              evidence: options.evidence,
              expectedTableCount: expectedTables.length,
            }),
          ],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the baseline error.
      }
      throw error;
    }

    const finalState = await inspectMigrationState(client, migrations);
    assertDriftFree(finalState.plan);
    return { baselined: selected, expectedTables, ...finalState };
  });
}

export async function verifyMigrations(client, migrations) {
  const state = await inspectMigrationState(client, migrations);
  assertDriftFree(state.plan);
  if (state.plan.pending.length > 0) {
    throw new MigrationContractError(
      'Database has unapplied migrations',
      state.plan.pending.map((migration) => migration.filename),
    );
  }
  return state;
}

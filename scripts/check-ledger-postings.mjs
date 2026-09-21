#!/usr/bin/env node

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const MIGRATIONS_DIR = 'apps/web/db/neon';

export const LEDGER_TABLE = 'credit_transactions';

// A posting to the credit ledger is money. Two things make one safe to replay:
// it says what moved it, and something in the database refuses to apply it a
// second time. Neither is visible from a call site, so both are read off the
// statement that ships, and a writer that names no protection fails here
// rather than doubling a balance in production.
export const LEDGER_WRITE_PROTECTION = Object.freeze({
  get_or_create_credit_account_microusd: {
    kind: 'unique_index',
    index: 'idx_token_credits_unique_period',
    table: 'token_credits',
    why: 'The allocation follows the account row; the losing renewal aborts on the period key.',
  },
  reset_credits_for_period_microusd: {
    kind: 'unique_index',
    index: 'idx_token_credits_unique_period',
    table: 'token_credits',
    why: 'A second renewal for one period cannot insert the account it would allocate against.',
  },
  add_credits_microusd: {
    kind: 'unique_index',
    index: 'idx_credit_transactions_top_up_session_receipt',
    table: 'credit_transactions',
    why: 'The purchased grant carries the Checkout Session in its description, once per session.',
  },
  deduct_credits_microusd: {
    kind: 'idempotency_key',
    why: 'The caller supplies the key and a replay returns the stored result.',
  },
  settle_managed_usage_credits_microusd: {
    kind: 'idempotency_key',
    why: 'The key is derived from the request and the operation, and a mismatch is refused.',
  },
  handle_refund_microusd: {
    kind: 'caller_receipt',
    type: 'refund',
    description: 'p_reason',
    why: 'The webhook subtracts what this description already revoked before asking for more.',
  },
  handle_top_up_refund_microusd: {
    kind: 'caller_receipt',
    type: 'refund',
    description: 'p_reason',
    why: 'Same receipt: the retired purchase is recorded under the charge it came from.',
  },
});

function migrationFiles(repoRoot) {
  const dir = path.join(repoRoot, MIGRATIONS_DIR);
  return readdirSync(dir)
    .filter((name) => /^\d{4}_.*\.sql$/.test(name))
    .sort()
    .map((name) => ({ name, sql: readFileSync(path.join(dir, name), 'utf8') }));
}

/**
 * The definition that is actually live: a later migration replacing a function
 * wins, so a rule read off the first definition would police code that Postgres
 * no longer runs.
 */
export function effectiveFunctions(repoRoot = REPO_ROOT) {
  const functions = new Map();
  for (const { name, sql } of migrationFiles(repoRoot)) {
    for (const match of sql.matchAll(
      /create\s+or\s+replace\s+function\s+(?:public\.)?([a-z0-9_]+)\s*\(([\s\S]*?)\n\$\$;/gi,
    )) {
      functions.set(match[1], { name: match[1], migration: name, body: match[0] });
    }
  }
  return functions;
}

export function uniqueIndexes(repoRoot = REPO_ROOT) {
  const indexes = new Map();
  for (const { sql } of migrationFiles(repoRoot)) {
    for (const match of sql.matchAll(
      /create\s+unique\s+index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?([a-z0-9_]+)\s+on\s+(?:public\.)?([a-z0-9_]+)/gi,
    )) {
      indexes.set(match[1], match[2]);
    }
  }
  return indexes;
}

export function ledgerWriters(repoRoot = REPO_ROOT) {
  const writers = [];
  for (const entry of effectiveFunctions(repoRoot).values()) {
    const insert = new RegExp(
      `insert\\s+into\\s+(?:public\\.)?${LEDGER_TABLE}\\s*\\(([\\s\\S]*?)\\)\\s*(?:values\\s*\\(([\\s\\S]*?)\\)\\s*;|select([\\s\\S]*?);)`,
      'i',
    ).exec(entry.body);
    if (insert) {
      writers.push({ ...entry, columns: insert[1], values: insert[2] ?? insert[3] ?? '' });
    }
  }
  return writers.sort((left, right) => left.name.localeCompare(right.name));
}

export function checkLedgerPostings(repoRoot = REPO_ROOT) {
  const writers = ledgerWriters(repoRoot);
  const indexes = uniqueIndexes(repoRoot);
  const violations = [];
  const declared = new Set(Object.keys(LEDGER_WRITE_PROTECTION));

  for (const writer of writers) {
    declared.delete(writer.name);

    if (!/\bdescription\b/.test(writer.columns)) {
      violations.push({
        writer: writer.name,
        migration: writer.migration,
        why: `posts to ${LEDGER_TABLE} without naming what moved it`,
      });
    }

    const protection = LEDGER_WRITE_PROTECTION[writer.name];
    if (!protection) {
      violations.push({
        writer: writer.name,
        migration: writer.migration,
        why: `posts to ${LEDGER_TABLE} and names no defence against applying it twice`,
      });
      continue;
    }

    if (protection.kind === 'idempotency_key') {
      if (!/p_idempotency_key/.test(writer.body)) {
        violations.push({
          writer: writer.name,
          migration: writer.migration,
          why: 'claims an idempotency key, but the statement takes none',
        });
      }
      continue;
    }

    if (protection.kind === 'unique_index') {
      const table = indexes.get(protection.index);
      if (table === undefined) {
        violations.push({
          writer: writer.name,
          migration: writer.migration,
          why: `names the unique index ${protection.index}, which no migration creates`,
        });
      } else if (table !== protection.table) {
        violations.push({
          writer: writer.name,
          migration: writer.migration,
          why: `names ${protection.index} on ${protection.table}, but it is on ${table}`,
        });
      } else if (
        !new RegExp(`(?:insert\\s+into|update)\\s+(?:public\\.)?${protection.table}\\b`, 'i').test(
          writer.body,
        )
      ) {
        violations.push({
          writer: writer.name,
          migration: writer.migration,
          why: `relies on ${protection.index}, but never writes ${protection.table}`,
        });
      }
      continue;
    }

    if (protection.kind === 'caller_receipt') {
      if (!writer.values.includes(`'${protection.type}'`)) {
        violations.push({
          writer: writer.name,
          migration: writer.migration,
          why: `is read back as a '${protection.type}' posting, and no longer writes one`,
        });
      } else if (!writer.values.includes(protection.description)) {
        violations.push({
          writer: writer.name,
          migration: writer.migration,
          why: `is read back by ${protection.description}, which it no longer records`,
        });
      }
      continue;
    }

    violations.push({
      writer: writer.name,
      migration: writer.migration,
      why: `declares an unknown protection kind "${String(protection.kind)}"`,
    });
  }

  return { writers, violations, stale: [...declared].sort() };
}

function main() {
  const repoRoot = process.argv[2] ? path.resolve(process.argv[2]) : REPO_ROOT;
  const { writers, violations, stale } = checkLedgerPostings(repoRoot);

  if (writers.length === 0) {
    console.error(`No ${LEDGER_TABLE} writers found under ${MIGRATIONS_DIR}`);
    process.exitCode = 1;
    return;
  }

  if (violations.length > 0) {
    console.error('A credit ledger posting can be applied twice or cannot be traced:\n');
    for (const violation of violations) {
      console.error(`  ${violation.writer} (${violation.migration})`);
      console.error(`    ${violation.why}`);
    }
  }
  if (stale.length > 0) {
    console.error('\nThese declared ledger writers no longer exist; remove them:\n');
    for (const name of stale) console.error(`  ${name}`);
  }
  if (violations.length > 0 || stale.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log(
    `check-ledger-postings: ${writers.length} credit ledger writers, each named and each replay safe`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

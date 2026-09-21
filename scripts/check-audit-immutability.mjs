#!/usr/bin/env node
/**
 * A trail the application role may not rewrite stays that way after the next
 * blanket re-grant.
 *
 * The subjects are enumerated from the migrations, not from a list of trails:
 * every `revoke <privileges> on public.<table> from app_rls` that names UPDATE
 * or DELETE is the repository declaring that this table's history is not the
 * application's to alter. A privilege REVOKE alone does not hold that, and
 * 0043_audit_log_immutability.sql says so in its own header: 0037 grants
 * app_rls full DML on every table in the schema and on every table created
 * after it, so re-issuing either statement silently restores UPDATE and DELETE
 * with nothing failing. The mechanism that survives it is a row trigger that
 * raises on UPDATE and DELETE, which 0123 landed for the security audit log and
 * 0116 for the consent ledger. This requires one for every table that made the
 * same declaration.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MIGRATIONS_DIR = 'apps/web/db/neon';

const APPLICATION_ROLE = 'app_rls';

/** `revoke a, b on public.t from role`, only when the privileges are spelled out. */
const REVOKE =
  /revoke\s+((?:select|insert|update|delete|truncate|references|trigger)(?:\s*,\s*(?:select|insert|update|delete|truncate|references|trigger))*)\s+on\s+(?:table\s+)?public\.([a-z_]+)\s+from\s+([a-z_]+)/gi;

const TRIGGER = /create\s+trigger\s+([a-z_]+)\s+([\s\S]{0,200}?)\s+on\s+public\.([a-z_]+)/gi;
const FUNCTION = /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z_]+)\s*\(/gi;

/** The statements that make a REVOKE undoable, and the reason this guard exists. */
const RE_GRANTING = [
  /grant\s+[a-z, ]*\bupdate\b[a-z, ]*\s+on\s+all\s+tables\s+in\s+schema\s+public\s+to\s+app_rls/i,
  /alter\s+default\s+privileges[\s\S]{0,200}?grant\s+[a-z, ]*\bupdate\b[a-z, ]*\s+on\s+tables\s+to\s+app_rls/i,
];

function stripSqlComments(source) {
  return source
    .split('\n')
    .map((line) => {
      const at = line.indexOf('--');
      return at < 0 ? line : line.slice(0, at);
    })
    .join('\n');
}

export function readMigrations(repoRoot = REPO_ROOT) {
  const directory = path.join(repoRoot, MIGRATIONS_DIR);
  let names;
  try {
    names = fs.readdirSync(directory).filter((name) => name.endsWith('.sql'));
  } catch {
    return [];
  }
  return names.sort().map((name) => ({
    name,
    sql: stripSqlComments(fs.readFileSync(path.join(directory, name), 'utf8')),
  }));
}

/** Tables a migration told the application role it may not rewrite. */
export function tamperEvidentTables(migrations) {
  const declared = new Map();
  for (const { name, sql } of migrations) {
    for (const match of sql.matchAll(REVOKE)) {
      if (match[3].toLowerCase() !== APPLICATION_ROLE) continue;
      const privileges = match[1]
        .split(',')
        .map((privilege) => privilege.trim().toLowerCase())
        .filter((privilege) => privilege === 'update' || privilege === 'delete');
      if (privileges.length === 0) continue;
      const table = match[2].toLowerCase();
      const entry = declared.get(table) ?? { table, privileges: new Set(), declaredIn: [] };
      for (const privilege of privileges) entry.privileges.add(privilege);
      if (!entry.declaredIn.includes(name)) entry.declaredIn.push(name);
      declared.set(table, entry);
    }
  }
  return [...declared.values()].sort((left, right) => left.table.localeCompare(right.table));
}

/** Row triggers that fire before both UPDATE and DELETE, by table. */
export function refusingTriggers(migrations) {
  const functions = new Map();
  for (const { sql } of migrations) {
    for (const match of sql.matchAll(FUNCTION)) {
      const body = sql.slice(match.index);
      const end = body.indexOf('$$;');
      functions.set(match[1].toLowerCase(), end < 0 ? body : body.slice(0, end));
    }
  }

  const byTable = new Map();
  for (const { name, sql } of migrations) {
    for (const match of sql.matchAll(TRIGGER)) {
      const timing = match[2].toLowerCase();
      if (!/\bbefore\b/.test(timing)) continue;
      if (!/\bupdate\b/.test(timing) || !/\bdelete\b/.test(timing)) continue;
      const table = match[3].toLowerCase();
      const tail = sql.slice(match.index, match.index + 600);
      const executes = /execute\s+function\s+public\.([a-z_]+)/i.exec(tail);
      byTable.set(table, {
        trigger: match[1],
        declaredIn: name,
        perRow: /for\s+each\s+row/i.test(tail),
        handler: executes ? executes[1].toLowerCase() : null,
        refuses: executes
          ? /raise\s+exception/i.test(functions.get(executes[1].toLowerCase()) ?? '')
          : false,
      });
    }
  }
  return byTable;
}

export function checkAuditImmutability(repoRoot = REPO_ROOT) {
  const migrations = readMigrations(repoRoot);
  const failures = [];
  const report = { migrations: migrations.length, declared: 0, protected: 0, reGranting: 0 };

  if (migrations.length === 0) {
    failures.push(`${MIGRATIONS_DIR}: no migrations found, so no trail can be enumerated.`);
    return { failures, report };
  }

  for (const { sql } of migrations) {
    for (const pattern of RE_GRANTING) if (pattern.test(sql)) report.reGranting += 1;
  }
  if (report.reGranting === 0) {
    failures.push(
      'No statement in the schema re-grants UPDATE on every table to app_rls any more. That was ' +
        'the reason a REVOKE needed a trigger behind it; re-read this rule before keeping it.',
    );
  }

  const declared = tamperEvidentTables(migrations);
  const triggers = refusingTriggers(migrations);
  report.declared = declared.length;

  for (const entry of declared) {
    const trigger = triggers.get(entry.table);
    const privileges = [...entry.privileges].sort().join(' and ');
    if (!trigger) {
      failures.push(
        `public.${entry.table}: ${entry.declaredIn.join(', ')} revoked ${privileges} from ` +
          `${APPLICATION_ROLE} and nothing enforces it once that privilege comes back. Add a ` +
          'before update or delete row trigger that raises, as 0123 does for security_audit_logs.',
      );
      continue;
    }
    if (!trigger.perRow) {
      failures.push(
        `public.${entry.table}: ${trigger.trigger} is a statement trigger, so a row-level ` +
          'UPDATE or DELETE never reaches it.',
      );
      continue;
    }
    if (!trigger.refuses) {
      failures.push(
        `public.${entry.table}: ${trigger.trigger} runs ${trigger.handler ?? 'no function'}, ` +
          'which raises nothing. A trigger that returns quietly permits the write it watched.',
      );
      continue;
    }
    report.protected += 1;
  }

  return { failures, report };
}

function main() {
  const { failures, report } = checkAuditImmutability();
  if (failures.length > 0) {
    console.error('check:audit-immutability failed.\n');
    for (const failure of failures) console.error(`- ${failure}`);
    console.error('');
    process.exit(1);
  }
  console.log(
    `check:audit-immutability: OK (${report.declared} table(s) the application role may not ` +
      `rewrite, ${report.protected} held by a trigger a re-grant cannot undo, ` +
      `${report.reGranting} re-granting statement(s) in the schema)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) main();

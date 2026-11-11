#!/usr/bin/env node
/**
 * 0037 runs ALTER DEFAULT PRIVILEGES ... GRANT SELECT, INSERT, UPDATE, DELETE ON
 * TABLES TO app_rls, so every table a later migration creates starts with full
 * DML for the application role. A migration that revokes from public only, or
 * grants app_rls a subset, leaves the rest in place while its text says
 * otherwise: 0411, 0412 and 0418 shipped that way as drafts and only a real
 * database showed it. This guard reads every migration above the applied
 * watermark and requires each new table to name every privilege app_rls ends
 * up with, and to put any table app_rls can reach behind row-level security
 * with a policy, or carry a stated reason in the registry.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { loadAppliedThrough } from './check-migration-dependencies.mjs';
import { topLevelStatements } from './check-neon-migrations.mjs';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const MIGRATIONS_DIR = 'apps/web/db/neon';
export const REGISTRY_PATH = 'scripts/config/migration-table-privileges.json';
export const APPLICATION_ROLE = 'app_rls';

const MIN_REASON = 60;
const MIGRATION_FILE = /^(\d{4})_.+\.sql$/;
const TABLE_PRIVILEGES = Object.freeze([
  'select',
  'insert',
  'update',
  'delete',
  'truncate',
  'references',
  'trigger',
]);
const IDENT = '[a-z_][a-z0-9_$]*';
const NON_TABLE_OBJECT =
  /^(?:sequence|function|procedure|routine|schema|database|domain|type|language|large\s+object|foreign|tablespace|all\s)/;

const CREATE_TABLE = new RegExp(
  `^create\\s+(?:(?:global|local)\\s+)?(?:(temp|temporary|unlogged)\\s+)?table\\s+` +
    `(?:if\\s+not\\s+exists\\s+)?(?:(${IDENT})\\s*\\.\\s*)?(${IDENT})(?=\\s*[(\\s]|$)`,
);
const CREATE_TABLE_ANY = /^create\s+(?:[a-z]+\s+)*table\b/;
const GRANT =
  /^grant\s+(.+?)\s+on\s+(?:table\s+)?(.+?)\s+to\s+(.+?)(?:\s+with\s+grant\s+option)?(?:\s+granted\s+by\s+\S+)?$/;
const REVOKE =
  /^revoke\s+(grant\s+option\s+for\s+)?(.+?)\s+on\s+(?:table\s+)?(.+?)\s+from\s+(.+?)(?:\s+granted\s+by\s+\S+)?(?:\s+(?:cascade|restrict))?$/;
const DEFAULT_PRIVILEGES =
  /^alter\s+default\s+privileges\s+(?:for\s+(?:role|user)\s+.+?\s+)?(?:in\s+schema\s+(.+?)\s+)?(grant|revoke)\s+(grant\s+option\s+for\s+)?(.+?)\s+on\s+tables\s+(?:to|from)\s+(.+?)(?:\s+with\s+grant\s+option)?(?:\s+(?:cascade|restrict))?$/;
const ALTER_TABLE = new RegExp(
  `^alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?(?:public\\s*\\.\\s*)?(${IDENT})\\s+(.*)$`,
);
const ROW_SECURITY = /\b(enable|disable)\s+row\s+level\s+security\b/;
const RENAME_TABLE = new RegExp(`^rename\\s+to\\s+(${IDENT})$`);
const CREATE_POLICY = new RegExp(
  `^create\\s+policy\\s+(${IDENT})\\s+on\\s+(?:public\\s*\\.\\s*)?(${IDENT})\\b`,
);
const DROP_POLICY = new RegExp(
  `^drop\\s+policy\\s+(?:if\\s+exists\\s+)?(${IDENT})\\s+on\\s+(?:public\\s*\\.\\s*)?(${IDENT})\\b`,
);
const DROP_TABLE = /^drop\s+table\s+(?:if\s+exists\s+)?(.+?)(?:\s+(?:cascade|restrict))?$/;

function splitList(text) {
  return text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function bareTable(reference) {
  const match = new RegExp(`^(?:(${IDENT})\\s*\\.\\s*)?(${IDENT})$`).exec(reference.trim());
  if (match === null) return null;
  if (match[1] !== undefined && match[1] !== 'public') return null;
  return match[2];
}

function namesApplicationRole(grantees) {
  return splitList(grantees).some(
    (grantee) => grantee.replace(/^group\s+/, '') === APPLICATION_ROLE,
  );
}

function publicSchemaOnly(schemas) {
  return schemas === undefined || splitList(schemas).includes('public');
}

/**
 * Table-level privileges named by a GRANT or REVOKE list. A column list such
 * as `update (status)` grants no table privilege, so it is left out.
 */
export function tablePrivilegesOf(list) {
  const text = list.trim();
  if (/^all(?:\s+privileges)?$/.test(text)) return new Set(TABLE_PRIVILEGES);
  const named = new Set();
  for (const part of splitList(text.replace(/\([^)]*\)/g, '()'))) {
    const match = /^([a-z]+)(\s*\(\))?$/.exec(part);
    if (match === null || !TABLE_PRIVILEGES.includes(match[1])) return null;
    if (match[2] === undefined) named.add(match[1]);
  }
  return named;
}

function sortedPrivileges(set) {
  return TABLE_PRIVILEGES.filter((privilege) => set.has(privilege));
}

export function loadMigrations(repoRoot = REPO_ROOT) {
  const dir = path.join(repoRoot, MIGRATIONS_DIR);
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && MIGRATION_FILE.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .map((fileName) => ({
      fileName,
      number: Number(MIGRATION_FILE.exec(fileName)[1]),
      sql: readFileSync(path.join(dir, fileName), 'utf8'),
    }));
}

export function loadRegistry(repoRoot = REPO_ROOT) {
  return JSON.parse(readFileSync(path.join(repoRoot, REGISTRY_PATH), 'utf8'));
}

function validateRegistry(registry) {
  const problems = [];
  if (!registry || typeof registry !== 'object' || !Array.isArray(registry.entries)) {
    return [`${REGISTRY_PATH} must be an object with an entries array`];
  }
  const seen = new Set();
  for (const entry of registry.entries) {
    const label = entry?.table ?? '(unnamed)';
    if (typeof entry?.table !== 'string' || typeof entry?.migration !== 'string') {
      problems.push(`${REGISTRY_PATH}: entry ${label} must name a table and its migration file`);
      continue;
    }
    if (seen.has(entry.table)) problems.push(`${REGISTRY_PATH}: ${entry.table} is listed twice`);
    seen.add(entry.table);
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < MIN_REASON) {
      problems.push(
        `${REGISTRY_PATH}: ${entry.table} needs a reason of at least ${MIN_REASON} characters ` +
          'saying why app_rls may reach every row of it',
      );
    }
  }
  return problems;
}

/**
 * Replays the grant and revoke statements of the whole chain in apply order and
 * judges every table created above `appliedThrough`.
 */
export function analyzeMigrations({ migrations, appliedThrough, registry }) {
  const violations = [...validateRegistry(registry)];
  const registered = new Map((registry?.entries ?? []).map((entry) => [entry.table, entry]));
  const defaults = new Set();
  const existing = new Set();
  const tracked = new Map();
  let defaultsSeen = false;

  const apply = (table, privileges, granted) => {
    const state = tracked.get(table);
    if (state === undefined) return;
    for (const privilege of privileges) {
      if (granted) state.effective.add(privilege);
      else state.effective.delete(privilege);
    }
    if (granted && state.open) for (const privilege of privileges) state.named.add(privilege);
  };

  for (const migration of [...migrations].sort((a, b) => a.number - b.number)) {
    const drafted = migration.number > appliedThrough;
    const display = `${MIGRATIONS_DIR}/${migration.fileName}`;

    for (const statement of topLevelStatements(migration.sql)) {
      const defaultChange = DEFAULT_PRIVILEGES.exec(statement);
      if (defaultChange !== null) {
        const [, schemas, verb, optionOnly, list, grantees] = defaultChange;
        if (optionOnly || !publicSchemaOnly(schemas) || !namesApplicationRole(grantees)) continue;
        const privileges = tablePrivilegesOf(list) ?? new Set();
        for (const privilege of privileges) {
          if (verb === 'grant') defaults.add(privilege);
          else defaults.delete(privilege);
        }
        defaultsSeen = true;
        continue;
      }

      if (CREATE_TABLE_ANY.test(statement)) {
        const created = CREATE_TABLE.exec(statement);
        if (created === null) {
          if (drafted) {
            violations.push(
              `${display}: cannot read the table name in "${statement.slice(0, 80)}", so its ` +
                'app_rls privileges cannot be checked. Name it as public.<unquoted_name>.',
            );
          }
          continue;
        }
        const [, temporary, schema, table] = created;
        if (temporary === 'temp' || temporary === 'temporary') continue;
        if (schema !== undefined && schema !== 'public') continue;
        if (existing.has(table)) continue;
        existing.add(table);
        if (!drafted) continue;
        tracked.set(table, {
          table,
          migration: migration.fileName,
          effective: new Set(defaults),
          named: new Set(),
          open: true,
          rls: false,
          policies: new Set(),
        });
        continue;
      }

      const grant = GRANT.exec(statement);
      if (grant !== null) {
        const [, list, objects, grantees] = grant;
        if (NON_TABLE_OBJECT.test(objects) || !namesApplicationRole(grantees)) continue;
        const privileges = tablePrivilegesOf(list);
        if (privileges === null) continue;
        for (const object of splitList(objects)) {
          const table = bareTable(object);
          if (table !== null) apply(table, privileges, true);
        }
        continue;
      }

      const revoke = REVOKE.exec(statement);
      if (revoke !== null) {
        const [, optionOnly, list, objects, grantees] = revoke;
        if (optionOnly || NON_TABLE_OBJECT.test(objects) || !namesApplicationRole(grantees)) {
          continue;
        }
        const privileges = tablePrivilegesOf(list);
        if (privileges === null) continue;
        for (const object of splitList(objects)) {
          const table = bareTable(object);
          if (table !== null) apply(table, privileges, false);
        }
        continue;
      }

      const alter = ALTER_TABLE.exec(statement);
      if (alter !== null) {
        const [, table, action] = alter;
        const renamed = RENAME_TABLE.exec(action);
        if (renamed !== null) {
          existing.delete(table);
          existing.add(renamed[1]);
          const state = tracked.get(table);
          if (state !== undefined) {
            tracked.delete(table);
            tracked.set(renamed[1], { ...state, table: renamed[1] });
          }
          continue;
        }
        const security = ROW_SECURITY.exec(action);
        const state = tracked.get(table);
        if (security !== null && state !== undefined) state.rls = security[1] === 'enable';
        continue;
      }

      const policy = CREATE_POLICY.exec(statement);
      if (policy !== null) {
        tracked.get(policy[2])?.policies.add(policy[1]);
        continue;
      }

      const droppedPolicy = DROP_POLICY.exec(statement);
      if (droppedPolicy !== null) {
        tracked.get(droppedPolicy[2])?.policies.delete(droppedPolicy[1]);
        continue;
      }

      const dropped = DROP_TABLE.exec(statement);
      if (dropped !== null) {
        for (const object of splitList(dropped[1])) {
          const table = bareTable(object);
          if (table === null) continue;
          existing.delete(table);
          tracked.delete(table);
        }
      }
    }

    for (const state of tracked.values()) {
      if (!state.open) continue;
      state.open = false;
      const unnamed = sortedPrivileges(
        new Set([...state.effective].filter((privilege) => !state.named.has(privilege))),
      );
      if (unnamed.length === 0) continue;
      violations.push(
        `${MIGRATIONS_DIR}/${state.migration}: creates public.${state.table} and leaves ` +
          `${APPLICATION_ROLE} with ${unnamed.join(', ').toUpperCase()} that the migration never ` +
          `grants. The default privileges give ${APPLICATION_ROLE} ` +
          `${sortedPrivileges(defaults).join(', ').toUpperCase() || 'nothing'} on every new ` +
          'table, so revoking from public alone changes nothing for it. Add ' +
          `"revoke all on public.${state.table} from public, ${APPLICATION_ROLE};" and grant ` +
          'back exactly what the application uses.',
      );
    }
  }

  if (!defaultsSeen && migrations.some((migration) => migration.number <= appliedThrough)) {
    violations.push(
      `No migration at or below ${appliedThrough} sets ALTER DEFAULT PRIVILEGES for ` +
        `${APPLICATION_ROLE}; this guard cannot know what a new table starts with.`,
    );
  }

  const reachable = [];
  const behindRowSecurity = [];
  for (const state of tracked.values()) {
    const entry = registered.get(state.table);
    const protectedByPolicy = state.rls && state.policies.size > 0;
    if (state.effective.size > 0) reachable.push(state.table);
    if (state.effective.size > 0 && protectedByPolicy) behindRowSecurity.push(state.table);
    if (state.effective.size > 0 && !protectedByPolicy && entry === undefined) {
      violations.push(
        `${MIGRATIONS_DIR}/${state.migration}: public.${state.table} grants ${APPLICATION_ROLE} ` +
          `${sortedPrivileges(state.effective).join(', ').toUpperCase()} but has no row-level ` +
          `security with a policy, so every ${APPLICATION_ROLE} session reaches every row. Enable ` +
          `row level security with a policy, or record the table in ${REGISTRY_PATH} with the ` +
          'reason its isolation is enforced elsewhere.',
      );
    }
    if (entry !== undefined && entry.migration !== state.migration) {
      violations.push(
        `${REGISTRY_PATH}: ${state.table} is created by ${state.migration}, not ${entry.migration}`,
      );
    }
    if (entry !== undefined && (state.effective.size === 0 || protectedByPolicy)) {
      violations.push(
        `${REGISTRY_PATH}: ${state.table} no longer needs its entry (` +
          `${state.effective.size === 0 ? `${APPLICATION_ROLE} holds nothing on it` : 'it has row-level security with a policy'}). Delete it.`,
      );
    }
  }
  for (const table of registered.keys()) {
    if (!tracked.has(table)) {
      violations.push(
        `${REGISTRY_PATH}: ${table} is not a table created above the applied watermark ` +
          `${appliedThrough}. Delete the entry.`,
      );
    }
  }

  return {
    violations,
    defaults: sortedPrivileges(defaults),
    tables: [...tracked.keys()].sort(),
    reachable: reachable.sort(),
    behindRowSecurity: behindRowSecurity.sort(),
  };
}

function main() {
  const appliedThrough = loadAppliedThrough();
  const result = analyzeMigrations({
    migrations: loadMigrations(),
    appliedThrough,
    registry: loadRegistry(),
  });
  if (result.violations.length > 0) {
    console.error('Migration table privilege check FAILED:\n');
    for (const violation of result.violations) console.error(`- ${violation}\n`);
    process.exit(1);
  }
  console.log(
    `Migration table privilege check passed (${result.tables.length} table(s) created above ` +
      `applied migration ${appliedThrough}, each naming every ${APPLICATION_ROLE} privilege; ` +
      `${result.behindRowSecurity.length} reachable by ${APPLICATION_ROLE} behind row-level ` +
      `security, ${result.reachable.length - result.behindRowSecurity.length} with a registered reason).`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}

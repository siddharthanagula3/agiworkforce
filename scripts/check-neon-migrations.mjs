#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { missingRouteTableMigrations } from './lib/route-table-contract.mjs';

const MIGRATIONS_DIR = 'apps/web/db/neon';
const DOWN_MIGRATIONS_DIR = `${MIGRATIONS_DIR}/down`;

export const FIRST_REVERSIBLE_MIGRATION = 97;

const IDENTIFIER = String.raw`(?:"[^"]+"|[a-z_][a-z0-9_$]*)`;
const QUALIFIED = String.raw`(?:public\s*\.\s*)?(${IDENTIFIER})`;

const DECLARATION_PATTERNS = [
  { kind: 'table', pattern: `\\bcreate\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${QUALIFIED}` },
  { kind: 'table', pattern: `\\bdrop\\s+table\\s+(?:if\\s+exists\\s+)?${QUALIFIED}` },
  {
    kind: 'index',
    pattern:
      `\\bcreate\\s+(?:unique\\s+)?index\\s+(?:concurrently\\s+)?(?:if\\s+not\\s+exists\\s+)?` +
      `(${IDENTIFIER})\\s+on\\s+${QUALIFIED}`,
    tableGroup: 2,
  },
  {
    kind: 'index',
    pattern: `\\bdrop\\s+index\\s+(?:concurrently\\s+)?(?:if\\s+exists\\s+)?${QUALIFIED}`,
  },
  {
    kind: 'policy',
    pattern: `\\bcreate\\s+policy\\s+(${IDENTIFIER})\\s+on\\s+${QUALIFIED}`,
    tableGroup: 2,
  },
  {
    kind: 'function',
    pattern: `\\bcreate\\s+(?:or\\s+replace\\s+)?function\\s+${QUALIFIED}\\s*\\(`,
  },
  { kind: 'type', pattern: `\\bcreate\\s+type\\s+${QUALIFIED}` },
  { kind: 'type', pattern: `\\bdrop\\s+type\\s+(?:if\\s+exists\\s+)?${QUALIFIED}` },
  {
    kind: 'view',
    pattern:
      `\\bcreate\\s+(?:or\\s+replace\\s+)?(?:materialized\\s+)?view\\s+` +
      `(?:if\\s+not\\s+exists\\s+)?${QUALIFIED}`,
  },
  {
    kind: 'view',
    pattern: `\\bdrop\\s+(?:materialized\\s+)?view\\s+(?:if\\s+exists\\s+)?${QUALIFIED}`,
  },
  {
    kind: 'sequence',
    pattern: `\\bcreate\\s+sequence\\s+(?:if\\s+not\\s+exists\\s+)?${QUALIFIED}`,
  },
  { kind: 'sequence', pattern: `\\bdrop\\s+sequence\\s+(?:if\\s+exists\\s+)?${QUALIFIED}` },
  {
    kind: 'trigger',
    pattern: `\\bcreate\\s+(?:or\\s+replace\\s+)?trigger\\s+(${IDENTIFIER})\\s+[\\s\\S]*?\\bon\\s+${QUALIFIED}`,
    tableGroup: 2,
  },
];

const ALTER_TABLE = new RegExp(
  `\\balter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?${QUALIFIED}`,
);
const COLUMN_CHANGES = new RegExp(
  `\\b(?:add|drop)\\s+column\\s+(?:if\\s+(?:not\\s+)?exists\\s+)?(${IDENTIFIER})`,
  'g',
);
const CONSTRAINT_ADDITIONS = new RegExp(
  `\\b(?:add|drop)\\s+constraint\\s+(?:if\\s+exists\\s+)?(${IDENTIFIER})`,
  'g',
);
const COLUMN_RETYPES = new RegExp(`\\balter\\s+column\\s+(${IDENTIFIER})`, 'g');
const COLUMN_RENAMES = new RegExp(
  `\\brename\\s+column\\s+(${IDENTIFIER})\\s+to\\s+(${IDENTIFIER})`,
  'g',
);
const TABLE_RENAMES = new RegExp(`\\brename\\s+to\\s+(${IDENTIFIER})`, 'g');
const RLS_TOGGLE = /\b(?:enable|disable)\s+row\s+level\s+security\b/;
const NON_TRANSACTIONAL_STATEMENT =
  /\bconcurrently\b|\bvacuum\b|\breindex\b|\balter\s+system\b|\b(?:create|drop)\s+database\b|\balter\s+type\s+[^;]*\badd\s+value\b/;
const DROPPED_TABLES = new RegExp(`\\bdrop\\s+table\\s+(?:if\\s+exists\\s+)?${QUALIFIED}`, 'g');
const TABLE_SCOPED_KINDS = new Set(['column', 'constraint', 'row level security on']);

function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

function bareName(identifier) {
  return identifier.replace(/^"|"$/g, '').toLowerCase();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function declaredObjects(sql) {
  const objects = [];
  const seen = new Set();
  const add = (kind, name, table) => {
    const owner = table ? bareName(table) : null;
    const key = `${kind}\u0000${owner ?? ''}\u0000${bareName(name)}`;
    if (seen.has(key)) return;
    seen.add(key);
    objects.push({ kind, name: bareName(name), table: owner });
  };

  for (const statement of stripSqlComments(sql).toLowerCase().split(';')) {
    for (const { kind, pattern, tableGroup } of DECLARATION_PATTERNS) {
      for (const match of statement.matchAll(new RegExp(pattern, 'g'))) {
        add(kind, match[1], tableGroup ? match[tableGroup] : null);
      }
    }

    const table = ALTER_TABLE.exec(statement)?.[1];
    if (!table) continue;
    for (const match of statement.matchAll(COLUMN_CHANGES)) add('column', match[1], table);
    for (const match of statement.matchAll(COLUMN_RETYPES)) add('column', match[1], table);
    for (const match of statement.matchAll(COLUMN_RENAMES)) {
      add('column', match[1], table);
      add('column', match[2], table);
    }
    for (const match of statement.matchAll(CONSTRAINT_ADDITIONS))
      add('constraint', match[1], table);
    for (const match of statement.matchAll(TABLE_RENAMES)) add('table', match[1], null);
    if (RLS_TOGGLE.test(statement)) add('row level security on', table, table);
  }
  return objects;
}

export function unreversedObjects(upSql, downSql) {
  const down = stripSqlComments(downSql).toLowerCase();
  const statements = down.split(';');
  const droppedTables = new Set(
    [...down.matchAll(DROPPED_TABLES)].map((match) => bareName(match[1])),
  );
  return declaredObjects(upSql).filter((object) => {
    if (object.table && droppedTables.has(object.table)) return false;
    const namesObject = new RegExp(`\\b${escapeRegExp(object.name)}\\b`);

    if (object.table && TABLE_SCOPED_KINDS.has(object.kind)) {
      const namesTable = new RegExp(`\\b${escapeRegExp(object.table)}\\b`);
      return !statements.some(
        (statement) => namesObject.test(statement) && namesTable.test(statement),
      );
    }
    return !namesObject.test(down);
  });
}

function ledgerRetraction(downSql, upFilename) {
  const pattern = new RegExp(
    `delete\\s+from\\s+(?:public\\s*\\.\\s*)?schema_migrations\\b[^;]*'${escapeRegExp(upFilename)}'`,
  );
  return pattern.test(stripSqlComments(downSql).toLowerCase());
}

export function reversalErrors(upFilename, upSql, downSql) {
  const errors = [];
  const body = stripSqlComments(downSql).trim().toLowerCase();
  const downPath = `${DOWN_MIGRATIONS_DIR}/${upFilename.replace(/\.sql$/, '.down.sql')}`;

  if (body.length === 0) {
    errors.push(`${downPath} has no SQL. A placeholder reversal is worse than an absent one.`);
    return errors;
  }

  const claimsNonTransactional = /^--\s*non-transactional:\s*\S/m.test(downSql);
  if (claimsNonTransactional && !NON_TRANSACTIONAL_STATEMENT.test(body)) {
    errors.push(
      `${downPath} declares '-- non-transactional:' but contains no statement Postgres ` +
        `refuses in a transaction block (CONCURRENTLY, VACUUM, REINDEX, ALTER TYPE ... ADD ` +
        `VALUE, CREATE/DROP DATABASE, ALTER SYSTEM). Drop the comment and wrap it in BEGIN/COMMIT.`,
    );
  }

  if (!claimsNonTransactional) {
    if (!/^begin\s*;/.test(body)) {
      errors.push(
        `${downPath} must open with BEGIN so a failed reversal leaves no partial schema.`,
      );
    }
    if (!/\bcommit\s*;?\s*$/.test(body)) {
      errors.push(
        `${downPath} must end with COMMIT so a failed reversal leaves no partial schema.`,
      );
    }
  }

  if (!ledgerRetraction(downSql, upFilename)) {
    errors.push(
      `${downPath} must delete its own ledger row ` +
        `(delete from public.schema_migrations where filename = '${upFilename}'), ` +
        `or db:migrate will never re-apply ${upFilename}.`,
    );
  }

  const unreversed = unreversedObjects(upSql, downSql);
  if (unreversed.length > 0) {
    errors.push(
      `${downPath} never names ` +
        `${unreversed.map((object) => (object.table && TABLE_SCOPED_KINDS.has(object.kind) ? `${object.kind} ${object.table}.${object.name}` : `${object.kind} ${object.name}`)).join(', ')}, ` +
        `which ${upFilename} creates, drops or changes. A reversal must undo every object its ` +
        `migration touches.`,
    );
  }
  return errors;
}

const RECREATABLE_KINDS = ['policy', 'constraint', 'function', 'index'];

const UNCONDITIONALLY_DESTRUCTIVE = [
  { pattern: /\bdrop\s+table\b/, describe: () => 'DROP TABLE' },
  { pattern: /\bdrop\s+column\b/, describe: () => 'DROP COLUMN' },
  { pattern: /\btruncate\b/, describe: () => 'TRUNCATE' },
  { pattern: /\bdelete\s+from\b/, describe: () => 'DELETE FROM' },
  { pattern: /\balter\s+column\s+[^;]*?\stype\s/, describe: () => 'ALTER COLUMN ... TYPE' },
  { pattern: /\bdrop\s+type\b/, describe: () => 'DROP TYPE' },
  { pattern: /\bdrop\s+(?:materialized\s+)?view\b/, describe: () => 'DROP VIEW' },
  { pattern: /\bdrop\s+sequence\b/, describe: () => 'DROP SEQUENCE' },
];

function statementsOf(sql) {
  return stripSqlComments(sql).toLowerCase().split(';');
}

export function createdTables(sql) {
  const pattern = new RegExp(`\\bcreate\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${QUALIFIED}`, 'g');
  return new Set(
    [...stripSqlComments(sql).toLowerCase().matchAll(pattern)].map((match) => bareName(match[1])),
  );
}

function recreatesAfterDrop(body, kind, name) {
  const escaped = escapeRegExp(name);
  const created = new RegExp(
    `\\bcreate\\s+(?:or\\s+replace\\s+)?(?:unique\\s+)?${kind}\\s+(?:concurrently\\s+)?` +
      `(?:if\\s+not\\s+exists\\s+)?(?:public\\s*\\.\\s*)?"?${escaped}\\b`,
  );
  if (created.test(body)) return true;
  return kind === 'constraint' && new RegExp(`\\badd\\s+constraint\\s+"?${escaped}\\b`).test(body);
}

/**
 * Statements that lose data or break the release already running. A drop that
 * the same migration re-creates is a redefinition, not a loss, so it is not
 * counted.
 */
export function destructiveStatements(sql) {
  const body = stripSqlComments(sql).toLowerCase();
  const created = createdTables(sql);
  const found = [];

  for (const { pattern, describe } of UNCONDITIONALLY_DESTRUCTIVE) {
    if (pattern.test(body)) found.push(describe());
  }

  for (const statement of statementsOf(sql)) {
    const table = ALTER_TABLE.exec(statement)?.[1];
    if (!table || created.has(bareName(table))) continue;
    if (/\bset\s+not\s+null\b/.test(statement)) {
      found.push(`SET NOT NULL on the populated table ${bareName(table)}`);
    }
  }

  for (const kind of RECREATABLE_KINDS) {
    const dropped = new RegExp(
      `\\bdrop\\s+${kind}\\s+(?:concurrently\\s+)?(?:if\\s+exists\\s+)?${QUALIFIED}`,
      'g',
    );
    for (const match of body.matchAll(dropped)) {
      const name = bareName(match[1]);
      if (!recreatesAfterDrop(body, kind, name)) found.push(`DROP ${kind.toUpperCase()} ${name}`);
    }
  }

  return [...new Set(found)];
}

// These migrations predate the marker and are already applied in production.
// Adding the comment would change their checksum, which the ledger reads as
// drift, so the waiver is frozen: the set may shrink, never grow.
export const UNMARKED_DESTRUCTIVE_BASELINE = new Set([
  '0017_github.sql',
  '0020_functions.sql',
  '0026_hash_cloud_managed_waitlist_email.sql',
  '0027_restore_cloud_managed_waitlist_email.sql',
  '0031_drop_legacy_user_id_mapping.sql',
  '0038_cloud_sync_versioning.sql',
  '0040_memory_cloud_sync.sql',
  '0041_projects_cloud_sync.sql',
  '0042_settings_cloud_sync.sql',
  '0053_projects_managed_cloud_contract.sql',
  '0057_durable_scheduling.sql',
  '0058_drop_legacy_teams.sql',
  '0060_free_tier_token_budget.sql',
  '0073_tenancy_foundation.sql',
  '0078_conversation_branching_runtime.sql',
  '0079_desktop_release_channels.sql',
  '0086_org_shared_ecosystem.sql',
  '0090_shared_project_knowledge_read_only.sql',
  '0092_sso_domain_uniqueness_on_verified_only.sql',
  '0101_sync_and_search_indexes.sql',
  '0109_web_plugin_installations.sql',
  '0110_active_workspace_content_scope.sql',
  '0135_project_scoped_memory.sql',
  '0137_user_content_rls_coverage.sql',
  '0175_plugin_marketplace_uploads.sql',
  '0185_org_shared_artifact_policy_recursion.sql',
  '0193_user_memories_drop_transition_index.sql',
  '0201_workspace_policy_layers_and_revisions.sql',
  '0202_retrieval_index.sql',
  '0232_plugin_package_signing_and_permission_review.sql',
  '0234_workspaces_membership_status_and_installations.sql',
  '0244_archived_resources_leave_ai_retrieval.sql',
  '0248_permission_namespaces_and_scim_group_membership_lock.sql',
  '0253_connector_accounts.sql',
]);

const DESTRUCTIVE_MARKER = /^--\s*destructive:\s*\S/m;

export function destructiveMarkerErrors(filename, sql) {
  const statements = destructiveStatements(sql);
  const declared = DESTRUCTIVE_MARKER.test(sql);
  const waived = UNMARKED_DESTRUCTIVE_BASELINE.has(filename);

  if (statements.length === 0) {
    if (declared) {
      return [
        `${MIGRATIONS_DIR}/${filename} declares '-- destructive:' but drops, truncates, ` +
          `retypes or deletes nothing. Remove the marker so it keeps meaning something.`,
      ];
    }
    if (waived) {
      return [
        `${MIGRATIONS_DIR}/${filename} is in UNMARKED_DESTRUCTIVE_BASELINE but no longer ` +
          `contains a destructive statement. Remove it from the set.`,
      ];
    }
    return [];
  }

  if (declared || waived) return [];
  return [
    `${MIGRATIONS_DIR}/${filename} performs ${statements.join(', ')} without a ` +
      `'-- destructive: <why the data or the running release can be given up>' marker. ` +
      `A reversal restores the schema, never the rows, so the decision has to be written down.`,
  ];
}

const ADD_COLUMN = new RegExp(
  `\\badd\\s+column\\s+(?:if\\s+not\\s+exists\\s+)?(${IDENTIFIER})`,
  'g',
);

function addColumnClause(statement, start) {
  let depth = 0;
  for (let index = start; index < statement.length; index += 1) {
    const character = statement[index];
    if (character === '(') depth += 1;
    else if (character === ')') depth -= 1;
    else if (character === ',' && depth === 0) return statement.slice(start, index);
  }
  return statement.slice(start);
}

/**
 * Changes that leave the release already serving traffic unable to read or
 * write the table. Expand/contract does each of them in two migrations with a
 * deploy between, so neither release ever sees a shape it cannot use.
 */
export function expandContractErrors(filename, sql) {
  const errors = [];
  const created = createdTables(sql);
  const droppedColumnsFrom = new Set();
  const addedColumnsTo = new Set();

  for (const statement of statementsOf(sql)) {
    const rawTable = ALTER_TABLE.exec(statement)?.[1];
    if (!rawTable) continue;
    const table = bareName(rawTable);
    if (created.has(table)) continue;

    for (const match of statement.matchAll(COLUMN_RENAMES)) {
      errors.push(
        `${MIGRATIONS_DIR}/${filename} renames ${table}.${bareName(match[1])} to ` +
          `${bareName(match[2])}. The running release still writes the old name. Add the new ` +
          `column, backfill it, and drop the old one in a later migration.`,
      );
    }
    for (const match of statement.matchAll(TABLE_RENAMES)) {
      errors.push(
        `${MIGRATIONS_DIR}/${filename} renames table ${table} to ${bareName(match[1])}. The ` +
          `running release still queries ${table}. Create the new table, migrate the reads, ` +
          `then drop ${table} in a later migration.`,
      );
    }

    for (const match of statement.matchAll(ADD_COLUMN)) {
      const clause = addColumnClause(statement, (match.index ?? 0) + match[0].length);
      if (/\bnot\s+null\b/.test(clause) && !/\bdefault\b/.test(clause)) {
        errors.push(
          `${MIGRATIONS_DIR}/${filename} adds ${table}.${bareName(match[1])} as NOT NULL with ` +
            `no DEFAULT. Every INSERT the running release issues omits it and fails. Ship it ` +
            `nullable or with a default, then tighten it once the writers are deployed.`,
        );
      }
      addedColumnsTo.add(table);
    }
    if (/\bdrop\s+column\b/.test(statement)) droppedColumnsFrom.add(table);
  }

  for (const table of droppedColumnsFrom) {
    if (!addedColumnsTo.has(table) || UNMARKED_DESTRUCTIVE_BASELINE.has(filename)) continue;
    errors.push(
      `${MIGRATIONS_DIR}/${filename} adds and drops columns on ${table} in one migration, ` +
        `which is the expand and the contract in a single step. Split them so a rollback has ` +
        `a schema to land on.`,
    );
  }

  return errors;
}

export const BLANKET_GRANT_BASELINE = '0037_rls_user_isolation.sql';

const BLANKET_GRANT = /\bgrant\b[^;]*\bon\s+all\s+tables\s+in\s+schema\s+public\b/;

export function blanketGrantErrors(filename, sql) {
  if (filename === BLANKET_GRANT_BASELINE) return [];
  if (!BLANKET_GRANT.test(stripSqlComments(sql).toLowerCase())) return [];
  return [
    `${MIGRATIONS_DIR}/${filename} issues GRANT ... ON ALL TABLES IN SCHEMA public, which silently ` +
      `re-grants UPDATE and DELETE on the append-only tables that later migrations revoked them from ` +
      `(security_audit_logs in 0043, enterprise_audit_events in 0087, consent_records in 0116). ` +
      `Grant table by table; ${BLANKET_GRANT_BASELINE} is the only migration allowed to do this.`,
  ];
}

const DOLLAR_TAG = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/;

function skipDelimited(sql, start, quote) {
  let index = start + 1;
  while (index < sql.length) {
    if (sql[index] !== quote) {
      index += 1;
      continue;
    }
    if (sql[index + 1] === quote) {
      index += 2;
      continue;
    }
    return index + 1;
  }
  return -1;
}

export function quotingErrors(displayPath, sql) {
  const errors = [];
  const lineAt = (index) => {
    let line = 1;
    for (let cursor = 0; cursor < index; cursor += 1) if (sql[cursor] === '\n') line += 1;
    return line;
  };

  let index = 0;
  while (index < sql.length) {
    const character = sql[index];

    if (character === '-' && sql[index + 1] === '-') {
      const newline = sql.indexOf('\n', index);
      index = newline === -1 ? sql.length : newline + 1;
      continue;
    }

    if (character === '/' && sql[index + 1] === '*') {
      let depth = 1;
      index += 2;
      while (index < sql.length && depth > 0) {
        if (sql[index] === '/' && sql[index + 1] === '*') {
          depth += 1;
          index += 2;
        } else if (sql[index] === '*' && sql[index + 1] === '/') {
          depth -= 1;
          index += 2;
        } else {
          index += 1;
        }
      }
      if (depth > 0) errors.push(`${displayPath} has an unterminated /* block comment.`);
      continue;
    }

    if (character === '$') {
      const tag = DOLLAR_TAG.exec(sql.slice(index))?.[0];
      if (tag) {
        const close = sql.indexOf(tag, index + tag.length);
        if (close === -1) {
          errors.push(
            `${displayPath}:${lineAt(index)} opens dollar-quote ${tag} that is never closed.`,
          );
          break;
        }
        index = close + tag.length;
        continue;
      }
    }

    if (character === "'" || character === '"') {
      const close = skipDelimited(sql, index, character);
      if (close === -1) {
        const kind = character === "'" ? 'string literal' : 'quoted identifier';
        errors.push(
          `${displayPath}:${lineAt(index)} opens a ${kind} that is never closed. An apostrophe ` +
            `inside a literal must be doubled ('') or Postgres aborts the whole migration.`,
        );
        break;
      }
      index = close;
      continue;
    }

    index += 1;
  }

  return errors;
}

export function topLevelStatements(sql) {
  const statements = [];
  let current = '';
  let index = 0;
  while (index < sql.length) {
    const character = sql[index];

    if (character === '-' && sql[index + 1] === '-') {
      const newline = sql.indexOf('\n', index);
      index = newline === -1 ? sql.length : newline + 1;
      current += ' ';
      continue;
    }

    if (character === '/' && sql[index + 1] === '*') {
      const close = sql.indexOf('*/', index + 2);
      index = close === -1 ? sql.length : close + 2;
      current += ' ';
      continue;
    }

    if (character === '$') {
      const tag = DOLLAR_TAG.exec(sql.slice(index))?.[0];
      if (tag) {
        const close = sql.indexOf(tag, index + tag.length);
        index = close === -1 ? sql.length : close + tag.length;
        current += ' $body$ ';
        continue;
      }
    }

    if (character === "'" || character === '"') {
      const close = skipDelimited(sql, index, character);
      index = close === -1 ? sql.length : close;
      current += ` ${character}${character} `;
      continue;
    }

    if (character === ';') {
      statements.push(current);
      current = '';
      index += 1;
      continue;
    }

    current += character;
    index += 1;
  }
  statements.push(current);
  return statements
    .map((statement) => statement.replace(/\s+/g, ' ').trim().toLowerCase())
    .filter((statement) => statement.length > 0);
}

const TRANSACTION_OPEN = /^(?:begin|start transaction)(?: (?:work|transaction|isolation .*))?$/;
const TRANSACTION_CLOSE = /^(?:commit|end)(?: (?:work|transaction))?$/;

/**
 * Migrations that commit in stages. Each is checksummed in every ledger that
 * applied it, so its body cannot change; the set may shrink, never grow.
 */
export const STAGED_COMMIT_BASELINE = new Map([
  [
    '0182_managed_usage_microusd_ledger.sql',
    'moves the credit ledger to microUSD in six blocks, each committed before the next begins',
  ],
  [
    '0243_billing_contract_term_ordering.sql',
    'adds the term ordering constraint NOT VALID and validates it in a second commit',
  ],
  [
    '0281_managed_usage_overage_classification.sql',
    'classifies overage requests, then backfills requests and ledger rows, in three commits',
  ],
]);

export function transactionControlErrors(filename, sql) {
  const statements = topLevelStatements(sql);
  const opens = statements.flatMap((statement, at) =>
    TRANSACTION_OPEN.test(statement) ? [at] : [],
  );
  const closes = statements.flatMap((statement, at) =>
    TRANSACTION_CLOSE.test(statement) ? [at] : [],
  );
  const runnerOwnsTransaction = opens.length === 0 && closes.length === 0;
  const oneEnclosingBlock =
    opens.length === 1 &&
    closes.length === 1 &&
    opens[0] === 0 &&
    closes[0] === statements.length - 1;
  const atomic = runnerOwnsTransaction || oneEnclosingBlock;

  if (STAGED_COMMIT_BASELINE.has(filename)) {
    return atomic
      ? [
          `STAGED_COMMIT_BASELINE names ${filename}, which now applies in one transaction. ` +
            `Remove it from the set.`,
        ]
      : [];
  }
  if (atomic) return [];

  const shape =
    opens.length > 1 || closes.length > 1
      ? `${Math.max(opens.length, closes.length)} transaction blocks`
      : 'a statement outside its BEGIN ... COMMIT';
  return [
    `${MIGRATIONS_DIR}/${filename} has ${shape}. The runner applies a migration inside one ` +
      `transaction and writes its ledger row after the last statement; a COMMIT part way through ` +
      `ends that transaction early, so a later failure leaves the earlier part applied and no ` +
      `ledger row saying so. Keep every statement inside one BEGIN ... COMMIT, leave transaction ` +
      `control to the runner, or split the stages into consecutive migrations.`,
  ];
}

function checkDownMigrations(root, upFilenames, errors) {
  const downDir = path.join(root, DOWN_MIGRATIONS_DIR);
  const downFilenames = fs.existsSync(downDir)
    ? fs
        .readdirSync(downDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
        .map((entry) => entry.name)
        .sort()
    : [];

  for (const filename of downFilenames) {
    errors.push(
      ...quotingErrors(
        `${DOWN_MIGRATIONS_DIR}/${filename}`,
        fs.readFileSync(path.join(downDir, filename), 'utf8'),
      ),
    );
  }

  for (const filename of upFilenames) {
    if (filename.endsWith('.down.sql')) {
      errors.push(
        `${MIGRATIONS_DIR}/${filename} is a reversal in the forward directory, where the ` +
          `runner would apply it. Move it to ${DOWN_MIGRATIONS_DIR}/.`,
      );
    }
  }

  const upByDownName = new Map(
    upFilenames
      .filter((filename) => !filename.endsWith('.down.sql'))
      .map((filename) => [filename.replace(/\.sql$/, '.down.sql'), filename]),
  );

  for (const filename of downFilenames) {
    if (!upByDownName.has(filename)) {
      errors.push(
        `${DOWN_MIGRATIONS_DIR}/${filename} reverses no migration. Renumbering or renaming a ` +
          `migration must rename its reversal with it.`,
      );
    }
  }

  const lowestReversal = downFilenames
    .map((filename) => Number(filename.slice(0, 4)))
    .filter((ordinal) => Number.isInteger(ordinal))
    .sort((first, second) => first - second)[0];
  if (lowestReversal !== undefined && lowestReversal < FIRST_REVERSIBLE_MIGRATION) {
    errors.push(
      `FIRST_REVERSIBLE_MIGRATION is ${FIRST_REVERSIBLE_MIGRATION} but ${DOWN_MIGRATIONS_DIR} ` +
        `already reverses ${String(lowestReversal).padStart(4, '0')}. Lower it to ${lowestReversal} ` +
        `because the covered window may widen, never narrow.`,
    );
  }

  for (const [downName, upName] of upByDownName) {
    if (Number(upName.slice(0, 4)) < FIRST_REVERSIBLE_MIGRATION) continue;
    if (!downFilenames.includes(downName)) {
      errors.push(
        `${MIGRATIONS_DIR}/${upName} ships no reversal. Write ${DOWN_MIGRATIONS_DIR}/${downName} ` +
          `See ${DOWN_MIGRATIONS_DIR}/README.md for what it has to contain.`,
      );
      continue;
    }
    errors.push(
      ...reversalErrors(
        upName,
        fs.readFileSync(path.join(root, MIGRATIONS_DIR, upName), 'utf8'),
        fs.readFileSync(path.join(downDir, downName), 'utf8'),
      ),
    );
  }
}

function checkNeonMigrations(root) {
  const errors = [];
  const absolute = (relativePath) => path.join(root, relativePath);

  if (!fs.existsSync(absolute(MIGRATIONS_DIR))) {
    errors.push(`Missing Neon migration directory: ${MIGRATIONS_DIR}`);
  } else {
    const files = fs
      .readdirSync(absolute(MIGRATIONS_DIR), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
      .map((entry) => entry.name)
      .sort();

    if (files.length === 0) {
      errors.push(`${MIGRATIONS_DIR} must contain at least one SQL migration.`);
    }

    const byOrdinal = new Map();
    for (const filename of files) {
      if (!/^\d{4}_.+\.sql$/.test(filename)) {
        errors.push(`${MIGRATIONS_DIR}/${filename} must use <sequence>_<name>.sql naming.`);
        continue;
      }
      const ordinal = filename.slice(0, 4);
      if (!byOrdinal.has(ordinal)) byOrdinal.set(ordinal, []);
      byOrdinal.get(ordinal).push(filename);
    }
    for (const [ordinal, group] of byOrdinal) {
      if (group.length > 1) {
        errors.push(
          `${MIGRATIONS_DIR} has ${group.length} migrations sharing ordinal ${ordinal}: ` +
            `${group.join(', ')}. Renumber all but one; apply order must be unambiguous.`,
        );
      }
    }

    checkDownMigrations(root, files, errors);

    const sources = new Map(
      files.map((filename) => [
        filename,
        fs.readFileSync(absolute(path.join(MIGRATIONS_DIR, filename)), 'utf8'),
      ]),
    );
    for (const [filename, sql] of sources) {
      errors.push(...blanketGrantErrors(filename, sql));
      errors.push(...quotingErrors(`${MIGRATIONS_DIR}/${filename}`, sql));
      errors.push(...destructiveMarkerErrors(filename, sql));
      errors.push(...expandContractErrors(filename, sql));
      errors.push(...transactionControlErrors(filename, sql));
    }

    for (const filename of STAGED_COMMIT_BASELINE.keys()) {
      if (!sources.has(filename)) {
        errors.push(
          `STAGED_COMMIT_BASELINE names ${filename}, which ${MIGRATIONS_DIR} no longer contains. ` +
            `Remove it from the set.`,
        );
      }
    }

    for (const filename of UNMARKED_DESTRUCTIVE_BASELINE) {
      if (!sources.has(filename)) {
        errors.push(
          `UNMARKED_DESTRUCTIVE_BASELINE names ${filename}, which ${MIGRATIONS_DIR} no longer ` +
            `contains. Remove it from the set.`,
        );
      }
    }

    const migrationHistory = [...sources.values()].join('\n').toLowerCase();
    const requiredProjectColumns = [
      'organization_id',
      'default_privacy_mode',
      'default_provider_mode',
      'allowed_surfaces',
      'default_model_id',
      'last_used_at',
      'icon_emoji',
      'accent_color',
      'imported_from',
    ];
    for (const column of requiredProjectColumns) {
      if (!migrationHistory.includes(`add column if not exists ${column}`)) {
        errors.push(
          `${MIGRATIONS_DIR} has production code for user_projects.${column} but no canonical ADD COLUMN migration.`,
        );
      }
    }
  }

  try {
    for (const missing of missingRouteTableMigrations(root)) {
      const evidence = missing.locations
        .slice(0, 3)
        .map((location) => `${location.file}:${location.line}`)
        .join(', ');
      errors.push(
        `Route code references ${missing.table}, but canonical migrations create no table/view with that name (${evidence}).`,
      );
    }
  } catch (error) {
    errors.push(
      `Migration inventory is unreadable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const retiredDbDir = 'supa' + 'base';
  for (const removedDir of [retiredDbDir, `apps/web/${retiredDbDir}`]) {
    if (fs.existsSync(absolute(removedDir))) {
      errors.push(`${removedDir} must not exist. Neon migrations live in ${MIGRATIONS_DIR}.`);
    }
  }

  return errors;
}

function main() {
  const errors = checkNeonMigrations(process.cwd());
  if (errors.length > 0) {
    console.error('Neon migration check failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log('Neon migration check passed.');
}

function isEntryPoint() {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  const realpath = (value) => {
    try {
      return fs.realpathSync(value);
    } catch {
      return value;
    }
  };
  return realpath(fileURLToPath(import.meta.url)) === realpath(path.resolve(entry));
}

if (isEntryPoint()) main();

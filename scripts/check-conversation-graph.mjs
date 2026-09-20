#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = 'apps/web/db/neon';
const CONTRACT = 'packages/contracts/cloud-contracts/src/conversations.ts';

const TABLES = Object.freeze({
  conversation: 'web_conversations',
  message: 'web_messages',
});

const WIRE_SCHEMAS = Object.freeze({
  conversation: 'ManagedCloudConversationWireSchema',
  message: 'ManagedCloudMessageWireSchema',
});

/**
 * Columns the transcript wire deliberately never carries, each with the reason
 * it stays server side. A new column absent from both this map and the wire
 * fails the guard, so the two sides cannot drift apart unnoticed.
 */
const SERVER_ONLY_COLUMNS = Object.freeze({
  conversation: Object.freeze({
    user_id: 'the owner is the caller, never a field the caller is told',
    deleted_at: 'a deleted conversation is not served at all',
    folder_id: 'folders are read through their own listing',
    compaction_summary: 'compaction is a server input to the next turn',
    compaction_summary_through_message_id: 'compaction is a server input to the next turn',
    compaction_summary_digest: 'compaction is a server input to the next turn',
    activated_at: 'lifecycle bookkeeping the reader sees as the conversation simply existing',
    server_version: 'the concurrency token the sync route compares, not a transcript field',
    created_by: 'provenance is an audit field, not a transcript field',
    updated_by: 'provenance is an audit field, not a transcript field',
    origin_surface: 'provenance is an audit field, not a transcript field',
  }),
  message: Object.freeze({
    conversation_id: 'the reader already addressed the conversation to get here',
    cost_cents: 'cost is billing, served by the usage surfaces',
    updated_at: 'an edit is a new sibling row, so the reader never reads this',
    deleted_at: 'a deleted turn is not served at all',
    server_version: 'the concurrency token the sync route compares, not a transcript field',
    created_by: 'provenance is an audit field, not a transcript field',
    updated_by: 'provenance is an audit field, not a transcript field',
    origin_surface: 'provenance is an audit field, not a transcript field',
  }),
});

/** Wire fields the server computes per request rather than storing on the row. */
const DERIVED_WIRE_FIELDS = Object.freeze({
  conversation: Object.freeze({
    work_mode:
      "read from the conversation's first agent run, so a later turn in Chat cannot erase the mode a task started in",
  }),
  message: Object.freeze({}),
});

/** Constraints the thread depends on, in the words the migration has to use. */
const REQUIRED_CONSTRAINTS = Object.freeze([
  {
    column: 'parent_id',
    pattern: /parent_id uuid references public\.web_messages\(id\)(?!\s+on delete)/i,
    detail:
      'web_messages.parent_id must reference web_messages(id) with no delete action, so orphaning a thread fails loudly',
  },
  {
    column: 'active_leaf_message_id',
    pattern:
      /active_leaf_message_id uuid\s*references public\.web_messages\(id\) on delete set null/i,
    detail:
      'web_conversations.active_leaf_message_id must clear itself on delete, so a stale leaf degrades to linear rather than dangling',
  },
]);

function read(root, relative) {
  return readFileSync(path.join(root, relative), 'utf8');
}

function migrationSources(root) {
  const absolute = path.join(root, MIGRATIONS_DIR);
  if (!existsSync(absolute)) throw new Error(`${MIGRATIONS_DIR} does not exist`);
  return readdirSync(absolute)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: read(root, `${MIGRATIONS_DIR}/${name}`) }));
}

function withoutComments(sql) {
  return sql.replace(/^\s*--.*$/gm, '');
}

/** Every column the migrations give a table, in the order they arrive. */
export function columnsOf(migrations, table) {
  const columns = new Set();
  const created = new RegExp(
    `create table\\s+(?:if not exists\\s+)?(?:public\\.)?${table}\\s*\\(([\\s\\S]*?)\\n\\s*\\);`,
    'i',
  );
  const altered = new RegExp(
    `alter table\\s+(?:if exists\\s+)?(?:public\\.)?${table}\\b([\\s\\S]*?);`,
    'gi',
  );

  for (const { sql } of migrations) {
    const body = withoutComments(sql);
    const creation = created.exec(body);
    if (creation) {
      for (const line of creation[1].split('\n')) {
        const name = /^\s*([a-z_][a-z0-9_]*)\s+[a-z]/i.exec(line);
        if (name && !/^(primary|foreign|unique|check|constraint)$/i.test(name[1])) {
          columns.add(name[1].toLowerCase());
        }
      }
    }
    for (const statement of body.matchAll(altered)) {
      for (const added of statement[1].matchAll(
        /add column\s+(?:if not exists\s+)?([a-z_][a-z0-9_]*)/gi,
      )) {
        columns.add(added[1].toLowerCase());
      }
      for (const dropped of statement[1].matchAll(
        /drop column\s+(?:if exists\s+)?([a-z_][a-z0-9_]*)/gi,
      )) {
        columns.delete(dropped[1].toLowerCase());
      }
    }
  }
  return columns;
}

/** The field names one wire schema declares. */
export function wireFieldsOf(source, schemaName) {
  const declaration = new RegExp(
    `export const ${schemaName} = z\\.object\\(\\{([\\s\\S]*?)\\n\\}\\)`,
  ).exec(source);
  if (!declaration) throw new Error(`${CONTRACT} declares no ${schemaName}`);
  return new Set(
    [...declaration[1].matchAll(/^\s{2}([a-z_][a-z0-9_]*):/gim)].map((match) =>
      match[1].toLowerCase(),
    ),
  );
}

export function runConversationGraphGuard(root = process.cwd()) {
  const findings = [];
  const migrations = migrationSources(root);
  const contract = read(root, CONTRACT);
  const allSql = migrations.map((migration) => withoutComments(migration.sql)).join('\n');

  let checked = 0;
  for (const [side, table] of Object.entries(TABLES)) {
    const columns = columnsOf(migrations, table);
    if (columns.size === 0) {
      findings.push(`${MIGRATIONS_DIR}: no migration defines ${table}`);
      continue;
    }
    const wire = wireFieldsOf(contract, WIRE_SCHEMAS[side]);
    const serverOnly = SERVER_ONLY_COLUMNS[side];
    const derived = DERIVED_WIRE_FIELDS[side];
    checked += columns.size;

    for (const field of wire) {
      if (!columns.has(field) && !(field in derived)) {
        findings.push(
          `${CONTRACT}: ${WIRE_SCHEMAS[side]} promises '${field}', which no migration gives ${table} and nothing records as derived`,
        );
      }
    }
    for (const field of Object.keys(derived)) {
      if (!wire.has(field)) {
        findings.push(`${CONTRACT}: '${field}' is recorded as derived but ${table} never sends it`);
      }
      if (columns.has(field)) {
        findings.push(`${table}.${field} is recorded as derived yet the table stores it`);
      }
    }
    for (const column of columns) {
      if (wire.has(column) || column in serverOnly) continue;
      findings.push(
        `${table}.${column} is neither on the ${WIRE_SCHEMAS[side]} wire nor recorded as server side with a reason`,
      );
    }
    for (const column of Object.keys(serverOnly)) {
      if (!columns.has(column)) {
        findings.push(`${table}.${column} is recorded as server side but no longer exists`);
      }
      if (wire.has(column)) {
        findings.push(
          `${table}.${column} is recorded as server side yet ${WIRE_SCHEMAS[side]} carries it`,
        );
      }
    }
  }

  for (const constraint of REQUIRED_CONSTRAINTS) {
    if (!constraint.pattern.test(allSql)) findings.push(`${MIGRATIONS_DIR}: ${constraint.detail}`);
  }

  const summary =
    findings.length === 0
      ? `conversation graph: ${checked} columns across ${Object.values(TABLES).join(' and ')} agree with the wire, ${REQUIRED_CONSTRAINTS.length} thread constraints intact`
      : findings.join('\n');
  return { findings, summary };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const result = runConversationGraphGuard();
    const stream = result.findings.length === 0 ? process.stdout : process.stderr;
    stream.write(`${result.summary}\n`);
    if (result.findings.length > 0) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`Conversation graph guard could not run: ${error.message}\n`);
    process.exitCode = 2;
  }
}

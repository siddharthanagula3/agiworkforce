import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOURCE_PATH = fileURLToPath(new URL('./rls-probe.mjs', import.meta.url));
const source = readFileSync(SOURCE_PATH, 'utf8');

const RLS_TABLES = [
  ...source.match(/const RLS_TABLES = \[([\s\S]*?)\];/)[1].matchAll(/'([a-z_]+)'/g),
].map((match) => match[1]);

const CONTENT_ROOT_TABLES_0073 = [
  'web_conversations',
  'user_projects',
  'web_artifacts',
  'user_memories',
  'media_assets',
  'scheduled_tasks',
  'cloud_agent_runs',
  'user_connectors',
  'user_custom_connectors',
  'api_keys',
  'managed_usage_requests',
  'usage_events',
];

const CONTENT_ROOT_TABLES_0137 = [
  'user_two_factor',
  'account_sessions',
  'notifications',
  'chat_folders',
  'conversation_tags',
  'message_bookmarks',
  'message_reactions',
  'user_shortcuts',
  'email_preferences',
  'search_history',
];

test('RLS_TABLES covers every 0073 tenancy-foundation content-root table', () => {
  for (const table of CONTENT_ROOT_TABLES_0073) {
    assert.ok(RLS_TABLES.includes(table), `RLS_TABLES is missing 0073 table "${table}"`);
  }
});

test('RLS_TABLES covers every 0137 user-content-rls-coverage table', () => {
  for (const table of CONTENT_ROOT_TABLES_0137) {
    assert.ok(RLS_TABLES.includes(table), `RLS_TABLES is missing 0137 table "${table}"`);
  }
});

test('the gateway/control-plane tables the probe already proved stay covered', () => {
  const original = [
    'sso_connections',
    'directory_sync_connections',
    'organization_admin_policies',
    'enterprise_audit_events',
    'organization_usage_ledger',
    'support_cases',
    'conversations',
    'messages',
    'chat_messages',
    'device_pairings',
    'agent_approval_requests',
  ];
  for (const table of original) {
    assert.ok(
      RLS_TABLES.includes(table),
      `RLS_TABLES dropped a previously-covered table "${table}"`,
    );
  }
});

test('every content-root table is both seeded and cleaned up', () => {
  const contentRootTables = [...CONTENT_ROOT_TABLES_0073, ...CONTENT_ROOT_TABLES_0137];
  for (const table of contentRootTables) {
    const insertRe = new RegExp(`insert into public\\.${table}\\b`);
    const deleteRe = new RegExp(`delete from public\\.${table}\\b`);
    assert.match(source, insertRe, `seed() has no insert for "${table}"`);
    assert.match(source, deleteRe, `cleanup() has no delete for "${table}"`);
  }
});

test('every table in RLS_TABLES is seeded once per tenant', () => {
  for (const table of RLS_TABLES) {
    const insertRe = new RegExp(`insert into public\\.${table}\\b`);
    assert.match(source, insertRe, `RLS_TABLES lists "${table}" but seed() never inserts into it`);
  }
});

test('web_messages and web_artifacts carry the fixture conversation id, not a fresh one', () => {
  assert.match(source, /webConversationId = fixture\.webConversations\[index\]/);
  assert.match(source, /webMessageId = fixture\.webMessages\[index\]/);
});

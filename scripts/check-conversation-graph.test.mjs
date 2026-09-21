import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const GUARD = path.join(REPO_ROOT, 'scripts', 'check-conversation-graph.mjs');

const sandboxes = [];
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

const CONVERSATION_SERVER_COLUMNS = [
  'user_id text not null',
  'deleted_at timestamptz',
  'folder_id uuid',
  'compaction_summary text',
  'compaction_summary_through_message_id uuid',
  'compaction_summary_digest text',
  'activated_at timestamptz',
  'server_version bigint',
  'created_by text',
  'updated_by text',
  'origin_surface text',
];

const MESSAGE_SERVER_COLUMNS = [
  'cost_cents numeric',
  'updated_at timestamptz',
  'deleted_at timestamptz',
  'server_version bigint',
  'created_by text',
  'updated_by text',
  'origin_surface text',
];

const BASE_SQL = `create table if not exists public.web_conversations (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'New Chat',
  ${CONVERSATION_SERVER_COLUMNS.join(',\n  ')},
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.web_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.web_conversations(id) on delete cascade,
  role text not null,
  content text not null,
  ${MESSAGE_SERVER_COLUMNS.join(',\n  ')},
  created_at timestamptz not null default now()
);
`;

const THREAD_SQL = `alter table public.web_messages
  add column if not exists parent_id uuid references public.web_messages(id);

alter table public.web_conversations
  add column if not exists active_leaf_message_id uuid
    references public.web_messages(id) on delete set null;
`;

const CONTRACT = `export const ManagedCloudConversationWireSchema = z.object({
  id: z.string().min(1),
  title: z.string().nullable(),
  work_mode: CloudAgentWorkModeSchema.nullable().optional(),
  active_leaf_message_id: z.string().uuid().nullable().optional(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
})

export const ManagedCloudMessageWireSchema = z.object({
  id: z.string().min(1),
  parent_id: z.string().uuid().nullable().optional(),
  role: ManagedCloudMessageRoleSchema,
  content: z.string(),
  created_at: z.string().min(1),
})
`;

function baseTree() {
  return {
    'apps/web/db/neon/0001_chat.sql': BASE_SQL,
    'apps/web/db/neon/0156_thread.sql': THREAD_SQL,
    'packages/contracts/cloud-contracts/src/conversations.ts': CONTRACT,
  };
}

function runOn(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'check-conversation-graph-'));
  sandboxes.push(dir);
  for (const [relative, contents] of Object.entries(files)) {
    if (contents === null) continue;
    const absolute = path.join(dir, relative);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents, 'utf8');
  }
  return spawnSync(process.execPath, [GUARD], { cwd: dir, encoding: 'utf8' });
}

test('the real guard passes on the repository as it stands', () => {
  const result = spawnSync(process.execPath, [GUARD], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stderr}${result.stdout}`);
});

test('a conforming synthetic tree passes', () => {
  const result = runOn(baseTree());
  assert.equal(result.status, 0, `${result.stderr}${result.stdout}`);
});

test('a column added with no wire field and no recorded reason fails', () => {
  const files = baseTree();
  files['apps/web/db/neon/0200_extra.sql'] =
    'alter table public.web_messages add column if not exists sentiment text;\n';
  const result = runOn(files);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /web_messages\.sentiment is neither on the/);
});

test('a wire field the database never had fails', () => {
  const files = baseTree();
  files['packages/contracts/cloud-contracts/src/conversations.ts'] = CONTRACT.replace(
    '  title: z.string().nullable(),',
    '  title: z.string().nullable(),\n  branch_label: z.string().nullable(),',
  );
  const result = runOn(files);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /promises 'branch_label'/);
});

test('a parent pointer that cascades on delete fails', () => {
  const files = baseTree();
  files['apps/web/db/neon/0156_thread.sql'] = THREAD_SQL.replace(
    'add column if not exists parent_id uuid references public.web_messages(id);',
    'add column if not exists parent_id uuid references public.web_messages(id) on delete cascade;',
  );
  const result = runOn(files);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /parent_id must reference web_messages\(id\) with no delete action/);
});

test('an active leaf that dangles instead of clearing fails', () => {
  const files = baseTree();
  files['apps/web/db/neon/0156_thread.sql'] = THREAD_SQL.replace(
    'references public.web_messages(id) on delete set null;',
    'references public.web_messages(id);',
  );
  const result = runOn(files);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /active_leaf_message_id must clear itself on delete/);
});

test('a migration set that defines neither table is reported rather than passed', () => {
  const files = baseTree();
  files['apps/web/db/neon/0001_chat.sql'] = '-- nothing here\n';
  files['apps/web/db/neon/0156_thread.sql'] = '-- nothing here\n';
  const result = runOn(files);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no migration defines web_conversations/);
});

test('a stale server-side entry for a column that has gone fails', () => {
  const files = baseTree();
  files['apps/web/db/neon/0001_chat.sql'] = BASE_SQL.replace('  folder_id uuid,\n', '');
  const result = runOn(files);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /folder_id is recorded as server side but no longer exists/);
});

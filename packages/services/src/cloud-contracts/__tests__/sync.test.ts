/**
 * Schema-correctness tests for the delta-sync cloud contracts
 * (/api/chat/sync, /api/memory/sync, /api/projects/sync, /api/settings/sync).
 *
 * The web-side route contract tests are the server enforcement anchors; these
 * tests pin the schemas themselves (accept the documented wire shape, reject
 * the drifts that actually bit clients before: missing envelopes, tombstone
 * fields dropped, cursor omitted).
 */

import { describe, it, expect } from 'vitest';
import {
  ChatSyncPullResponseSchema,
  ChatSyncPushResponseSchema,
  MemorySyncPullResponseSchema,
  MemorySyncPushResponseSchema,
  ProjectsSyncPullResponseSchema,
  ProjectsSyncPushResponseSchema,
  SettingsSyncPullResponseSchema,
  SettingsSyncPushResponseSchema,
} from '../sync';

const conversationDelta = {
  id: '018f6f2a-0000-7000-8000-000000000001',
  title: 'Quarterly plan',
  model: 'model-x',
  project_id: null,
  pinned: false,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-02T00:00:00.000Z',
  deleted_at: null,
  server_version: '42',
};

const messageDelta = {
  id: '018f6f2a-0000-7000-8000-000000000002',
  conversation_id: conversationDelta.id,
  role: 'assistant',
  content: 'Here is the plan…',
  model: 'model-x',
  provider: 'provider-y',
  input_tokens: 120,
  output_tokens: 480,
  cost_cents: 3,
  metadata: null,
  created_at: '2026-07-02T00:00:01.000Z',
  updated_at: '2026-07-02T00:00:01.000Z',
  deleted_at: null,
  server_version: '43',
};

const artifactDelta = {
  id: '018f6f2a-0000-7000-8000-000000000003',
  conversation_id: conversationDelta.id,
  message_id: messageDelta.id,
  title: 'plan.md',
  artifact_type: 'markdown',
  language: null,
  content: '# Plan',
  current_version: 1,
  pinned: false,
  tags: [],
  created_at: '2026-07-02T00:00:02.000Z',
  updated_at: '2026-07-02T00:00:02.000Z',
  deleted_at: null,
  server_version: '44',
};

describe('ChatSyncPullResponseSchema', () => {
  it('accepts a full pull page including tombstones', () => {
    const page = {
      conversations: [
        conversationDelta,
        { ...conversationDelta, id: 'x', deleted_at: '2026-07-03T00:00:00.000Z' },
      ],
      messages: [messageDelta],
      artifacts: [artifactDelta],
      cursor: '44',
      hasMore: false,
    };
    expect(ChatSyncPullResponseSchema.safeParse(page).success).toBe(true);
  });

  it('accepts numeric-as-string cost_cents (pg numeric serialization)', () => {
    const page = {
      conversations: [],
      messages: [{ ...messageDelta, cost_cents: '3.5' }],
      artifacts: [],
      cursor: '43',
      hasMore: false,
    };
    expect(ChatSyncPullResponseSchema.safeParse(page).success).toBe(true);
  });

  it('rejects a page missing the cursor', () => {
    const page = { conversations: [], messages: [], artifacts: [], hasMore: false };
    expect(ChatSyncPullResponseSchema.safeParse(page).success).toBe(false);
  });

  it('rejects a message delta without server_version', () => {
    const { server_version: _v, ...bad } = messageDelta;
    const page = { conversations: [], messages: [bad], artifacts: [], cursor: '0', hasMore: false };
    expect(ChatSyncPullResponseSchema.safeParse(page).success).toBe(false);
  });
});

describe('ChatSyncPushResponseSchema', () => {
  it('accepts an ack with per-entity applied rows', () => {
    const ack = {
      applied: {
        conversations: [{ id: conversationDelta.id, server_version: '45' }],
        messages: [],
        artifacts: [],
      },
      cursor: '45',
    };
    expect(ChatSyncPushResponseSchema.safeParse(ack).success).toBe(true);
  });
});

describe('MemorySync schemas', () => {
  const memoryDelta = {
    id: '018f6f2a-0000-7000-8000-000000000004',
    content: 'User prefers dark mode',
    category: 'preference',
    source: 'mobile',
    pinned: false,
    is_deleted: false,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    server_version: '7',
  };

  it('accepts a pull page with tombstones and null source', () => {
    const page = {
      memories: [memoryDelta, { ...memoryDelta, id: 'y', source: null, is_deleted: true }],
      cursor: '8',
      hasMore: false,
    };
    expect(MemorySyncPullResponseSchema.safeParse(page).success).toBe(true);
  });

  it('rejects a memory delta missing the is_deleted tombstone flag', () => {
    const { is_deleted: _d, ...bad } = memoryDelta;
    const page = { memories: [bad], cursor: '7', hasMore: false };
    expect(MemorySyncPullResponseSchema.safeParse(page).success).toBe(false);
  });

  it('accepts a push ack', () => {
    const ack = { applied: [{ id: memoryDelta.id, server_version: '9' }], cursor: '9' };
    expect(MemorySyncPushResponseSchema.safeParse(ack).success).toBe(true);
  });
});

describe('ProjectsSync schemas', () => {
  const projectDelta = {
    id: '018f6f2a-0000-7000-8000-000000000005',
    name: 'Mobile launch',
    description: null,
    instructions: 'Ship it',
    color: '#ff0000',
    is_archived: false,
    metadata: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    deleted_at: null,
    server_version: '3',
  };

  it('accepts a pull page', () => {
    const page = { projects: [projectDelta], cursor: '3', hasMore: false };
    expect(ProjectsSyncPullResponseSchema.safeParse(page).success).toBe(true);
  });

  it('accepts a push ack', () => {
    const ack = { applied: [{ id: projectDelta.id, server_version: '4' }], cursor: '4' };
    expect(ProjectsSyncPushResponseSchema.safeParse(ack).success).toBe(true);
  });
});

describe('SettingsSync schemas', () => {
  it('accepts the empty nothing-new pull response', () => {
    const page = { settings: {}, cursor: '0', hasMore: false };
    expect(SettingsSyncPullResponseSchema.safeParse(page).success).toBe(true);
  });

  it('accepts a namespaced settings document', () => {
    const page = {
      settings: { appearance: { theme: 'dark' }, chat: { sendOnEnter: true } },
      cursor: '12',
      hasMore: false,
    };
    expect(SettingsSyncPullResponseSchema.safeParse(page).success).toBe(true);
  });

  it('accepts push acks for both merged and LWW-skipped pushes', () => {
    expect(SettingsSyncPushResponseSchema.safeParse({ applied: true, cursor: '13' }).success).toBe(
      true,
    );
    expect(SettingsSyncPushResponseSchema.safeParse({ applied: false, cursor: '13' }).success).toBe(
      true,
    );
  });
});

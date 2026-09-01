import { describe, it, expect } from 'vitest';
import projectsCasGolden from '../__fixtures__/projects-sync-cas.golden.json';
import chatMemoryCasGolden from '../__fixtures__/chat-memory-sync-cas.golden.json';
import {
  ChatSyncPullResponseSchema,
  ChatSyncPushRequestSchema,
  ChatSyncPushResponseSchema,
  ConversationWireDeltaSchema,
  MessageWireDeltaSchema,
  MemorySyncPullResponseSchema,
  MemorySyncPushRequestSchema,
  MemorySyncPushResponseSchema,
  ProjectsSyncPullResponseSchema,
  ProjectsSyncPushRequestSchema,
  ProjectsSyncPushResponseSchema,
  SettingsSyncPullResponseSchema,
  SettingsSyncPushRequestSchema,
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

  it('rejects a page missing the cursor', () => {
    const page = { conversations: [], messages: [], artifacts: [], hasMore: false };
    expect(ChatSyncPullResponseSchema.safeParse(page).success).toBe(false);
  });

  it('rejects a message delta without server_version', () => {
    const { server_version: _v, ...bad } = messageDelta;
    const page = { conversations: [], messages: [bad], artifacts: [], cursor: '0', hasMore: false };
    expect(ChatSyncPullResponseSchema.safeParse(page).success).toBe(false);
  });

  it('rejects chat revisions outside the PostgreSQL bigint range', () => {
    const invalid = '9999999999999999999';
    expect(
      ChatSyncPullResponseSchema.safeParse({
        conversations: [{ ...conversationDelta, server_version: invalid }],
        messages: [],
        artifacts: [],
        cursor: '44',
        hasMore: false,
      }).success,
    ).toBe(false);
    expect(
      ChatSyncPushResponseSchema.safeParse({
        protocolVersion: 2,
        applied: {
          conversations: [{ id: conversationDelta.id, server_version: invalid }],
          messages: [],
          artifacts: [],
        },
        conflicts: { conversations: [], messages: [], artifacts: [] },
        cursor: '45',
      }).success,
    ).toBe(false);
  });
});

describe('chat delta branch pointers', () => {
  const PARENT_ID = '018f6f2a-0000-7000-8000-00000000000a';
  const LEAF_ID = '018f6f2a-0000-7000-8000-00000000000b';

  it('parses a delta from an emitter that predates threading, leaving the fields off', () => {
    expect(MessageWireDeltaSchema.parse(messageDelta)).not.toHaveProperty('parent_id');
    expect(ConversationWireDeltaSchema.parse(conversationDelta)).not.toHaveProperty(
      'active_leaf_message_id',
    );
  });

  it('keeps a null pointer distinct from an absent one', () => {
    expect(MessageWireDeltaSchema.parse({ ...messageDelta, parent_id: null })).toHaveProperty(
      'parent_id',
      null,
    );
    expect(
      ConversationWireDeltaSchema.parse({ ...conversationDelta, active_leaf_message_id: null }),
    ).toHaveProperty('active_leaf_message_id', null);
  });

  it('carries both pointers through a full pull page', () => {
    const page = ChatSyncPullResponseSchema.parse({
      conversations: [{ ...conversationDelta, active_leaf_message_id: LEAF_ID }],
      messages: [{ ...messageDelta, parent_id: PARENT_ID }],
      artifacts: [],
      cursor: '44',
      hasMore: false,
    });
    expect(page.messages[0]?.parent_id).toBe(PARENT_ID);
    expect(page.conversations[0]?.active_leaf_message_id).toBe(LEAF_ID);
  });

  it('carries both pointers on the current row of a push conflict', () => {
    const response = ChatSyncPushResponseSchema.parse({
      protocolVersion: 2,
      applied: { conversations: [], messages: [], artifacts: [] },
      conflicts: {
        conversations: [
          {
            id: conversationDelta.id,
            current: { ...conversationDelta, active_leaf_message_id: LEAF_ID },
          },
        ],
        messages: [{ id: messageDelta.id, current: { ...messageDelta, parent_id: PARENT_ID } }],
        artifacts: [],
      },
      cursor: '45',
    });
    expect(response.conflicts.messages[0]?.current?.parent_id).toBe(PARENT_ID);
    expect(response.conflicts.conversations[0]?.current?.active_leaf_message_id).toBe(LEAF_ID);
  });

  it('drops a parent a client tries to push, because the server decides lineage', () => {
    const parsed = ChatSyncPushRequestSchema.parse({
      protocolVersion: 2,
      messages: [
        {
          id: messageDelta.id,
          conversationId: conversationDelta.id,
          role: 'user',
          content: 'hi',
          baseVersion: '0',
          parentId: PARENT_ID,
        },
      ],
    });
    expect(parsed.messages[0]).not.toHaveProperty('parentId');
  });
});

describe('ChatSyncPushResponseSchema', () => {
  it('requires v2 CAS inputs, strips client clocks, and rejects duplicate ids', () => {
    expect(
      ChatSyncPushRequestSchema.safeParse({
        conversations: [{ id: conversationDelta.id, title: 'x', baseVersion: '0' }],
      }).success,
    ).toBe(false);

    const parsed = ChatSyncPushRequestSchema.parse({
      protocolVersion: 2,
      conversations: [
        {
          id: conversationDelta.id,
          title: 'x',
          baseVersion: '42',
          createdAt: '2999-01-01T00:00:00.000Z',
          updatedAt: '2999-01-01T00:00:00.000Z',
          deletedAt: '2999-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(parsed.conversations[0]).toEqual({
      id: conversationDelta.id,
      title: 'x',
      baseVersion: '42',
    });
    expect(
      ChatSyncPushRequestSchema.safeParse({
        protocolVersion: 2,
        conversations: [
          { id: conversationDelta.id, title: 'one', baseVersion: '0' },
          { id: conversationDelta.id, title: 'two', baseVersion: '0' },
        ],
      }).success,
    ).toBe(false);

    expect(
      ChatSyncPushRequestSchema.safeParse({
        protocolVersion: 2,
        messages: [
          {
            id: messageDelta.id,
            conversationId: conversationDelta.id,
            role: 'assistant',
            content: 'updated stream content',
          },
        ],
      }).success,
    ).toBe(false);

    expect(
      ChatSyncPushRequestSchema.parse({
        protocolVersion: 2,
        messages: [
          {
            id: messageDelta.id,
            conversationId: conversationDelta.id,
            role: 'assistant',
            content: 'updated stream content',
            costCents: 99,
            metadata: { cloudApproval: null },
            baseVersion: '43',
          },
        ],
      }).messages[0],
    ).toEqual({
      id: messageDelta.id,
      conversationId: conversationDelta.id,
      role: 'assistant',
      content: 'updated stream content',
      metadata: { cloudApproval: null },
      baseVersion: '43',
    });
  });

  it('accepts an ack with per-entity applied rows', () => {
    const ack = {
      protocolVersion: 2,
      applied: {
        conversations: [{ id: conversationDelta.id, server_version: '45' }],
        messages: [],
        artifacts: [],
      },
      conflicts: { conversations: [], messages: [], artifacts: [] },
      cursor: '45',
    };
    expect(ChatSyncPushResponseSchema.safeParse(ack).success).toBe(true);
  });

  it('rejects a legacy response that could hide unsupported CAS semantics', () => {
    expect(
      ChatSyncPushResponseSchema.safeParse({
        applied: { conversations: [], messages: [], artifacts: [] },
        cursor: '0',
      }).success,
    ).toBe(false);
  });

  it('parses the cross-language chat CAS fixture', () => {
    expect(ChatSyncPushRequestSchema.parse(chatMemoryCasGolden.chatPush)).toEqual(
      chatMemoryCasGolden.chatPush,
    );
    expect(ChatSyncPushResponseSchema.parse(chatMemoryCasGolden.chatPushResponse)).toEqual(
      chatMemoryCasGolden.chatPushResponse,
    );
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
    const ack = {
      protocolVersion: 2,
      applied: [{ id: memoryDelta.id, server_version: '9' }],
      conflicts: [],
      cursor: '9',
    };
    expect(MemorySyncPushResponseSchema.safeParse(ack).success).toBe(true);
  });

  it('requires v2 base revisions and rejects duplicate memory ids', () => {
    expect(
      MemorySyncPushRequestSchema.safeParse({
        memories: [{ id: memoryDelta.id, content: 'x', baseVersion: '0' }],
      }).success,
    ).toBe(false);
    expect(
      MemorySyncPushRequestSchema.safeParse({
        protocolVersion: 2,
        memories: [
          { id: memoryDelta.id, content: 'one', baseVersion: '0' },
          { id: memoryDelta.id, content: 'two', baseVersion: '0' },
        ],
      }).success,
    ).toBe(false);
  });

  it('parses the cross-language memory CAS fixture', () => {
    expect(MemorySyncPushRequestSchema.parse(chatMemoryCasGolden.memoryPush)).toEqual(
      chatMemoryCasGolden.memoryPush,
    );
    expect(MemorySyncPushResponseSchema.parse(chatMemoryCasGolden.memoryPushResponse)).toEqual(
      chatMemoryCasGolden.memoryPushResponse,
    );
  });

  it('rejects memory revisions outside the PostgreSQL bigint range', () => {
    const invalid = '9999999999999999999';
    expect(
      MemorySyncPullResponseSchema.safeParse({
        memories: [{ ...memoryDelta, server_version: invalid }],
        cursor: '8',
        hasMore: false,
      }).success,
    ).toBe(false);
    expect(
      MemorySyncPushResponseSchema.safeParse({
        protocolVersion: 2,
        applied: [{ id: memoryDelta.id, server_version: invalid }],
        conflicts: [],
        cursor: '9',
      }).success,
    ).toBe(false);
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
    const ack = {
      applied: [{ id: projectDelta.id, server_version: '4' }],
      conflicts: [],
      cursor: '4',
    };
    expect(ProjectsSyncPushResponseSchema.parse(ack)).toEqual(ack);
  });

  it('requires a server-owned base version and strips client clocks from pushes', () => {
    expect(
      ProjectsSyncPushRequestSchema.safeParse({
        projects: [
          {
            id: projectDelta.id,
            name: projectDelta.name,
            updatedAt: '2999-01-01T00:00:00.000Z',
          },
        ],
      }).success,
    ).toBe(false);

    expect(
      ProjectsSyncPushRequestSchema.parse({
        projects: [
          {
            id: projectDelta.id,
            name: projectDelta.name,
            baseVersion: '3',
            createdAt: '2999-01-01T00:00:00.000Z',
            updatedAt: '2999-01-01T00:00:00.000Z',
          },
        ],
      }),
    ).toEqual({
      projects: [{ id: projectDelta.id, name: projectDelta.name, baseVersion: '3' }],
    });
  });

  it('rejects duplicate project ids in one compare-and-swap batch', () => {
    expect(
      ProjectsSyncPushRequestSchema.safeParse({
        projects: [
          { id: projectDelta.id, name: 'First', baseVersion: '3' },
          { id: projectDelta.id, name: 'Second', baseVersion: '3' },
        ],
      }).success,
    ).toBe(false);
  });

  it('returns the server winner for every compare-and-swap conflict', () => {
    const conflict = {
      applied: [],
      conflicts: [{ id: projectDelta.id, current: projectDelta }],
      cursor: '3',
    };
    expect(ProjectsSyncPushResponseSchema.parse(conflict)).toEqual(conflict);
  });

  it('rejects project revisions outside the PostgreSQL bigint range', () => {
    expect(
      ProjectsSyncPushResponseSchema.safeParse({
        applied: [{ id: projectDelta.id, server_version: '9999999999999999999' }],
        conflicts: [],
        cursor: '4',
      }).success,
    ).toBe(false);
    expect(
      ProjectsSyncPullResponseSchema.safeParse({
        projects: [{ ...projectDelta, server_version: '9999999999999999999' }],
        cursor: '4',
        hasMore: false,
      }).success,
    ).toBe(false);
  });

  it('parses the cross-language project CAS golden fixture', () => {
    expect(ProjectsSyncPushRequestSchema.parse(projectsCasGolden.push)).toEqual(
      projectsCasGolden.push,
    );
    expect(ProjectsSyncPushResponseSchema.parse(projectsCasGolden.pushResponse)).toEqual(
      projectsCasGolden.pushResponse,
    );
    expect(ProjectsSyncPullResponseSchema.parse(projectsCasGolden.pullResponse)).toEqual(
      projectsCasGolden.pullResponse,
    );
  });

  it('strips trust-routing fields from sync pushes', () => {
    const parsed = ProjectsSyncPushRequestSchema.parse({
      projects: [
        {
          id: projectDelta.id,
          name: projectDelta.name,
          baseVersion: projectDelta.server_version,
          defaultPrivacyMode: 'managed',
          defaultProviderMode: 'ManagedGateway',
          allowedSurfaces: ['web'],
        },
      ],
    });

    expect(parsed.projects[0]).toEqual({
      id: projectDelta.id,
      name: projectDelta.name,
      baseVersion: projectDelta.server_version,
    });
  });
});

describe('SettingsSync schemas', () => {
  it('accepts only the eight cloud-safe top-level namespaces', () => {
    const parsed = SettingsSyncPushRequestSchema.parse({
      settings: {
        appearance: { theme: 'dark' },
        editor: { promptCompletionEnabled: true },
        byok: { apiKey: 'must-not-cross' },
      },
      baseVersion: '12',
    });

    expect(parsed.settings).toEqual({
      appearance: { theme: 'dark' },
      editor: { promptCompletionEnabled: true },
    });
  });

  it('requires a server-owned base version and ignores a future-skewed client clock', () => {
    expect(
      SettingsSyncPushRequestSchema.safeParse({
        settings: { appearance: { theme: 'dark' } },
        updatedAt: '2999-01-01T00:00:00.000Z',
      }).success,
    ).toBe(false);

    expect(
      SettingsSyncPushRequestSchema.parse({
        settings: { appearance: { theme: 'dark' } },
        baseVersion: '7',
        updatedAt: '2999-01-01T00:00:00.000Z',
      }),
    ).toEqual({
      settings: { appearance: { theme: 'dark' } },
      baseVersion: '7',
    });
  });

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

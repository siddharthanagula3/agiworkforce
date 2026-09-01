import { describe, expect, it } from 'vitest';
import { INTERACTIVE_CARDS_MAX_PER_MESSAGE } from '@agiworkforce/types';
import {
  MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH,
  MANAGED_CLOUD_CHAT_MAX_MESSAGE_PAGE_SIZE,
  MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH,
  MANAGED_CLOUD_CHAT_MAX_PAGE_SIZE,
  MANAGED_CLOUD_DEFAULT_MODEL_SELECTION,
  ManagedCloudConversationListResponseSchema,
  ManagedCloudConversationBranchesResponseSchema,
  ManagedCloudConversationResponseSchema,
  ManagedCloudConversationWireSchema,
  ManagedCloudCreateConversationBranchRequestSchema,
  ManagedCloudCreateConversationBranchResponseSchema,
  ManagedCloudCreateConversationRequestSchema,
  ManagedCloudCreateMessageRequestSchema,
  ManagedCloudDeleteConversationResponseSchema,
  ManagedCloudReflectRecapSchema,
  ManagedCloudMessageWireSchema,
  ManagedCloudUpdateConversationRequestSchema,
  managedCloudConversationBranchesPath,
  managedCloudConversationPath,
  managedCloudMessagePath,
  normalizeManagedCloudConversation,
  normalizeManagedCloudMessage,
} from '../conversations';

const conversation = {
  id: '0190a000-0000-7000-8000-0000000000aa',
  title: 'Cloud chat',
  model: MANAGED_CLOUD_DEFAULT_MODEL_SELECTION,
  project_id: 'project-1',
  pinned: true,
  starred: true,
  archived: false,
  is_temporary: false,
  created_at: '2026-07-14T00:00:00.000Z',
  updated_at: '2026-07-14T00:01:00.000Z',
};

const message = {
  id: '0190a000-0000-7000-8000-0000000000bb',
  role: 'assistant',
  content: 'Hello',
  model: 'model-x',
  provider: 'provider-x',
  input_tokens: 10,
  output_tokens: 5,
  created_at: '2026-07-14T00:01:00.000Z',
  metadata: { source: 'cloud' },
};

describe('managed-cloud conversation wire contract', () => {
  it('validates the list and read envelopes actually emitted by apps/web', () => {
    expect(
      ManagedCloudConversationListResponseSchema.parse({
        conversations: [conversation],
        hasMore: false,
        nextOffset: 1,
        historyStats: {
          conversationCount: 195,
          messageCount: 842,
        },
      }).conversations,
    ).toEqual([conversation]);

    const parsed = ManagedCloudConversationResponseSchema.parse({
      conversation,
      messages: [message],
      total: 1,
      hasMore: false,
    });
    expect(parsed.messages).toEqual([message]);
  });

  it('validates owner-scoped Cloud history totals independently of list pagination', () => {
    const parsed = ManagedCloudConversationListResponseSchema.parse({
      conversations: [conversation],
      hasMore: true,
      nextOffset: 1,
      historyStats: {
        conversationCount: 195,
        messageCount: 842,
      },
    });

    expect(parsed.historyStats).toEqual({
      conversationCount: 195,
      messageCount: 842,
    });
  });

  it('rejects response drift instead of allowing unchecked client casts', () => {
    expect(
      ManagedCloudConversationListResponseSchema.safeParse({
        conversations: [{ ...conversation, updated_at: 42 }],
        hasMore: false,
        nextOffset: 1,
      }).success,
    ).toBe(false);
    expect(
      ManagedCloudConversationResponseSchema.safeParse({
        conversation,
        messages: [{ ...message, role: 'tool' }],
        total: 1,
        hasMore: false,
      }).success,
    ).toBe(false);
  });

  it('bounds successful list and transcript response payloads', () => {
    expect(
      ManagedCloudConversationListResponseSchema.safeParse({
        conversations: Array.from({ length: MANAGED_CLOUD_CHAT_MAX_PAGE_SIZE + 1 }, (_, index) => ({
          ...conversation,
          id: `conversation-${index}`,
        })),
        hasMore: false,
        nextOffset: MANAGED_CLOUD_CHAT_MAX_PAGE_SIZE + 1,
      }).success,
    ).toBe(false);

    expect(
      ManagedCloudConversationResponseSchema.safeParse({
        conversation,
        messages: Array.from(
          { length: MANAGED_CLOUD_CHAT_MAX_MESSAGE_PAGE_SIZE + 1 },
          (_, index) => ({ ...message, id: `message-${index}` }),
        ),
        total: MANAGED_CLOUD_CHAT_MAX_MESSAGE_PAGE_SIZE + 1,
        hasMore: false,
      }).success,
    ).toBe(false);

    expect(
      ManagedCloudMessageWireSchema.safeParse({
        ...message,
        content: 'x'.repeat(MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      ManagedCloudMessageWireSchema.safeParse({
        ...message,
        metadata: { value: 'x'.repeat(MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH) },
      }).success,
    ).toBe(false);
  });

  it('reports the interactive-card count guard before the total metadata size guard', () => {
    const parsed = ManagedCloudMessageWireSchema.safeParse({
      ...message,
      metadata: {
        interactiveCards: Array.from({ length: INTERACTIVE_CARDS_MAX_PER_MESSAGE + 1 }, () => ({})),
        oversizedLaterField: 'x'.repeat(MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH),
      },
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toMatch(/too many interactive cards/i);
    }
  });

  it('normalizes snake_case rows once for Mobile, Desktop, and Web adapters', () => {
    expect(
      normalizeManagedCloudConversation({
        ...conversation,
        organization_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }),
    ).toEqual({
      id: conversation.id,
      organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      title: 'Cloud chat',
      model: MANAGED_CLOUD_DEFAULT_MODEL_SELECTION,
      projectId: 'project-1',
      pinned: true,
      starred: true,
      archived: false,
      isTemporary: false,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
    });
    expect(
      normalizeManagedCloudMessage(ManagedCloudMessageWireSchema.parse(message), conversation.id),
    ).toEqual({
      id: message.id,
      conversationId: conversation.id,
      role: 'assistant',
      content: 'Hello',
      model: 'model-x',
      provider: 'provider-x',
      inputTokens: 10,
      outputTokens: 5,
      createdAt: message.created_at,
      metadata: { source: 'cloud' },
    });
  });

  it('keeps create/update/message request shapes aligned with the routes', () => {
    expect(ManagedCloudCreateConversationRequestSchema.parse({}).model).toBe(
      MANAGED_CLOUD_DEFAULT_MODEL_SELECTION,
    );
    expect(ManagedCloudCreateMessageRequestSchema.parse({ content: 'Hello' }).model).toBe(
      MANAGED_CLOUD_DEFAULT_MODEL_SELECTION,
    );
    expect(
      ManagedCloudCreateConversationRequestSchema.parse({
        id: conversation.id,
        title: 'Cloud chat',
        model: MANAGED_CLOUD_DEFAULT_MODEL_SELECTION,
        projectId: null,
        isTemporary: true,
      }),
    ).toMatchObject({ title: 'Cloud chat', isTemporary: true });
    expect(
      ManagedCloudUpdateConversationRequestSchema.parse({ title: 'Renamed', pinned: false }),
    ).toEqual({ title: 'Renamed', pinned: false });
    expect(
      ManagedCloudUpdateConversationRequestSchema.parse({ starred: true, archived: true }),
    ).toEqual({ starred: true, archived: true });
    expect(
      ManagedCloudCreateMessageRequestSchema.parse({
        id: message.id,
        role: 'assistant',
        content: 'Hello',
        model: 'model-x',
        metadata: {},
        skipLlm: true,
      }).role,
    ).toBe('assistant');
    expect(ManagedCloudDeleteConversationResponseSchema.parse({ success: true })).toEqual({
      success: true,
    });
  });

  it('carries the message tree without making an old client send it', () => {
    const parentId = '0190a000-0000-7000-8000-0000000000ee';

    expect(ManagedCloudMessageWireSchema.parse({ ...message, parent_id: parentId })).toMatchObject({
      parent_id: parentId,
    });
    expect(
      ManagedCloudConversationWireSchema.parse({
        ...conversation,
        active_leaf_message_id: message.id,
      }),
    ).toMatchObject({ active_leaf_message_id: message.id });

    expect(ManagedCloudMessageWireSchema.parse(message)).toEqual(message);
    expect(ManagedCloudConversationWireSchema.parse(conversation)).toEqual(conversation);

    expect(
      ManagedCloudMessageWireSchema.parse({ ...message, parent_id: null }).parent_id,
    ).toBeNull();
    expect(
      ManagedCloudConversationWireSchema.parse({ ...conversation, active_leaf_message_id: null })
        .active_leaf_message_id,
    ).toBeNull();

    expect(ManagedCloudMessageWireSchema.safeParse({ ...message, parent_id: 'root' }).success).toBe(
      false,
    );
    expect(
      ManagedCloudConversationWireSchema.safeParse({
        ...conversation,
        active_leaf_message_id: 'latest',
      }).success,
    ).toBe(false);
  });

  it('accepts a sibling write and a leaf move without requiring either', () => {
    const parentId = '0190a000-0000-7000-8000-0000000000ee';

    expect(
      ManagedCloudCreateMessageRequestSchema.parse({ content: 'Hello', parentId }).parentId,
    ).toBe(parentId);
    expect(
      ManagedCloudCreateMessageRequestSchema.parse({ content: 'Hello' }).parentId,
    ).toBeUndefined();
    expect(
      ManagedCloudCreateMessageRequestSchema.safeParse({ content: 'Hello', parentId: 'previous' })
        .success,
    ).toBe(false);

    // Null is how a client says "branch at the root" when it edits the opening
    // turn. Absent means something else entirely, so the two cannot collapse.
    expect(
      ManagedCloudCreateMessageRequestSchema.parse({ content: 'Hello', parentId: null }).parentId,
    ).toBeNull();

    expect(
      ManagedCloudUpdateConversationRequestSchema.parse({ activeLeafMessageId: message.id }),
    ).toEqual({ activeLeafMessageId: message.id });
    expect(ManagedCloudUpdateConversationRequestSchema.parse({ pinned: true })).toEqual({
      pinned: true,
    });
    expect(
      ManagedCloudUpdateConversationRequestSchema.safeParse({ activeLeafMessageId: null }).success,
    ).toBe(false);
  });

  it('encodes conversation and message ids in canonical endpoint builders', () => {
    expect(managedCloudConversationPath('conversation/id')).toBe(
      '/api/chat/conversations/conversation%2Fid',
    );
    expect(managedCloudMessagePath('conversation/id', 'message id')).toBe(
      '/api/chat/conversations/conversation%2Fid/messages/message%20id',
    );
    expect(managedCloudConversationBranchesPath('conversation/id')).toBe(
      '/api/chat/conversations/conversation%2Fid/branches',
    );
  });

  it('validates the owner-scoped conversation branch envelopes', () => {
    const branchConversation = {
      ...conversation,
      id: '0190a000-0000-7000-8000-0000000000cc',
      title: 'Cloud chat (branch)',
    };
    expect(
      ManagedCloudConversationBranchesResponseSchema.parse({
        groups: [
          {
            messageId: message.id,
            activeConversationId: conversation.id,
            branches: [
              { conversationId: conversation.id, title: 'Cloud chat' },
              { conversationId: branchConversation.id, title: 'Cloud chat (branch)' },
            ],
          },
        ],
      }).groups,
    ).toHaveLength(1);
    expect(
      ManagedCloudCreateConversationBranchRequestSchema.parse({
        messageId: message.id,
        requestId: '0190a000-0000-7000-8000-0000000000dd',
      }),
    ).toEqual({
      messageId: message.id,
      requestId: '0190a000-0000-7000-8000-0000000000dd',
    });
    expect(
      ManagedCloudCreateConversationBranchResponseSchema.parse({
        conversation: branchConversation,
      }).conversation.id,
    ).toBe(branchConversation.id);
  });

  it('validates the bounded managed Reflect recap shared by Web and later clients', () => {
    const recap = ManagedCloudReflectRecapSchema.parse({
      range: '30d',
      generatedAt: '2026-07-18T18:00:00.000Z',
      period: {
        start: '2026-06-18T18:00:00.000Z',
        end: '2026-07-18T18:00:00.000Z',
        label: 'Past 30 days',
      },
      summary: {
        headline: 'Writing led your past 30 days',
        body: 'You started 3 conversations across 2 active days.',
      },
      stats: { totalConversations: 3, activeDays: 2, mostActiveDay: '2026-07-10', peakHour: 15 },
      dailyActivity: [
        { date: '2026-07-10', conversationCount: 2 },
        { date: '2026-07-12', conversationCount: 1 },
      ],
      topics: [
        {
          id: 'writing',
          label: 'Writing',
          description: 'Drafting, editing, and summarization.',
          conversationCount: 2,
          percentage: 66.7,
        },
      ],
      insights: [
        {
          dimension: 'delegation',
          title: 'What you handed off',
          observation: 'Writing appeared in 2 conversations.',
          nextStep: 'Choose which parts you want to keep doing yourself.',
        },
      ],
      sampled: false,
      sampledConversationCount: 3,
    });

    expect(recap.stats.peakHour).toBe(15);
    expect(
      ManagedCloudReflectRecapSchema.safeParse({
        ...recap,
        topics: [{ ...recap.topics[0], percentage: 101 }],
      }).success,
    ).toBe(false);
    expect(
      ManagedCloudReflectRecapSchema.safeParse({
        ...recap,
        generatedAt: 'sometime today',
      }).success,
    ).toBe(false);
  });
});

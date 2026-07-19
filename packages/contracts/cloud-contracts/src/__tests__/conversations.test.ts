import { describe, expect, it } from 'vitest';
import {
  ManagedCloudConversationListResponseSchema,
  ManagedCloudConversationResponseSchema,
  ManagedCloudCreateConversationRequestSchema,
  ManagedCloudCreateMessageRequestSchema,
  ManagedCloudDeleteConversationResponseSchema,
  ManagedCloudReflectRecapSchema,
  ManagedCloudMessageWireSchema,
  ManagedCloudUpdateConversationRequestSchema,
  managedCloudConversationPath,
  managedCloudMessagePath,
  normalizeManagedCloudConversation,
  normalizeManagedCloudMessage,
} from '../conversations';

const conversation = {
  id: '0190a000-0000-7000-8000-0000000000aa',
  title: 'Cloud chat',
  model: 'auto',
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

  it('normalizes snake_case rows once for Mobile, Desktop, and Web adapters', () => {
    expect(normalizeManagedCloudConversation(conversation)).toEqual({
      id: conversation.id,
      title: 'Cloud chat',
      model: 'auto',
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
    expect(
      ManagedCloudCreateConversationRequestSchema.parse({
        id: conversation.id,
        title: 'Cloud chat',
        model: 'auto',
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

  it('encodes conversation and message ids in canonical endpoint builders', () => {
    expect(managedCloudConversationPath('conversation/id')).toBe(
      '/api/chat/conversations/conversation%2Fid',
    );
    expect(managedCloudMessagePath('conversation/id', 'message id')).toBe(
      '/api/chat/conversations/conversation%2Fid/messages/message%20id',
    );
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

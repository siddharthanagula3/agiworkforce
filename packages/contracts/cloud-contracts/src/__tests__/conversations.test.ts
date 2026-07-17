import { describe, expect, it } from 'vitest';
import {
  ManagedCloudBranchConversationRequestSchema,
  ManagedCloudBranchConversationResponseSchema,
  ManagedCloudConversationListResponseSchema,
  ManagedCloudConversationResponseSchema,
  ManagedCloudCreateConversationRequestSchema,
  ManagedCloudCreateMessageRequestSchema,
  ManagedCloudDeleteConversationResponseSchema,
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
  cost_cents: 1,
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
      costCents: 1,
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

  it('validates the separate atomic Web branch endpoint without claiming cross-surface fork parity', () => {
    const request = ManagedCloudBranchConversationRequestSchema.parse({
      sessionId: conversation.id,
      branchPointMessageId: message.id,
      branchName: 'Alternate',
    });
    expect(request.branchName).toBe('Alternate');
    expect(
      ManagedCloudBranchConversationResponseSchema.safeParse({
        session: {
          id: '0190a000-0000-7000-8000-0000000000cc',
          user_id: 'user-1',
          title: 'Alternate',
          created_at: conversation.created_at,
          updated_at: conversation.updated_at,
        },
        branch: {
          id: '0190a000-0000-7000-8000-0000000000dd',
          parent_session_id: conversation.id,
          child_session_id: '0190a000-0000-7000-8000-0000000000cc',
          branch_point_message_id: message.id,
          branch_name: 'Alternate',
          created_by: 'user-1',
          created_at: conversation.created_at,
        },
      }).success,
    ).toBe(true);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

const { mockSaveConversationDraft, mockSession } = vi.hoisted(() => ({
  mockSaveConversationDraft: vi.fn(async () => true),
  mockSession: { getToken: vi.fn(async () => 'token'), isLoaded: true, isSignedIn: true },
}));

vi.mock('@/lib/identity/client', () => ({ useSession: () => mockSession }));
vi.mock('../services/conversation-draft', () => ({
  saveConversationDraft: mockSaveConversationDraft,
}));

import { useChatStore } from '@shared/stores/web-chat-store';
import { useConversationDraftSync } from './use-conversation-draft-sync';

const CONVERSATION = '11111111-1111-4111-8111-111111111111';

function Harness() {
  useConversationDraftSync();
  return null;
}

function seedConversation(overrides: Record<string, unknown> = {}) {
  useChatStore.setState({
    conversations: [
      {
        id: CONVERSATION,
        title: 'Draft chat',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
      },
    ] as never,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockSession.isLoaded = true;
  mockSession.isSignedIn = true;
  useChatStore.setState({ draftsByConversation: {}, conversations: [] as never });
});

describe('carrying a composer draft to the server', () => {
  it('saves a saved conversation’s draft once the typing settles', async () => {
    seedConversation();
    render(<Harness />);

    useChatStore.setState({ draftsByConversation: { [CONVERSATION]: 'half a thought' } });
    expect(mockSaveConversationDraft).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();

    expect(mockSaveConversationDraft).toHaveBeenCalledTimes(1);
    const [conversationId, draft] = mockSaveConversationDraft.mock.calls[0] as unknown as [
      string,
      string,
    ];
    expect(conversationId).toBe(CONVERSATION);
    expect(draft).toBe('half a thought');
  });

  it('never stores a temporary chat’s draft', async () => {
    seedConversation({ isTemporary: true });
    render(<Harness />);

    useChatStore.setState({ draftsByConversation: { [CONVERSATION]: 'half a thought' } });
    await vi.runAllTimersAsync();

    expect(mockSaveConversationDraft).not.toHaveBeenCalled();
  });

  it('leaves the unsaved surface’s shared slot alone, which has no row to hold it', async () => {
    render(<Harness />);

    useChatStore.setState({ draftsByConversation: { pending: 'half a thought' } });
    await vi.runAllTimersAsync();

    expect(mockSaveConversationDraft).not.toHaveBeenCalled();
  });

  it('does not resend text the server already holds', async () => {
    seedConversation();
    render(<Harness />);

    useChatStore.setState({ draftsByConversation: { [CONVERSATION]: 'half a thought' } });
    await vi.runAllTimersAsync();
    useChatStore.setState({ draftsByConversation: { [CONVERSATION]: 'half a thought' } });
    await vi.runAllTimersAsync();

    expect(mockSaveConversationDraft).toHaveBeenCalledTimes(1);
  });

  it('retries the next change when a save fails, rather than treating it as stored', async () => {
    mockSaveConversationDraft.mockResolvedValueOnce(false);
    seedConversation();
    render(<Harness />);

    useChatStore.setState({ draftsByConversation: { [CONVERSATION]: 'half a thought' } });
    await vi.runAllTimersAsync();
    useChatStore.setState({ draftsByConversation: { [CONVERSATION]: 'half a thought' } });
    await vi.runAllTimersAsync();

    expect(mockSaveConversationDraft).toHaveBeenCalledTimes(2);
  });

  it('sends nothing while signed out', async () => {
    mockSession.isSignedIn = false;
    seedConversation();
    render(<Harness />);

    useChatStore.setState({ draftsByConversation: { [CONVERSATION]: 'half a thought' } });
    await vi.runAllTimersAsync();

    expect(mockSaveConversationDraft).not.toHaveBeenCalled();
  });
});

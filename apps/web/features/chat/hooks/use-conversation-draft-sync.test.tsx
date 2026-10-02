import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import type { DraftSaveResult } from '../services/conversation-draft';

const { mockSaveConversationDraft, mockSession, mockToastError } = vi.hoisted(() => ({
  mockSaveConversationDraft: vi.fn(async (): Promise<DraftSaveResult> => 'saved'),
  mockSession: { getToken: vi.fn(async () => 'token'), isLoaded: true, isSignedIn: true },
  mockToastError: vi.fn(),
}));

vi.mock('@/lib/identity/client', () => ({ useSession: () => mockSession }));
vi.mock('sonner', () => ({ toast: { error: mockToastError, dismiss: vi.fn() } }));
vi.mock('../services/conversation-draft', () => ({
  saveConversationDraft: mockSaveConversationDraft,
  adoptConversationDraftRevision: vi.fn(),
  clearObservedConversationDraftRevisions: vi.fn(),
}));

import type { LocalModel } from '@agiworkforce/local-runtime-contract';
import { useLocalModelSelection } from '@features/desktop-host';
import { useChatStore } from '@shared/stores/web-chat-store';
import {
  hasPendingDraftClear,
  markPendingDraftClear,
  clearPendingDraftClear,
} from '../lib/pending-draft-clear';
import { useConversationDraftSync } from './use-conversation-draft-sync';

const CONVERSATION = '11111111-1111-4111-8111-111111111111';

const LOCAL_MODEL: LocalModel = {
  id: 'local:ollama/qwen2.5:1.5b',
  serverId: 'ollama',
  serverLabel: 'Ollama',
  name: 'qwen2.5:1.5b',
};

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
  useChatStore.setState({
    draftsByConversation: {},
    conversations: [] as never,
    messagesByConversation: {},
  });
  useLocalModelSelection.getState().select(null);
  clearPendingDraftClear(CONVERSATION);
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

  it('never stores a draft for a chat that holds an answer from a model on this device', async () => {
    seedConversation();
    useChatStore.setState({
      messagesByConversation: {
        [CONVERSATION]: [
          {
            id: 'local-answer',
            role: 'assistant',
            content: 'answered on this Mac',
            createdAt: '2026-01-01T00:00:01.000Z',
            model: LOCAL_MODEL.id,
            metadata: { privacyMode: 'local' },
          },
        ],
      } as never,
    });
    render(<Harness />);

    useChatStore.setState({ draftsByConversation: { [CONVERSATION]: 'my biopsy result says' } });
    await vi.runAllTimersAsync();

    expect(mockSaveConversationDraft).not.toHaveBeenCalled();
  });

  it('holds a draft back while a model on this device is selected', async () => {
    seedConversation();
    useLocalModelSelection.getState().select(LOCAL_MODEL);
    render(<Harness />);

    useChatStore.setState({ draftsByConversation: { [CONVERSATION]: 'my biopsy result says' } });
    await vi.runAllTimersAsync();

    expect(mockSaveConversationDraft).not.toHaveBeenCalled();
  });

  it('still clears a stored draft for a chat answered on this device', async () => {
    seedConversation();
    useLocalModelSelection.getState().select(LOCAL_MODEL);
    render(<Harness />);

    useChatStore.setState({ draftsByConversation: { [CONVERSATION]: '' } });
    await vi.runAllTimersAsync();

    expect(mockSaveConversationDraft).toHaveBeenCalledTimes(1);
    expect(mockSaveConversationDraft.mock.calls[0]?.slice(0, 2)).toEqual([CONVERSATION, '']);
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

  it('sends an empty draft when the user clears a previously saved conversation draft', async () => {
    seedConversation();
    render(<Harness />);

    useChatStore.getState().setDraftContent('half a thought', CONVERSATION);
    await vi.runAllTimersAsync();
    useChatStore.getState().clearDraftContent(CONVERSATION);
    await vi.runAllTimersAsync();

    expect(mockSaveConversationDraft).toHaveBeenCalledTimes(2);
    expect(mockSaveConversationDraft.mock.calls[1]?.slice(0, 2)).toEqual([CONVERSATION, '']);
  });

  it('serializes an in-flight text save before its later clear and acknowledges the clear', async () => {
    let finishFirst!: (saved: DraftSaveResult) => void;
    mockSaveConversationDraft.mockImplementationOnce(
      () =>
        new Promise<DraftSaveResult>((resolve) => {
          finishFirst = resolve;
        }),
    );
    seedConversation();
    render(<Harness />);

    await act(async () => {
      useChatStore.getState().setDraftContent('a draft', CONVERSATION);
      await vi.runAllTimersAsync();
    });
    expect(mockSaveConversationDraft.mock.calls[0]?.slice(0, 2)).toEqual([CONVERSATION, 'a draft']);

    markPendingDraftClear(CONVERSATION);
    await act(async () => {
      useChatStore.getState().clearDraftContent(CONVERSATION);
      await vi.runAllTimersAsync();
    });
    expect(mockSaveConversationDraft).toHaveBeenCalledTimes(1);
    expect(hasPendingDraftClear(CONVERSATION)).toBe(true);

    await act(async () => {
      finishFirst('saved');
      await Promise.resolve();
    });
    expect(mockSaveConversationDraft.mock.calls[1]?.slice(0, 2)).toEqual([CONVERSATION, '']);
    expect(hasPendingDraftClear(CONVERSATION)).toBe(false);
  });

  it('retries the next change when a save fails, rather than treating it as stored', async () => {
    mockSaveConversationDraft.mockResolvedValueOnce('failed');
    seedConversation();
    render(<Harness />);

    useChatStore.setState({ draftsByConversation: { [CONVERSATION]: 'half a thought' } });
    await vi.runAllTimersAsync();
    useChatStore.setState({ draftsByConversation: { [CONVERSATION]: 'half a thought' } });
    await vi.runAllTimersAsync();

    expect(mockSaveConversationDraft).toHaveBeenCalledTimes(2);
  });

  it('retries a failed save without requiring another keystroke', async () => {
    mockSaveConversationDraft.mockResolvedValueOnce('failed');
    seedConversation();
    render(<Harness />);

    await act(async () => {
      useChatStore.getState().setDraftContent('half a thought', CONVERSATION);
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockSaveConversationDraft).toHaveBeenCalledTimes(2);
    expect(mockSaveConversationDraft.mock.calls[1]?.slice(0, 2)).toEqual([
      CONVERSATION,
      'half a thought',
    ]);
  });

  it('stops automatic retries and warns when a draft still cannot sync', async () => {
    mockSaveConversationDraft.mockResolvedValue('failed');
    seedConversation();
    render(<Harness />);

    await act(async () => {
      useChatStore.getState().setDraftContent('half a thought', CONVERSATION);
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockSaveConversationDraft).toHaveBeenCalledTimes(3);
    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining("couldn't sync"),
      expect.objectContaining({ id: `draft-sync-${CONVERSATION}` }),
    );
  });

  it('does not retry after the draft-sync component unmounts', async () => {
    mockSaveConversationDraft.mockResolvedValueOnce('failed');
    seedConversation();
    const view = render(<Harness />);

    await act(async () => {
      useChatStore.getState().setDraftContent('half a thought', CONVERSATION);
      await vi.runAllTimersAsync();
    });
    view.unmount();
    await vi.runAllTimersAsync();

    expect(mockSaveConversationDraft).toHaveBeenCalledTimes(1);
  });

  it('keeps a conflicting local draft and warns that it did not sync', async () => {
    mockSaveConversationDraft.mockResolvedValueOnce({
      kind: 'conflict',
      theirs: 'their text',
      theirsRevision: '2026-08-02T00:00:01.000Z',
    });
    seedConversation();
    render(<Harness />);

    useChatStore.getState().setDraftContent('my unsent text', CONVERSATION);
    await vi.runAllTimersAsync();

    expect(useChatStore.getState().getDraftContent(CONVERSATION)).toBe('my unsent text');
    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining('has not synced'),
      expect.objectContaining({ id: `draft-conflict-${CONVERSATION}` }),
    );
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

import { Alert } from 'react-native';
import { act, waitFor } from '@testing-library/react-native';

jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => null),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

jest.mock('../services/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    uploadFile: jest.fn(),
  },
  ApiPaywallError: class MockApiPaywallError extends Error {},
}));

jest.mock('../services/streaming', () => ({
  streamChat: jest.fn(),
  streamToolApprovalResume: jest.fn(),
  cancelMobileCloudAgentRun: jest.fn(),
}));

jest.mock('../services/remoteChatGate', () => {
  class MockRemoteChatDisabledError extends Error {
    readonly code = 'MOBILE_REMOTE_CHAT_DISABLED';
  }
  return {
    getRemoteChatDisabledReason: jest.fn(() => 'mobile-local-only'),
    RemoteChatDisabledError: MockRemoteChatDisabledError,
  };
});

jest.mock('@agiworkforce/local-llm', () => {
  const actual = jest.requireActual('@agiworkforce/local-llm');
  return {
    ...actual,
    localGenerate: jest.fn(),
    getCapabilities: jest.fn().mockResolvedValue({
      totalRAMMB: 8192,
      osVersion: 'test',
      thermalThrottled: false,
      tier1Available: false,
      tier1Runtime: null,
      tier2Available: true,
      tier3Available: true,
    }),
  };
});

jest.mock('../storage/installedModels', () => ({
  listInstalledModels: jest.fn().mockResolvedValue([]),
  getInstalledModel: jest.fn().mockResolvedValue(null),
  markInstalledModelUsed: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/features/memory/store', () => ({
  retrieveMemoryContext: jest.fn(async () => []),
}));

jest.mock('../src/features/memory/services/pastChatContext', () => ({
  retrievePastChatContext: jest.fn(async () => null),
}));

jest.mock('../src/features/memory/services/consolidation', () => ({
  consolidateFactsFromTurn: jest.fn(),
  shouldConsolidateMemoryOnClient: jest.fn(() => false),
}));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

import {
  resolveLeafForSibling,
  resolveVisibleThread,
  variantInfoByMessage,
} from '@agiworkforce/cloud-contracts';
import { localGenerate } from '@agiworkforce/local-llm';
import { useChatExecutionStore, useChatStore } from '../stores/chatStore';
import { setLocalActiveLeaf } from '../stores/chat/chatExecutionStore';
import { streamChat } from '../services/streaming';
import { listInstalledModels } from '../storage/installedModels';
import { useSettingsStore } from '../stores/settingsStore';
import { REDUCED_SENSITIVE_CONTENT_REFUSAL } from '../lib/contentFilter';
import { requireLocalModel } from '../test-utils/modelFixtures';
import type { ChatMessage } from '../types/chat';

const mockLocalGenerate = localGenerate as jest.MockedFunction<typeof localGenerate>;
const mockListInstalledModels = listInstalledModels as jest.MockedFunction<
  typeof listInstalledModels
>;
const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;

const CONV_ID = 'safe-edit-local-chat';
const LOCAL_MODEL = requireLocalModel().id;
const STAMP = '2026-11-15T10:00:00.000Z';

function row(id: string, role: 'user' | 'assistant', content: string): ChatMessage {
  return { id, conversationId: CONV_ID, role, content, createdAt: STAMP, isStreaming: false };
}

const THREE_TURNS = [
  row('z-u1', 'user', 'first question'),
  row('y-a1', 'assistant', 'first answer'),
  row('x-u2', 'user', 'second question'),
  row('w-a2', 'assistant', 'second answer'),
  row('v-u3', 'user', 'third question'),
  row('u-a3', 'assistant', 'third answer'),
];

const ORIGINAL_CONTENTS = THREE_TURNS.map((message) => message.content);

function rows(): ChatMessage[] {
  return useChatStore.getState().messages[CONV_ID] ?? [];
}

function leaf(): string | null | undefined {
  return useChatStore.getState().conversations.find((c) => c.id === CONV_ID)?.activeLeafMessageId;
}

function visibleContents(): string[] {
  return resolveVisibleThread(rows(), leaf()).map((message) => message.content);
}

function seed(messages: ChatMessage[] = THREE_TURNS): void {
  useChatStore.setState({
    conversations: [
      {
        id: CONV_ID,
        title: 'Local versions',
        updatedAt: STAMP,
        createdAt: STAMP,
        messageCount: messages.length,
        pinned: false,
        model: LOCAL_MODEL,
        provider: 'local',
        executionMode: 'local',
      },
    ],
    messages: { [CONV_ID]: messages },
    currentConversationId: CONV_ID,
  });
}

let alertSpy: jest.SpyInstance;
const realSendMessage = useChatExecutionStore.getState().sendMessage;

function expectNoThreadLeftBehind(expected: ChatMessage[] = THREE_TURNS): void {
  expect(rows()).toEqual(expected);
  expect(rows().every((message) => message.parentId == null)).toBe(true);
  expect(leaf()).toBeUndefined();
}

beforeEach(() => {
  jest.clearAllMocks();
  useSettingsStore.setState({ reduceSensitiveContent: false, isTemporaryChat: false });
  useChatExecutionStore.setState({ isEditing: false, retryAttempts: {}, error: null });
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockListInstalledModels.mockResolvedValue([
    {
      id: LOCAL_MODEL,
      display_name: 'AGI Lite',
      runtime: 'local',
      format: 'pte',
      size_bytes: 1_181_116_006,
      sha256: null,
      local_path: null,
      installed_at: 1,
      last_used_at: null,
      capabilities: null,
    },
  ]);
  mockLocalGenerate.mockImplementation(async () => ({
    text: 'new answer',
    runtime: 'executorch',
    aborted: false,
  }));
  seed();
});

afterEach(() => {
  alertSpy.mockRestore();
  useChatExecutionStore.setState({ sendMessage: realSendMessage });
});

describe('editing an earlier question in a Local chat', () => {
  async function editSecondQuestion(): Promise<ChatMessage> {
    act(() => {
      expect(useChatStore.getState().editMessage(CONV_ID, 'x-u2', 'revised second question')).toBe(
        true,
      );
    });
    await waitFor(
      () => {
        expect(useChatStore.getState().isEditing).toBe(false);
        expect(visibleContents()).toContain('new answer');
      },
      { timeout: 5_000 },
    );
    return rows().find((message) => message.content === 'revised second question')!;
  }

  it('shows the revision and its answer in place of the turns after the question', async () => {
    await editSecondQuestion();

    expect(visibleContents()).toEqual([
      'first question',
      'first answer',
      'revised second question',
      'new answer',
    ]);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('keeps the original question and every turn after it as the earlier version', async () => {
    const revision = await editSecondQuestion();

    expect(variantInfoByMessage(rows(), leaf())[revision.id]).toMatchObject({
      index: 1,
      total: 2,
      previousId: 'x-u2',
    });
    act(() => setLocalActiveLeaf(CONV_ID, resolveLeafForSibling(rows(), 'x-u2')));
    expect(visibleContents()).toEqual(ORIGINAL_CONTENTS);
    expect(variantInfoByMessage(rows(), leaf())['x-u2']).toMatchObject({ index: 0, total: 2 });
  });

  it('gives the model only the turns before the question it revises', async () => {
    await editSecondQuestion();

    const sent = (mockLocalGenerate.mock.calls[0]?.[1].messages ?? []).map((m) => m.content);
    expect(sent).toContain('first answer');
    expect(sent).not.toContain('second answer');
    expect(sent).not.toContain('third question');
  });

  it('continues the version on screen after the person pages back to the original', async () => {
    await editSecondQuestion();
    act(() => setLocalActiveLeaf(CONV_ID, resolveLeafForSibling(rows(), 'x-u2')));
    mockLocalGenerate.mockImplementationOnce(async () => ({
      text: 'fourth answer',
      runtime: 'executorch',
      aborted: false,
    }));

    await act(async () => {
      await useChatStore.getState().sendMessage(CONV_ID, 'fourth question', LOCAL_MODEL);
    });

    expect(visibleContents()).toEqual([...ORIGINAL_CONTENTS, 'fourth question', 'fourth answer']);
    const sent = (mockLocalGenerate.mock.calls.at(-1)?.[1].messages ?? []).map((m) => m.content);
    expect(sent).toContain('third answer');
    expect(sent).not.toContain('revised second question');
  });

  it('changes nothing when the revision is refused', async () => {
    useSettingsStore.setState({ reduceSensitiveContent: true });

    act(() => {
      useChatStore.getState().editMessage(CONV_ID, 'x-u2', 'What does NSFW stand for?');
    });
    await waitFor(() => expect(useChatStore.getState().isEditing).toBe(false));

    expect(alertSpy).toHaveBeenCalledWith(
      'Content not available',
      REDUCED_SENSITIVE_CONTENT_REFUSAL,
    );
    expect(rows()).toEqual(THREE_TURNS);
    expect(leaf()).toBeUndefined();
    expect(mockLocalGenerate).not.toHaveBeenCalled();
  });
});

describe('regenerating an earlier answer in a Local chat', () => {
  async function regenerateFirstAnswer(): Promise<ChatMessage> {
    act(() => useChatStore.getState().retryMessage(CONV_ID, 'y-a1'));
    await waitFor(() => expect(visibleContents()).toContain('new answer'));
    return rows().find((message) => message.content === 'new answer')!;
  }

  it('answers again under the same question without asking first', async () => {
    await regenerateFirstAnswer();

    expect(alertSpy).not.toHaveBeenCalled();
    expect(visibleContents()).toEqual(['first question', 'new answer']);
    const request = mockLocalGenerate.mock.calls[0]?.[1];
    const history = (request?.messages ?? []).map((m) => m.content);
    expect(request?.prompt).toBe('first question');
    expect(history).not.toContain('first question');
    expect(history).not.toContain('first answer');
  });

  it('keeps the earlier answer and its follow-ups one page back', async () => {
    const regenerated = await regenerateFirstAnswer();

    expect(regenerated.parentId).toBe('z-u1');
    expect(variantInfoByMessage(rows(), leaf())[regenerated.id]).toMatchObject({
      index: 1,
      total: 2,
      previousId: 'y-a1',
    });
    act(() => setLocalActiveLeaf(CONV_ID, resolveLeafForSibling(rows(), 'y-a1')));
    expect(visibleContents()).toEqual(ORIGINAL_CONTENTS);
  });

  it('never reaches Cloud', async () => {
    await regenerateFirstAnswer();

    expect(mockStreamChat).not.toHaveBeenCalled();
  });

  it('changes nothing when the new answer is refused', async () => {
    const sensitive = THREE_TURNS.map((message) =>
      message.id === 'z-u1' ? { ...message, content: 'What does NSFW stand for?' } : message,
    );
    seed(sensitive);
    useSettingsStore.setState({ reduceSensitiveContent: true });

    act(() => useChatStore.getState().retryMessage(CONV_ID, 'y-a1'));
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Content not available',
        REDUCED_SENSITIVE_CONTENT_REFUSAL,
      ),
    );

    expect(rows()).toEqual(sensitive);
    expect(leaf()).toBeUndefined();
  });
});

describe('a Local chat whose opening question was revised', () => {
  it('keeps the two openings apart when the revision is answered again', async () => {
    act(() => {
      useChatStore.getState().editMessage(CONV_ID, 'z-u1', 'revised opening');
    });
    await waitFor(() => expect(visibleContents()).toEqual(['revised opening', 'new answer']));
    const opening = rows().find((message) => message.content === 'revised opening')!;
    const answer = rows().find((message) => message.parentId === opening.id)!;

    mockLocalGenerate.mockImplementationOnce(async () => ({
      text: 'second try',
      runtime: 'executorch',
      aborted: false,
    }));
    act(() => useChatStore.getState().retryMessage(CONV_ID, answer.id));
    await waitFor(() => expect(visibleContents()).toEqual(['revised opening', 'second try']));

    expect(rows().find((message) => message.id === opening.id)?.parentId).toBeNull();
    expect(variantInfoByMessage(rows(), leaf())[opening.id]).toMatchObject({ total: 2 });
    act(() => setLocalActiveLeaf(CONV_ID, resolveLeafForSibling(rows(), 'z-u1')));
    expect(visibleContents()).toEqual(ORIGINAL_CONTENTS);
  });
});

describe('an edit or a regenerate that never writes its new version', () => {
  it('leaves no parents behind when the send fails before writing anything', async () => {
    useChatExecutionStore.setState({
      sendMessage: jest.fn(async () => {
        throw new Error('runtime unavailable');
      }),
    });

    act(() => {
      useChatStore.getState().editMessage(CONV_ID, 'x-u2', 'revised second question');
    });
    await waitFor(() => expect(useChatStore.getState().isEditing).toBe(false));

    expectNoThreadLeftBehind();
    expect(useChatExecutionStore.getState().error).toBe(
      'Could not replace the Local message. Please try again.',
    );
  });

  it('leaves no parents behind when another writer replaced the transcript meanwhile', async () => {
    useChatExecutionStore.setState({
      sendMessage: jest.fn(async () => {
        useChatStore.setState((state) => ({
          messages: {
            ...state.messages,
            [CONV_ID]: (state.messages[CONV_ID] ?? []).map((message) => ({ ...message })),
          },
        }));
        return false;
      }),
    });

    act(() => useChatStore.getState().retryMessage(CONV_ID, 'y-a1'));
    await waitFor(() => expect(useChatExecutionStore.getState().sendMessage).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });

    expectNoThreadLeftBehind();
  });

  it('leaves no parents behind when the retry limit stops a regenerate', () => {
    const failed = THREE_TURNS.map((message) =>
      message.id === 'y-a1' ? { ...message, metadata: { streamError: 'timeout' } } : message,
    );
    seed(failed);
    useChatExecutionStore.setState({ retryAttempts: { 'y-a1': 3 } });

    act(() => useChatStore.getState().retryMessage(CONV_ID, 'y-a1'));

    expect(alertSpy).toHaveBeenCalledWith('Retry Limit Reached', expect.any(String), [
      { text: 'OK' },
    ]);
    expectNoThreadLeftBehind(failed);
  });

  function watchSends(): () => Promise<void> {
    const attempts: Promise<boolean>[] = [];
    useChatExecutionStore.setState({
      sendMessage: jest.fn((...args: Parameters<typeof realSendMessage>) => {
        const attempt = realSendMessage(...args);
        attempts.push(attempt);
        return attempt;
      }),
    });
    return async () => {
      await act(async () => {
        await Promise.all(attempts);
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    };
  }

  it('puts everything back when a regenerate is stopped before it streams', async () => {
    const settled = watchSends();
    act(() => {
      useChatStore.getState().retryMessage(CONV_ID, 'y-a1');
      useChatExecutionStore.getState().stopStreaming();
    });
    await settled();

    expectNoThreadLeftBehind();
    expect(mockLocalGenerate).not.toHaveBeenCalled();
  });

  it('keeps the revision on screen when an edit is stopped before it streams', async () => {
    const settled = watchSends();
    act(() => {
      useChatStore.getState().editMessage(CONV_ID, 'x-u2', 'revised second question');
      useChatExecutionStore.getState().stopStreaming();
    });
    await settled();

    const revision = rows().find((message) => message.content === 'revised second question')!;
    expect(leaf()).toBe(revision.id);
    expect(visibleContents()).toEqual([
      'first question',
      'first answer',
      'revised second question',
    ]);
    expect(mockLocalGenerate).not.toHaveBeenCalled();
  });
});

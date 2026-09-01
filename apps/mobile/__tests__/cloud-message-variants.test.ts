jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => 'test-token'),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

jest.mock('../services/api', () => {
  function MockApiPaywallError(this: { name: string; message: string }, feat: string) {
    this.name = 'ApiPaywallError';
    this.message = `Paywall: ${feat}`;
  }
  MockApiPaywallError.prototype = Object.create(Error.prototype);
  return {
    api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
    ApiPaywallError: MockApiPaywallError,
  };
});

jest.mock('../services/streaming', () => ({ streamChat: jest.fn() }));

jest.mock('../services/managedCloudChat', () => ({
  managedCloudChat: { saveMessage: jest.fn(async () => ({ id: 'saved' })) },
}));

jest.mock('../src/features/chat/services/cloudMessageMutations', () => ({
  deleteCloudMessagesRemote: jest.fn(async () => undefined),
  setCloudMessageReactionRemote: jest.fn(async () => undefined),
}));

jest.mock('../services/remoteChatGate', () => {
  class MockRemoteChatDisabledError extends Error {
    readonly code = 'MOBILE_REMOTE_CHAT_DISABLED';
  }
  return {
    getRemoteChatDisabledReason: jest.fn(() => null),
    RemoteChatDisabledError: MockRemoteChatDisabledError,
  };
});

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import { streamChat, type StreamCallbacks } from '../services/streaming';
import { managedCloudChat } from '../services/managedCloudChat';
import { deleteCloudMessagesRemote } from '../src/features/chat/services/cloudMessageMutations';
import { useChatExecutionStore } from '../stores/chat/chatExecutionStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { LOCKED_CLOUD_MODELS } from '../src/features/model-picker/service';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import type { ChatMessage, ConversationSummary } from '../types/chat';

const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;
const mockSaveMessage = managedCloudChat.saveMessage as jest.MockedFunction<
  typeof managedCloudChat.saveMessage
>;
const mockDeleteRemote = deleteCloudMessagesRemote as jest.MockedFunction<
  typeof deleteCloudMessagesRemote
>;

const CONV_ID = '0190a000-0000-7000-8000-0000000000d1';
const U1 = '0190a000-0000-7000-8000-000000000091';
const A1 = '0190a000-0000-7000-8000-0000000000a1';
const U2 = '0190a000-0000-7000-8000-0000000000b2';
const A2 = '0190a000-0000-7000-8000-0000000000c2';
const CLOUD_MODEL = LOCKED_CLOUD_MODELS[0]?.id ?? requireMobileCloudModel().id;

function message(
  id: string,
  role: 'user' | 'assistant',
  content: string,
  createdAt: string,
  parentId?: string | null,
): ChatMessage {
  return {
    id,
    conversationId: CONV_ID,
    role,
    content,
    createdAt,
    model: CLOUD_MODEL,
    ...(parentId === undefined ? {} : { parentId }),
  };
}

function seedConversation(patch: Partial<ConversationSummary>, messages: ChatMessage[]): void {
  useChatCloudMessageStore.getState().addCloudConversation({
    id: CONV_ID,
    title: 'Cloud Chat',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    messageCount: messages.length,
    pinned: false,
    model: CLOUD_MODEL,
    executionMode: 'cloud',
    ...patch,
  });
  useChatCloudMessageStore.getState().setCloudMessages(CONV_ID, messages);
}

function rows(): ChatMessage[] {
  return useChatCloudMessageStore.getState().messages[CONV_ID] ?? [];
}

function activeLeaf(): string | null | undefined {
  return useChatCloudMessageStore.getState().conversations.find((c) => c.id === CONV_ID)
    ?.activeLeafMessageId;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for the turn to settle');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const settledAssistants = () => rows().filter((m) => m.role === 'assistant' && !m.isStreaming);

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('cloud-variants-test-user');
  useCloudSyncStateStore.getState().reset();
  useChatCloudMessageStore.getState().clearCloudData();
  useChatMessageStore.setState({ conversations: [], messages: {} });
  useChatExecutionStore.setState({
    error: null,
    paywallError: null,
    retryAttempts: {},
    isEditing: false,
  });
  useChatAppModeStore.getState().setAppMode('local');
  mockSaveMessage.mockResolvedValue({ id: 'saved' });
  mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
    callbacks.onDelta({ content: 'regenerated answer' });
    callbacks.onDone();
  });
});

describe('regenerate on a threading-capable server', () => {
  beforeEach(() => {
    seedConversation({ activeLeafMessageId: null }, [
      message(U1, 'user', 'the question', '2026-06-01T00:00:00.000Z'),
      message(A1, 'assistant', 'the first answer', '2026-06-01T00:00:01.000Z'),
    ]);
  });

  it('deletes nothing and keeps the answer it is replacing', async () => {
    useChatExecutionStore.getState().retryMessage(CONV_ID, A1);
    await waitFor(() => settledAssistants().length === 2);

    expect(mockDeleteRemote).not.toHaveBeenCalled();
    expect(rows().some((m) => m.id === A1)).toBe(true);
  });

  it('moves the branch point onto the question rather than writing a second one', async () => {
    useChatExecutionStore.getState().retryMessage(CONV_ID, A1);
    await waitFor(() => settledAssistants().length === 2);

    expect(mockSaveMessage).toHaveBeenCalledTimes(1);
    expect(mockSaveMessage).toHaveBeenCalledWith(CONV_ID, {
      id: U1,
      role: 'user',
      content: 'the question',
      model: CLOUD_MODEL,
      parentId: null,
    });
    expect(rows().filter((m) => m.role === 'user')).toHaveLength(1);
  });

  it('hangs the new answer off the same question and follows it with the visible path', async () => {
    useChatExecutionStore.getState().retryMessage(CONV_ID, A1);
    await waitFor(() => settledAssistants().length === 2);

    const regenerated = settledAssistants().find((m) => m.id !== A1);
    expect(regenerated?.parentId).toBe(U1);
    expect(activeLeaf()).toBe(regenerated?.id);
  });

  it('builds the prompt from the path that ends at the question, without the answer being replaced', async () => {
    useChatExecutionStore.getState().retryMessage(CONV_ID, A1);
    await waitFor(() => settledAssistants().length === 2);

    const sent = mockStreamChat.mock.calls[0]?.[0].messages ?? [];
    expect(sent.map((m) => m.content)).not.toContain('the first answer');
    expect(sent.filter((m) => m.content === 'the question')).toHaveLength(1);
  });
});

describe('edit on a threading-capable server', () => {
  beforeEach(() => {
    seedConversation({ activeLeafMessageId: A2 }, [
      message(U1, 'user', 'first question', '2026-06-01T00:00:00.000Z', null),
      message(A1, 'assistant', 'first answer', '2026-06-01T00:00:01.000Z', U1),
      message(U2, 'user', 'second question', '2026-06-01T00:00:02.000Z', A1),
      message(A2, 'assistant', 'second answer', '2026-06-01T00:00:03.000Z', U2),
    ]);
  });

  it('deletes nothing and keeps the turn it revises', async () => {
    useChatExecutionStore.getState().editMessage(CONV_ID, U2, 'revised question');
    await waitFor(() => settledAssistants().length === 3);

    expect(mockDeleteRemote).not.toHaveBeenCalled();
    expect(rows().some((m) => m.id === U2)).toBe(true);
    expect(rows().some((m) => m.id === A2)).toBe(true);
  });

  it('writes the revision as a sibling under the parent of the message it revises', async () => {
    useChatExecutionStore.getState().editMessage(CONV_ID, U2, 'revised question');
    await waitFor(() => settledAssistants().length === 3);

    expect(mockSaveMessage).toHaveBeenCalledTimes(1);
    const [conversationId, request] = mockSaveMessage.mock.calls[0] ?? [];
    expect(conversationId).toBe(CONV_ID);
    expect(request).toMatchObject({
      role: 'user',
      content: 'revised question',
      parentId: A1,
    });
    expect(request?.id).not.toBe(U2);
  });

  it('follows the new branch and leaves the old one reachable but hidden', async () => {
    useChatExecutionStore.getState().editMessage(CONV_ID, U2, 'revised question');
    await waitFor(() => settledAssistants().length === 3);

    const revision = rows().find((m) => m.content === 'revised question');
    const answer = settledAssistants().find((m) => m.parentId === revision?.id);
    expect(revision?.parentId).toBe(A1);
    expect(answer).toBeDefined();
    expect(activeLeaf()).toBe(answer?.id);
  });

  it('keeps the abandoned branch out of the prompt', async () => {
    useChatExecutionStore.getState().editMessage(CONV_ID, U2, 'revised question');
    await waitFor(() => settledAssistants().length === 3);

    const sent = mockStreamChat.mock.calls[0]?.[0].messages ?? [];
    const contents = sent.map((m) => m.content);
    expect(contents).not.toContain('second question');
    expect(contents).not.toContain('second answer');
    expect(contents).toContain('revised question');
  });

  it('revises the opening turn into the root sibling group, with nothing before it', async () => {
    useChatExecutionStore.getState().editMessage(CONV_ID, U1, 'revised opening');
    await waitFor(() => settledAssistants().length === 3);

    expect(mockSaveMessage).toHaveBeenCalledWith(
      CONV_ID,
      expect.objectContaining({ content: 'revised opening', parentId: null }),
    );
    const contents = (mockStreamChat.mock.calls[0]?.[0].messages ?? []).map((m) => m.content);
    expect(contents).not.toContain('first question');
    expect(contents).not.toContain('first answer');
    expect(contents).toContain('revised opening');
  });
});

describe('a pre-threading server keeps the replacing behaviour', () => {
  it('regenerate still deletes the turn it replaces', async () => {
    seedConversation({}, [
      message(U1, 'user', 'the question', '2026-06-01T00:00:00.000Z'),
      message(A1, 'assistant', 'the first answer', '2026-06-01T00:00:01.000Z'),
    ]);

    useChatExecutionStore.getState().retryMessage(CONV_ID, A1);
    await waitFor(() => mockDeleteRemote.mock.calls.length > 0);

    expect(mockDeleteRemote).toHaveBeenCalledWith(CONV_ID, [U1, A1]);
    expect(mockSaveMessage).not.toHaveBeenCalled();
  });

  it('edit still deletes from the revised message onward', async () => {
    seedConversation({}, [
      message(U1, 'user', 'first question', '2026-06-01T00:00:00.000Z'),
      message(A1, 'assistant', 'first answer', '2026-06-01T00:00:01.000Z'),
      message(U2, 'user', 'second question', '2026-06-01T00:00:02.000Z'),
      message(A2, 'assistant', 'second answer', '2026-06-01T00:00:03.000Z'),
    ]);

    useChatExecutionStore.getState().editMessage(CONV_ID, U2, 'revised question');
    await waitFor(() => mockDeleteRemote.mock.calls.length > 0);

    expect(mockDeleteRemote).toHaveBeenCalledWith(CONV_ID, [U2, A2]);
    expect(mockSaveMessage).not.toHaveBeenCalled();
  });
});

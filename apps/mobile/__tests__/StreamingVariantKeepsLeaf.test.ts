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

jest.mock('../services/llmGate', () => ({
  ...jest.requireActual('../services/llmGate'),
  ensureCloudSendConsent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/streaming', () => ({ streamChat: jest.fn() }));

jest.mock('../services/managedCloudChat', () => ({
  managedCloudChat: {
    saveMessage: jest.fn(async () => ({ id: 'saved' })),
    getConversation: jest.fn(),
  },
}));

jest.mock('../src/features/chat/services/cloudMessageMutations', () => ({
  deleteCloudMessagesRemote: jest.fn(async () => undefined),
  setCloudMessageReactionRemote: jest.fn(async () => undefined),
  recordResponseRatingRemote: jest.fn(async () => undefined),
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

import { streamChat } from '../services/streaming';
import { managedCloudChat } from '../services/managedCloudChat';
import { applyConversationDeltas } from '../services/cloudSyncEngine';
import { clearCloudExecutionState, useChatExecutionStore } from '../stores/chat/chatExecutionStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { visibleThreadFor } from '../src/features/chat/utils/conversationThread';
import { requireFreeMobileCloudModel } from '../test-utils/modelFixtures';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import type { ChatMessage, ConversationSummary } from '../types/chat';

const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;
const mockGetConversation = managedCloudChat.getConversation as jest.MockedFunction<
  typeof managedCloudChat.getConversation
>;

const CONV_ID = '0190a000-0000-7000-8000-0000000000e1';
const U1 = '0190a000-0000-7000-8000-0000000000e2';
const A1 = '0190a000-0000-7000-8000-0000000000e3';
const CLOUD_MODEL = requireFreeMobileCloudModel().id;
const CREATED = '2026-11-15T00:00:00.000Z';

function message(id: string, role: 'user' | 'assistant', content: string, parentId: string | null) {
  return {
    id,
    conversationId: CONV_ID,
    role,
    content,
    createdAt: CREATED,
    model: CLOUD_MODEL,
    parentId,
  } satisfies ChatMessage;
}

function conversation(): ConversationSummary | undefined {
  return useChatCloudMessageStore.getState().conversations.find((c) => c.id === CONV_ID);
}

function visibleThread(): ChatMessage[] {
  return visibleThreadFor(
    useChatCloudMessageStore.getState().messages[CONV_ID] ?? [],
    conversation(),
  );
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for the new answer to start');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function startNewAnswer(): Promise<ChatMessage> {
  void useChatExecutionStore
    .getState()
    .sendMessage(CONV_ID, 'the question', CLOUD_MODEL, undefined, {
      regenerateParentMessageId: U1,
    });
  await waitFor(() => mockStreamChat.mock.calls.length > 0);
  const streaming = (useChatCloudMessageStore.getState().messages[CONV_ID] ?? []).find(
    (row) => row.role === 'assistant' && row.isStreaming === true,
  );
  if (!streaming) throw new Error('the new answer never started');
  expect(visibleThread().at(-1)?.id).toBe(streaming.id);
  return streaming;
}

function serverConversation(activeLeafMessageId: string) {
  return {
    id: CONV_ID,
    title: 'Research',
    created_at: CREATED,
    updated_at: '2026-11-15T00:01:00.000Z',
    deleted_at: null,
    model: null,
    project_id: null,
    pinned: false,
    server_version: '9',
    active_leaf_message_id: activeLeafMessageId,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('streaming-leaf-test-user');
  useCloudSyncStateStore.getState().reset();
  useChatCloudMessageStore.getState().clearCloudData();
  useChatMessageStore.setState({ conversations: [], messages: {} });
  useChatExecutionStore.setState({ error: null, paywallError: null, retryAttempts: {} });
  useChatAppModeStore.getState().setAppMode('cloud');
  mockStreamChat.mockImplementation(() => new Promise<void>(() => undefined));
  useChatCloudMessageStore.getState().addCloudConversation({
    id: CONV_ID,
    title: 'Research',
    createdAt: CREATED,
    updatedAt: CREATED,
    messageCount: 2,
    pinned: false,
    model: CLOUD_MODEL,
    executionMode: 'cloud',
    activeLeafMessageId: A1,
  });
  useChatCloudMessageStore
    .getState()
    .setCloudMessages(CONV_ID, [
      message(U1, 'user', 'the question', null),
      message(A1, 'assistant', 'the plan', U1),
    ]);
});

afterEach(() => {
  clearCloudExecutionState();
});

describe('a new answer being written under a question the server already holds', () => {
  it('stays on screen when a sync pull reports the question as the leaf', async () => {
    const streaming = await startNewAnswer();

    applyConversationDeltas([serverConversation(U1)]);

    expect(visibleThread().at(-1)?.id).toBe(streaming.id);
  });

  it('stays on screen when the conversation list carries the question as the leaf', async () => {
    const streaming = await startNewAnswer();
    useCloudSyncStateStore.getState().reset();
    const current = conversation()!;

    useChatCloudMessageStore
      .getState()
      .setCloudConversations([{ ...current, activeLeafMessageId: U1 }]);

    expect(visibleThread().at(-1)?.id).toBe(streaming.id);
  });

  it('stays on screen when reopened history reports the question as the leaf', async () => {
    const streaming = await startNewAnswer();
    mockGetConversation.mockClear();
    mockGetConversation.mockResolvedValue({
      conversation: {
        id: CONV_ID,
        title: 'Research',
        createdAt: CREATED,
        updatedAt: CREATED,
        messageCount: 2,
        activeLeafMessageId: U1,
      },
      messages: [
        message(U1, 'user', 'the question', null),
        message(A1, 'assistant', 'the plan', U1),
      ],
      hasMore: false,
    } as unknown as Awaited<ReturnType<typeof managedCloudChat.getConversation>>);

    await useChatMessageStore.getState().loadMessages(CONV_ID);

    expect(mockGetConversation).toHaveBeenCalledWith(CONV_ID, expect.anything());
    expect(visibleThread().at(-1)?.id).toBe(streaming.id);
  });

  it('still lets the person move to the earlier answer while the new one is written', async () => {
    await startNewAnswer();

    useChatCloudMessageStore
      .getState()
      .patchCloudConversation(CONV_ID, { activeLeafMessageId: A1 });

    expect(visibleThread().at(-1)?.id).toBe(A1);
  });

  it('follows the server leaf again once the answer is no longer being written', () => {
    applyConversationDeltas([serverConversation(U1)]);

    expect(conversation()?.activeLeafMessageId).toBe(U1);
  });
});

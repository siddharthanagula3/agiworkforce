jest.mock('../services/authSession', () => ({
  ...jest.requireActual('../services/authSession'),
  getAuthToken: jest.fn(async () => 'test-token'),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

jest.mock('../services/api', () => ({
  ...jest.requireActual('../services/api'),
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('../services/llmGate', () => ({
  ...jest.requireActual('../services/llmGate'),
  ensureCloudSendConsent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/streaming', () => ({
  ...jest.requireActual('../services/streaming'),
  streamChat: jest.fn(),
}));

jest.mock('../services/managedCloudChat', () => ({
  ...jest.requireActual('../services/managedCloudChat'),
  managedCloudChat: { saveMessage: jest.fn(async () => ({ id: 'saved' })) },
}));

jest.mock('../src/features/chat/services/cloudMessageMutations', () => ({
  ...jest.requireActual('../src/features/chat/services/cloudMessageMutations'),
  deleteCloudMessagesRemote: jest.fn(async () => undefined),
}));

jest.mock('../services/remoteChatGate', () => ({
  ...jest.requireActual('../services/remoteChatGate'),
  getRemoteChatDisabledReason: jest.fn(() => null),
}));

jest.mock('../lib/mmkv', () => ({
  ...jest.requireActual('../lib/mmkv'),
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

import { Alert } from 'react-native';
import { streamChat, type StreamCallbacks } from '../services/streaming';
import { deleteCloudMessagesRemote } from '../src/features/chat/services/cloudMessageMutations';
import { useChatExecutionStore } from '../stores/chat/chatExecutionStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { requireFreeMobileCloudModel } from '../test-utils/modelFixtures';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import type { ChatMessage } from '../types/chat';

const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;
const mockDeleteRemote = deleteCloudMessagesRemote as jest.MockedFunction<
  typeof deleteCloudMessagesRemote
>;

const OWNER_ID = 'unanswered-question-test-user';
const CONV_ID = '0190a000-0000-7000-8000-0000000000a1';
const QUESTION_ID = '0190a000-0000-7000-8000-0000000000a2';
const CLOUD_MODEL = requireFreeMobileCloudModel().id;

const QUESTION: ChatMessage = {
  id: QUESTION_ID,
  conversationId: CONV_ID,
  role: 'user',
  content: 'Search the web for the top science headline',
  createdAt: '2026-11-16T00:00:00.000Z',
  model: CLOUD_MODEL,
};

function rows(): ChatMessage[] {
  return useChatCloudMessageStore.getState().messages[CONV_ID] ?? [];
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for the turn to settle');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  activateCloudAccount(OWNER_ID);
  useCloudSyncStateStore.getState().reset();
  useChatCloudMessageStore.getState().clearCloudData();
  useChatMessageStore.setState({ conversations: [], messages: {} });
  useChatExecutionStore.setState({
    error: null,
    paywallError: null,
    retryAttempts: {},
    isEditing: false,
  });
  useChatAppModeStore.getState().setAppMode('cloud');
  useChatCloudMessageStore.getState().addCloudConversation({
    id: CONV_ID,
    title: 'Science headline',
    createdAt: '2026-11-16T00:00:00.000Z',
    updatedAt: '2026-11-16T00:00:00.000Z',
    messageCount: 1,
    pinned: false,
    model: CLOUD_MODEL,
    executionMode: 'cloud',
  });
  useChatCloudMessageStore.getState().setCloudMessages(CONV_ID, [QUESTION]);
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
    callbacks.onDelta({ content: 'Two lines about the headline.' });
    callbacks.onDone();
  });
});

afterEach(() => {
  alertSpy.mockRestore();
});

describe('asking again for a question the server never answered', () => {
  it('runs the turn once and keeps one copy of the question', async () => {
    useChatExecutionStore.getState().retryMessage(CONV_ID, QUESTION_ID);
    await waitFor(() => rows().some((row) => row.content === 'Two lines about the headline.'));

    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockStreamChat).toHaveBeenCalledTimes(1);
    const questions = rows().filter((row) => row.role === 'user');
    expect(questions).toHaveLength(1);
    expect(questions[0]!.content).toBe(QUESTION.content);
    expect(rows().map((row) => row.role)).toEqual(['user', 'assistant']);
    await waitFor(() => mockDeleteRemote.mock.calls.length > 0);
    expect(mockDeleteRemote).toHaveBeenCalledTimes(1);
    expect(mockDeleteRemote.mock.calls[0]![1]).toEqual([QUESTION_ID]);
  });
});

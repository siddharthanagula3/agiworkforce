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
  managedCloudChat: { saveMessage: jest.fn(async () => ({ id: 'saved' })) },
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

import { Alert, type AlertButton } from 'react-native';
import { streamChat, type StreamCallbacks } from '../services/streaming';
import { deleteCloudMessagesRemote } from '../src/features/chat/services/cloudMessageMutations';
import { useArtifactStore } from '../src/features/artifacts/store';
import type { MobileArtifact } from '../src/features/artifacts/types';
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

const OWNER_ID = 'saved-code-edit-test-user';
const CONV_ID = '0190a000-0000-7000-8000-0000000000f1';
const U1 = '0190a000-0000-7000-8000-0000000000f2';
const A1 = '0190a000-0000-7000-8000-0000000000f3';
const U2 = '0190a000-0000-7000-8000-0000000000f4';
const A2 = '0190a000-0000-7000-8000-0000000000f5';
const CLOUD_MODEL = requireFreeMobileCloudModel().id;

function message(
  id: string,
  role: 'user' | 'assistant',
  content: string,
  createdAt: string,
): ChatMessage {
  return { id, conversationId: CONV_ID, role, content, createdAt, model: CLOUD_MODEL };
}

const TWO_TURNS = [
  message(U1, 'user', 'first question', '2026-06-01T00:00:00.000Z'),
  message(A1, 'assistant', 'first answer', '2026-06-01T00:00:01.000Z'),
  message(U2, 'user', 'second question', '2026-06-01T00:00:02.000Z'),
  message(A2, 'assistant', 'second answer', '2026-06-01T00:00:03.000Z'),
];

function codeArtifact(id: string, messageId: string, editedAt?: string): MobileArtifact {
  return {
    id,
    messageId,
    title: 'page.html',
    kind: 'code',
    language: 'html',
    content: '<p>hello</p>',
    ageLabel: 'Just now',
    createdAt: '2026-06-01T00:00:01.000Z',
    ...(editedAt ? { editedAt } : {}),
    sourceLabel: 'AGI Cloud',
    accentColor: '#000000',
    previewLines: ['<p>hello</p>'],
    provenance: { scope: 'cloud', ownerId: OWNER_ID },
  };
}

const SAVED_EDIT = codeArtifact('saved-edit', A1, '2026-06-01T00:05:00.000Z');
const UNEDITED = codeArtifact('unedited', A1);
const LATER_UNEDITED = codeArtifact('later-unedited', A2);

function artifactIds(): string[] {
  return useArtifactStore.getState().artifacts.map((artifact) => artifact.id);
}

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
  useChatAppModeStore.getState().setAppMode('local');
  useArtifactStore.getState().clearArtifacts();
  useArtifactStore.setState({ artifacts: [SAVED_EDIT, UNEDITED, LATER_UNEDITED] });
  useChatCloudMessageStore.getState().addCloudConversation({
    id: CONV_ID,
    title: 'Cloud Chat',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    messageCount: TWO_TURNS.length,
    pinned: false,
    model: CLOUD_MODEL,
    executionMode: 'cloud',
  });
  useChatCloudMessageStore.getState().setCloudMessages(CONV_ID, TWO_TURNS);
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
    callbacks.onDelta({ content: 'replacement answer' });
    callbacks.onDone();
  });
});

afterEach(() => {
  alertSpy.mockRestore();
});

describe('replacing answers that carry a saved code edit', () => {
  it('keeps the saved edit when an earlier answer is regenerated', async () => {
    useChatExecutionStore.getState().retryMessage(CONV_ID, A1);
    const buttons = (alertSpy.mock.calls.at(-1)?.[2] ?? []) as AlertButton[];
    buttons.find((button) => button.text === 'Regenerate')?.onPress?.();
    await waitFor(() => mockDeleteRemote.mock.calls.length > 0);
    await waitFor(() => rows().some((row) => row.content === 'replacement answer'));

    expect(artifactIds()).toEqual(['saved-edit']);
    expect(useArtifactStore.getState().artifacts[0]).toMatchObject({
      messageId: A1,
      content: '<p>hello</p>',
      editedAt: '2026-06-01T00:05:00.000Z',
    });
  });

  it('keeps the saved edit when an earlier question is edited and sent again', async () => {
    useChatExecutionStore.getState().editMessage(CONV_ID, U1, 'revised first question');
    await waitFor(() => mockDeleteRemote.mock.calls.length > 0);
    await waitFor(() => !useChatExecutionStore.getState().isEditing);

    expect(artifactIds()).toEqual(['saved-edit']);
  });
});

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
import { resolveVisibleThread } from '@agiworkforce/cloud-contracts';
import { streamChat, type StreamCallbacks } from '../services/streaming';
import { deleteCloudMessagesRemote } from '../src/features/chat/services/cloudMessageMutations';
import { useSettingsStore } from '../stores/settingsStore';
import { confirmBeforeRewrite, useChatExecutionStore } from '../stores/chat/chatExecutionStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { requireFreeMobileCloudModel } from '../test-utils/modelFixtures';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import type { ChatMessage, ConversationSummary } from '../types/chat';

const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;
const mockDeleteRemote = deleteCloudMessagesRemote as jest.MockedFunction<
  typeof deleteCloudMessagesRemote
>;

const CONV_ID = '0190a000-0000-7000-8000-0000000000e1';
const U1 = '0190a000-0000-7000-8000-0000000000e2';
const A1 = '0190a000-0000-7000-8000-0000000000e3';
const U2 = '0190a000-0000-7000-8000-0000000000e4';
const A2 = '0190a000-0000-7000-8000-0000000000e5';
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

function visibleContents(): string[] {
  const leaf = useChatCloudMessageStore
    .getState()
    .conversations.find((c) => c.id === CONV_ID)?.activeLeafMessageId;
  return resolveVisibleThread(rows(), leaf).map((row) => row.content);
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for the turn to settle');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function pressAlertButton(alertSpy: jest.SpyInstance, label: string): void {
  const buttons = (alertSpy.mock.calls.at(-1)?.[2] ?? []) as AlertButton[];
  const button = buttons.find((candidate) => candidate.text === label);
  if (!button?.onPress) throw new Error(`no ${label} button`);
  button.onPress();
}

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('safe-edit-test-user');
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
  useSettingsStore.setState({ reduceSensitiveContent: false });
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
    callbacks.onDelta({ content: 'regenerated answer' });
    callbacks.onDone();
  });
});

afterEach(() => {
  alertSpy.mockRestore();
});

describe('regenerating an earlier answer on a server that cannot keep versions', () => {
  beforeEach(() => seedConversation({}, TWO_TURNS));

  it('asks first and names how many messages it removes', () => {
    useChatExecutionStore.getState().retryMessage(CONV_ID, A1);

    expect(alertSpy).toHaveBeenCalledWith(
      'Regenerate this answer?',
      "This replaces this answer and removes the 2 messages after it. They can't be recovered.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Regenerate', style: 'destructive', onPress: expect.any(Function) },
      ],
    );
    expect(mockStreamChat).not.toHaveBeenCalled();
    expect(rows()).toEqual(TWO_TURNS);
  });

  it('changes nothing when the person cancels', async () => {
    useChatExecutionStore.getState().retryMessage(CONV_ID, A1);
    const cancel = ((alertSpy.mock.calls[0]?.[2] ?? []) as AlertButton[]).find(
      (button) => button.text === 'Cancel',
    );
    cancel?.onPress?.();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(rows()).toEqual(TWO_TURNS);
    expect(mockStreamChat).not.toHaveBeenCalled();
    expect(mockDeleteRemote).not.toHaveBeenCalled();
    expect(useChatExecutionStore.getState().retryAttempts).toEqual({});
  });

  it('replaces the answer and the turns after it once the person confirms', async () => {
    useChatExecutionStore.getState().retryMessage(CONV_ID, A1);
    pressAlertButton(alertSpy, 'Regenerate');
    await waitFor(() => mockDeleteRemote.mock.calls.length > 0);

    expect(mockDeleteRemote).toHaveBeenCalledWith(
      CONV_ID,
      [U1, A1, U2, A2],
      expect.objectContaining({ ownerId: 'safe-edit-test-user' }),
    );
    await waitFor(() => rows().some((row) => row.content === 'regenerated answer'));
    expect(rows().map((row) => row.content)).toEqual(['first question', 'regenerated answer']);
  });

  it('asks nothing for the last answer', async () => {
    useChatExecutionStore.getState().retryMessage(CONV_ID, A2);
    await waitFor(() => mockStreamChat.mock.calls.length > 0);

    expect(alertSpy).not.toHaveBeenCalled();
  });
});

describe('editing an earlier question on a server that cannot keep versions', () => {
  beforeEach(() => seedConversation({}, TWO_TURNS));

  it('asks first and names every message after the question', () => {
    const proceed = jest.fn();
    confirmBeforeRewrite(CONV_ID, U1, 'edit', proceed);

    expect(alertSpy).toHaveBeenCalledWith(
      'Edit and resend?',
      "This removes the 3 messages after this one. They can't be recovered.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Edit and resend', style: 'destructive', onPress: proceed },
      ],
    );
    expect(proceed).not.toHaveBeenCalled();
  });

  it('goes ahead without asking for the last question', () => {
    const proceed = jest.fn();
    confirmBeforeRewrite(CONV_ID, U2, 'edit', proceed);

    expect(alertSpy).not.toHaveBeenCalled();
    expect(proceed).toHaveBeenCalledTimes(1);
  });

  it('goes ahead without asking when the server keeps versions', () => {
    useChatCloudMessageStore
      .getState()
      .patchCloudConversation(CONV_ID, { activeLeafMessageId: null });
    const proceed = jest.fn();
    confirmBeforeRewrite(CONV_ID, U1, 'edit', proceed);

    expect(alertSpy).not.toHaveBeenCalled();
    expect(proceed).toHaveBeenCalledTimes(1);
  });
});

describe('a revised opening question on a server that keeps versions', () => {
  it('stays a separate version when its answer is regenerated', async () => {
    seedConversation({ activeLeafMessageId: null }, TWO_TURNS);

    useChatExecutionStore.getState().editMessage(CONV_ID, U1, 'revised opening');
    await waitFor(() => !useChatExecutionStore.getState().isEditing);
    await waitFor(() => rows().some((row) => row.content === 'regenerated answer'));
    const revised = rows().find((row) => row.content === 'revised opening');
    const revisedAnswer = rows().find((row) => row.parentId === revised?.id);
    expect(revised?.parentId).toBeNull();

    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ content: 'second try' });
      callbacks.onDone();
    });
    useChatExecutionStore.getState().retryMessage(CONV_ID, revisedAnswer!.id);
    await waitFor(() => rows().some((row) => row.content === 'second try'));

    expect(rows().find((row) => row.id === revised?.id)?.parentId).toBeNull();
    expect(visibleContents()).toEqual(['revised opening', 'second try']);
    const sent = (mockStreamChat.mock.calls.at(-1)?.[0].messages ?? []).map((m) => m.content);
    expect(sent).not.toContain('second answer');
  });
});

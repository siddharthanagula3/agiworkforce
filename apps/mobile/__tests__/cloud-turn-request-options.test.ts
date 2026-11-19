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

const mockCancelCloudRun = jest.fn();
jest.mock('../src/features/tasks/service', () => ({
  ...jest.requireActual('../src/features/tasks/service'),
  cancelCloudRun: (...args: unknown[]) => mockCancelCloudRun(...args),
}));

const mockEnsureCloudSendConsent = jest.fn();
jest.mock('../services/llmGate', () => ({
  ...jest.requireActual('../services/llmGate'),
  ensureCloudSendConsent: (...args: unknown[]) => mockEnsureCloudSendConsent(...args),
}));

const mockUploadWithRetry = jest.fn();
jest.mock('../src/features/chat/upload/uploadAttachment', () => ({
  ...jest.requireActual('../src/features/chat/upload/uploadAttachment'),
  uploadWithRetry: (...args: unknown[]) => mockUploadWithRetry(...args),
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

jest.mock('@agiworkforce/local-llm', () => {
  const actual = jest.requireActual('@agiworkforce/local-llm');
  return {
    ...actual,
    localGenerate: jest.fn(),
    getCapabilities: jest.fn().mockResolvedValue({ tier2Available: true, tier3Available: true }),
  };
});

jest.mock('../storage/installedModels', () => ({
  listInstalledModels: jest.fn().mockResolvedValue([]),
  getInstalledModel: jest.fn().mockResolvedValue(null),
  markInstalledModelUsed: jest.fn().mockResolvedValue(undefined),
}));

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

import { Alert } from 'react-native';
import { waitFor } from '@testing-library/react-native';
import { PROJECT_FILE_CITATIONS_METADATA_KEY } from '@agiworkforce/types';
import { PAST_CHAT_CITATIONS_METADATA_KEY } from '../src/features/chat/utils/referenceCitations';
import { streamChat, type StreamCallbacks } from '../services/streaming';
import { managedCloudChat } from '../services/managedCloudChat';
import {
  ManagedCloudAgentRunHttpError,
  managedCloudAgentRunPath,
} from '@agiworkforce/cloud-contracts';
import { clearCloudExecutionState, useChatExecutionStore } from '../stores/chat/chatExecutionStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';
import { useTierStore } from '../src/features/billing/store';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import type { ChatMessage } from '../types/chat';
import { CLOUD_RUN_CANCEL_ERROR } from '../src/features/tasks/service';

const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;
const MODEL = requireMobileCloudModel().id;
const CONV_A = '0190a000-0000-7000-8000-0000000000c1';
const CONV_B = '0190a000-0000-7000-8000-0000000000c2';

const LIVE_CARD = {
  schemaVersion: 1,
  cardId: 'fixture-live-map',
  kind: 'map-search.v1',
  createdAt: '2026-11-14T12:00:00.000Z',
  fallback: { headline: 'Tulip farms', text: 'Map results for tulip farms.' },
  producedBy: { toolCallId: 'fixture-live-map', toolName: 'search_maps' },
  body: {
    title: 'Tulip farms',
    query: 'tulip farms',
    actions: [
      {
        provider: 'google_maps',
        label: 'Open in Google Maps',
        url: 'https://www.google.com/maps/search/?api=1&query=tulip%20farms',
      },
    ],
    view: { latitude: 52.27, longitude: 4.55, zoom: 10, attribution: 'OpenStreetMap contributors' },
    places: [],
  },
};

function seedCloudConversation(id: string) {
  useChatCloudMessageStore.getState().addCloudConversation({
    id,
    title: `Chat ${id.slice(-2)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: 0,
    pinned: false,
    model: MODEL,
    executionMode: 'cloud',
  });
}

function assistantIn(conversationId: string): ChatMessage | undefined {
  return (useChatCloudMessageStore.getState().messages[conversationId] ?? []).find(
    (message) => message.role === 'assistant',
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEnsureCloudSendConsent.mockReset().mockResolvedValue(undefined);
  __resetCloudAccountSessionForTests();
  activateCloudAccount('live-turn-state-user');
  useCloudSyncStateStore.getState().reset();
  useChatCloudMessageStore.getState().clearCloudData();
  useChatMessageStore.setState({ conversations: [], messages: {}, currentConversationId: null });
  useChatExecutionStore.setState({
    error: null,
    failureCode: null,
    paywallError: null,
    providerConsentError: null,
    freeCapacityError: null,
    errorConversationId: null,
    errorRetry: null,
    retryAttempts: {},
  });
  useTierStore.setState({ tier: 'max', billingTier: 'max' });
  seedCloudConversation(CONV_A);
  seedCloudConversation(CONV_B);
});

afterEach(() => {
  jest.restoreAllMocks();
  clearCloudExecutionState();
});

const PROJECT_SOURCE = { fileName: 'beds.pdf', fileId: 'file-beds', projectId: 'project-garden' };
const PAST_CHAT_SOURCE = {
  id: 'past-1',
  conversationId: CONV_B,
  messageId: 'past-message-1',
  title: 'Spring planting',
  createdAt: '2026-11-01T09:00:00.000Z',
};

describe('where a card sits in the answer it arrived with', () => {
  it('records how much text came before each card, and zero for a card ahead of any text', async () => {
    const leadCard = { ...LIVE_CARD, cardId: 'fixture-lead-map' };
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ x_interactive_card: { card: leadCard } });
      callbacks.onDelta({ content: 'Here are the farms.' });
      callbacks.onDelta({ x_interactive_card: { card: LIVE_CARD } });
      callbacks.onDelta({ content: ' Pick one to visit.' });
      callbacks.onDone();
    });

    await useChatExecutionStore.getState().sendMessage(CONV_A, 'Tulip farms near me', MODEL);

    expect(assistantIn(CONV_A)?.metadata?.interactiveCardTextOffsets).toEqual({
      'fixture-lead-map': 0,
      'fixture-live-map': 'Here are the farms.'.length,
    });
  });
});

describe('project files and past chats an answer used', () => {
  it('keeps them on the answer they came with', async () => {
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onProjectSources?.([PROJECT_SOURCE]);
      callbacks.onPastChatSources?.([PAST_CHAT_SOURCE]);
      callbacks.onDelta({ content: 'Plant them in October, as you planned.' });
      callbacks.onDone();
    });

    await useChatExecutionStore.getState().sendMessage(CONV_A, 'When do I plant?', MODEL);

    const metadata = assistantIn(CONV_A)?.metadata as Record<string, unknown> | undefined;
    expect(metadata?.[PROJECT_FILE_CITATIONS_METADATA_KEY]).toEqual([PROJECT_SOURCE]);
    expect(metadata?.[PAST_CHAT_CITATIONS_METADATA_KEY]).toEqual([PAST_CHAT_SOURCE]);
  });
});

describe('what the gateway says about how it answered', () => {
  it('keeps the model move, the free lane and the removed secrets on the answer', async () => {
    const movedFrom = requireMobileCloudModel((model) => model.id !== MODEL).id;
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onTurnNotices?.({
        movedFromModel: movedFrom,
        movedReason: 'capability',
        routeLane: 'free',
        secretRedactionCount: 2,
      });
      callbacks.onDelta({ content: 'Plant them in October.' });
      callbacks.onDone();
    });

    await useChatExecutionStore.getState().sendMessage(CONV_A, 'When do I plant?', MODEL);

    expect(assistantIn(CONV_A)?.metadata).toEqual(
      expect.objectContaining({
        movedFromModel: movedFrom,
        movedReason: 'capability',
        routeLane: 'free',
        secretRedactionCount: 2,
      }),
    );
  });
});

describe('code the answer ran', () => {
  it('keeps the output and exit code on the answer, and nothing for a failed run', async () => {
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({
        x_code_result: {
          type: 'code_execution_tool_result',
          tool_use_id: 'run-1',
          content: { type: 'code_execution_result', stdout: '4\n', stderr: 'warn', return_code: 0 },
        },
      });
      callbacks.onDelta({ content: 'The answer is 4.' });
      callbacks.onDone();
    });
    await useChatExecutionStore.getState().sendMessage(CONV_A, 'What is 2 + 2?', MODEL);

    expect(assistantIn(CONV_A)?.metadata?.codeExecutionResult).toEqual({
      stdout: '4\n',
      stderr: 'warn',
      returnCode: 0,
    });
    expect(assistantIn(CONV_A)?.metadata?.isExecutingCode).toBe(false);

    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({
        x_code_result: {
          type: 'code_execution_tool_result',
          tool_use_id: 'run-2',
          content: { type: 'code_execution_tool_result_error', error_code: 'unavailable' },
        },
      });
      callbacks.onDelta({ content: 'The run failed.' });
      callbacks.onDone();
    });
    await useChatExecutionStore.getState().sendMessage(CONV_B, 'Run it', MODEL);

    expect(assistantIn(CONV_B)?.metadata).not.toHaveProperty('codeExecutionResult');
  });
});

describe('asking for another answer', () => {
  function seedAnsweredQuestion(answerMetadata: Record<string, unknown> = {}) {
    jest.spyOn(managedCloudChat, 'saveMessage').mockResolvedValue({ id: 'saved' } as never);
    useChatCloudMessageStore.setState((state) => ({
      conversations: state.conversations.map((conversation) =>
        conversation.id === CONV_A
          ? { ...conversation, activeLeafMessageId: 'first-answer' }
          : conversation,
      ),
      messages: {
        ...state.messages,
        [CONV_A]: [
          {
            id: 'asked-question',
            role: 'user',
            content: 'Name a tulip',
            createdAt: '2026-11-14T10:00:00.000Z',
            model: MODEL,
            parentId: null,
          },
          {
            id: 'first-answer',
            role: 'assistant',
            content: 'Queen of Night.',
            createdAt: '2026-11-14T10:00:01.000Z',
            model: MODEL,
            parentId: 'asked-question',
            metadata: answerMetadata,
          },
        ],
      },
    }));
  }

  it('lets a person ask again as often as they like when the answers did not fail', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    seedAnsweredQuestion();
    let sends = 0;
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      sends += 1;
      callbacks.onDelta({ content: `Answer ${sends}.` });
      callbacks.onDone();
    });

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      useChatExecutionStore.getState().retryMessage(CONV_A, 'asked-question');
      await waitFor(() => expect(sends).toBe(attempt));
      await waitFor(() => expect(useChatExecutionStore.getState().isStreaming).toBe(false));
    }

    expect(alert).not.toHaveBeenCalledWith(
      'Retry Limit Reached',
      expect.anything(),
      expect.anything(),
    );
    expect(useChatExecutionStore.getState().retryAttempts['asked-question']).toBeUndefined();
  });

  it('counts a retry of a failed answer toward the limit', async () => {
    seedAnsweredQuestion({ streamError: { message: 'Something went wrong. Please try again.' } });
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDone();
    });

    useChatExecutionStore.getState().retryMessage(CONV_A, 'asked-question');

    expect(useChatExecutionStore.getState().retryAttempts['asked-question']).toBe(1);
    await waitFor(() => expect(mockStreamChat).toHaveBeenCalledTimes(1));
  });
});

describe('editing a question that had files', () => {
  it('sends the edit with the files the person kept', async () => {
    const kept = {
      url: 'https://files.example.net/asset-kept',
      mimeType: 'image/png',
      fileName: 'kept.png',
      fileSize: 2048,
      assetId: 'asset-kept',
    };
    useChatCloudMessageStore.setState((state) => ({
      messages: {
        ...state.messages,
        [CONV_A]: [
          {
            id: 'edited-question',
            role: 'user',
            content: 'What are these?',
            createdAt: '2026-11-14T10:00:00.000Z',
            model: MODEL,
            attachments: [
              kept,
              {
                url: 'https://files.example.net/asset-removed',
                mimeType: 'image/png',
                fileName: 'removed.png',
                assetId: 'asset-removed',
              },
            ],
          },
        ],
      },
    }));
    const sendMessage = jest.fn(async () => true);
    const realSendMessage = useChatExecutionStore.getState().sendMessage;
    useChatExecutionStore.setState({ sendMessage });

    try {
      expect(
        useChatExecutionStore
          .getState()
          .editMessage(CONV_A, 'edited-question', 'What is this one?', [kept]),
      ).toBe(true);
      await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    } finally {
      useChatExecutionStore.setState({ sendMessage: realSendMessage, isEditing: false });
    }

    expect(sendMessage.mock.calls[0]).toEqual([
      CONV_A,
      'What is this one?',
      MODEL,
      [expect.objectContaining({ assetId: 'asset-kept', fileName: 'kept.png' })],
      expect.anything(),
    ]);
  });
});

describe('cancelling a Work plan', () => {
  const RUN_ID = '0190a000-0000-7000-8000-0000000000e9';

  function seedPlanAwaitingApproval() {
    useChatCloudMessageStore.setState((state) => ({
      messages: {
        ...state.messages,
        [CONV_A]: [
          {
            id: 'plan-question',
            role: 'user',
            content: 'Plan the spring beds',
            createdAt: '2026-11-14T10:00:00.000Z',
            model: MODEL,
          },
          {
            id: 'plan-answer',
            role: 'assistant',
            content: 'Here is the plan.',
            createdAt: '2026-11-14T10:00:01.000Z',
            model: MODEL,
            metadata: {
              agiWorkPlan: [
                { id: 'step-1', description: 'Measure the beds', status: 'pending' },
                { id: 'step-2', description: 'Order bulbs', status: 'pending' },
              ],
              agiWorkPlanReview: { goal: { goal: 'Plan the spring beds' }, awaitingApproval: true },
              cloudAgentRun: {
                runId: RUN_ID,
                runPath: managedCloudAgentRunPath(RUN_ID),
                lastSequence: 3,
              },
            },
          },
        ],
      },
    }));
  }

  function planAnswer() {
    return (useChatCloudMessageStore.getState().messages[CONV_A] ?? []).find(
      (message) => message.id === 'plan-answer',
    );
  }

  beforeEach(() => mockCancelCloudRun.mockReset());

  it('stops the Cloud run that waits for the approval, not only the plan on screen', async () => {
    seedPlanAwaitingApproval();
    mockCancelCloudRun.mockResolvedValue({ id: RUN_ID, state: 'cancelled' });

    await useChatExecutionStore
      .getState()
      .resolveAgiWorkPlan(CONV_A, 'plan-answer', { kind: 'cancel' });

    expect(mockCancelCloudRun).toHaveBeenCalledWith(RUN_ID);
    expect(planAnswer()?.metadata?.agiWorkPlanReview).toMatchObject({ awaitingApproval: false });
    expect(useChatExecutionStore.getState().error).toBeNull();
  });

  it('accepts a run the server no longer has', async () => {
    seedPlanAwaitingApproval();
    mockCancelCloudRun.mockRejectedValue(new ManagedCloudAgentRunHttpError('Not found', 404));

    await useChatExecutionStore
      .getState()
      .resolveAgiWorkPlan(CONV_A, 'plan-answer', { kind: 'cancel' });

    expect(useChatExecutionStore.getState().error).toBeNull();
  });

  it('says so when the run could not be stopped', async () => {
    seedPlanAwaitingApproval();
    mockCancelCloudRun.mockRejectedValue(new ManagedCloudAgentRunHttpError('Unavailable', 503));

    await useChatExecutionStore
      .getState()
      .resolveAgiWorkPlan(CONV_A, 'plan-answer', { kind: 'cancel' });

    expect(useChatExecutionStore.getState().error).toBe(CLOUD_RUN_CANCEL_ERROR);
    expect(planAnswer()?.metadata?.agiWorkPlanReview).toMatchObject({ awaitingApproval: false });
  });
});

describe('an image request the server asked to retry later', () => {
  it('keeps the time it can be tried again on the failed image', () => {
    useChatCloudMessageStore.setState((state) => ({
      messages: {
        ...state.messages,
        [CONV_A]: [
          {
            id: 'image-answer',
            role: 'assistant',
            content: '',
            createdAt: '2026-11-14T10:00:01.000Z',
            isGeneratingImage: true,
            imageGenStatus: 'generating',
            imageGenPrompt: 'A red tulip',
          },
        ],
      },
    }));
    const retryAt = Date.parse('2026-11-14T10:05:00.000Z');

    useChatMessageStore
      .getState()
      .failImageGeneration(CONV_A, 'image-answer', 'Too many images right now.', retryAt);

    expect(
      (useChatCloudMessageStore.getState().messages[CONV_A] ?? []).find(
        (message) => message.id === 'image-answer',
      ),
    ).toMatchObject({ imageGenStatus: 'failed', imageGenRetryAt: retryAt });
  });
});

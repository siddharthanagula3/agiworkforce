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
    api: {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      uploadFile: jest.fn(),
    },
    ApiPaywallError: MockApiPaywallError,
  };
});

jest.mock('../services/streaming', () => ({ streamChat: jest.fn() }));

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
import { api } from '../services/api';
import { streamChat, type StreamCallbacks } from '../services/streaming';
import { ApiHttpError } from '../services/apiErrors';
import { managedCloudChat } from '../services/managedCloudChat';
import { ManagedCloudChatHttpError } from '@agiworkforce/cloud-contracts';
import { clearCloudExecutionState, useChatExecutionStore } from '../stores/chat/chatExecutionStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { requireFreeMobileCloudModel } from '../test-utils/modelFixtures';
import { AGENT_EVENT_SCHEMA_VERSION, getProviderOfferings } from '@agiworkforce/types';
import { useFreeQuotaCatalogueStore } from '../src/features/model-picker/freeQuotaCatalogue';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
  captureCloudAccountEpoch,
  invalidateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;

const CONV_ID = '0190a000-0000-7000-8000-000000000002';
const CLOUD_MODEL = requireFreeMobileCloudModel().id;

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('cloud-stream-test-user');
  useCloudSyncStateStore.getState().reset();
  useChatCloudMessageStore.getState().clearCloudData();
  useChatMessageStore.setState({ conversations: [], messages: {} });
  useChatExecutionStore.setState({ error: null, paywallError: null });
  useChatAppModeStore.getState().setAppMode('local');
  useChatCloudMessageStore.getState().addCloudConversation({
    id: CONV_ID,
    title: 'Cloud Chat',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: 0,
    pinned: false,
    model: CLOUD_MODEL,
    executionMode: 'cloud',
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

function lastAssistantMessage() {
  const msgs = useChatCloudMessageStore.getState().messages[CONV_ID] ?? [];
  return msgs.find((m) => m.role === 'assistant');
}

function readyPromotionalChatModel(requiresImageInput = false): string {
  const offering = Object.entries(getProviderOfferings()).find(
    ([, candidate]) =>
      candidate.provider === 'qwen' &&
      candidate.quotaProbeProtocol === 'chat' &&
      (!requiresImageInput || candidate.quotaChatImageInput === true),
  );
  if (!offering) throw new Error('Expected a Qwen chat offering in the generated catalog.');
  const model = offering[0];
  useFreeQuotaCatalogueStore.setState({
    account: captureCloudAccountEpoch(),
    catalogue: {
      issuer: 'QwenCloud',
      observedOn: '2026-09-27',
      evidenceUrl: 'https://docs.qwencloud.com/resources/free-quota',
      reportedEligible: 1,
      reportedUnavailable: 0,
      models: [
        {
          key: model,
          displayName: 'Provider-funded chat',
          providerModelId: null,
          category: 'chat',
          limit: 100,
          unit: 'tokens',
          consumedApproximate: 0,
          expiresOn: null,
          status: 'ready',
        },
      ],
    },
    error: null,
    loading: false,
  });
  (api.get as jest.Mock).mockResolvedValue(useFreeQuotaCatalogueStore.getState().catalogue);
  return model;
}

describe('cloud send: finish_reason capture', () => {
  it('keeps a stale Free conversation from sending after another device deletes it', async () => {
    const model = readyPromotionalChatModel();
    jest
      .spyOn(managedCloudChat, 'getConversation')
      .mockRejectedValue(new ManagedCloudChatHttpError('Not found', 404));
    const createConversation = jest
      .spyOn(managedCloudChat, 'createConversation')
      .mockRejectedValue(new ManagedCloudChatHttpError('Conversation unavailable', 409));

    const accepted = await useChatExecutionStore
      .getState()
      .sendMessage(CONV_ID, 'Do not send into a deleted thread', model);

    expect(accepted).toBe(false);
    expect(createConversation).toHaveBeenCalledWith(
      expect.objectContaining({ id: CONV_ID, model }),
    );
    expect(mockStreamChat).not.toHaveBeenCalled();
    expect(useChatCloudMessageStore.getState().messages[CONV_ID]).toEqual([]);
    expect(useChatExecutionStore.getState().error).toBe(
      'This Free conversation is no longer available in AGI Cloud. Start a new chat and send again.',
    );
  });

  it('does not create a Free conversation under a new account after a stale 404', async () => {
    const model = readyPromotionalChatModel();
    let rejectLookup!: (error: Error) => void;
    let lookupStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      lookupStarted = resolve;
    });
    jest.spyOn(managedCloudChat, 'getConversation').mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectLookup = reject;
          lookupStarted();
        }),
    );
    const createConversation = jest.spyOn(managedCloudChat, 'createConversation');

    const send = useChatExecutionStore.getState().sendMessage(CONV_ID, 'account A prompt', model);
    await started;
    invalidateCloudAccount();
    activateCloudAccount('cloud-stream-test-user-b');
    rejectLookup(new ManagedCloudChatHttpError('Not found', 404));

    await expect(send).resolves.toBe(false);
    expect(createConversation).not.toHaveBeenCalled();
    expect(mockStreamChat).not.toHaveBeenCalled();
  });

  it('fails closed before starting an ownerless Cloud stream', async () => {
    invalidateCloudAccount();

    const accepted = await useChatExecutionStore
      .getState()
      .sendMessage(CONV_ID, 'must never leave this device ownerless', CLOUD_MODEL);

    expect(accepted).toBe(false);
    expect(mockStreamChat).not.toHaveBeenCalled();
    expect(useChatCloudMessageStore.getState().messages[CONV_ID]).toEqual([]);
    expect(useChatExecutionStore.getState().error).toBe('Sign in to use AGI Cloud.');
  });

  it('cannot repopulate a cleared account after Cloud execution teardown', async () => {
    let streamStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      streamStarted = resolve;
    });
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks, signal) => {
      streamStarted();
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
      callbacks.onDelta({ content: 'account-a-private-response' });
      callbacks.onDone();
    });

    const send = useChatExecutionStore
      .getState()
      .sendMessage(CONV_ID, 'account A private prompt', CLOUD_MODEL);
    await started;

    clearCloudExecutionState();
    useChatCloudMessageStore.getState().clearCloudData();
    await send;

    expect(useChatCloudMessageStore.getState()).toMatchObject({
      conversations: [],
      messages: {},
    });
    expect(useChatExecutionStore.getState()).toMatchObject({
      isStreaming: false,
      streamingConversationIds: [],
    });
  });

  it('persists the LAST finish_reason seen (server tool loops emit intermediate values first)', async () => {
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ content: 'partial' });
      callbacks.onDelta({ finish_reason: 'tool_calls' });
      callbacks.onDelta({ finish_reason: 'length' });
      callbacks.onDone();
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'hi', CLOUD_MODEL);

    expect(lastAssistantMessage()?.metadata?.finishReason).toBe('length');
  });

  it('does NOT record finishReason when the wire never sends one (normal completion, no signal)', async () => {
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ content: 'complete answer' });
      callbacks.onDone();
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'hi', CLOUD_MODEL);

    expect(lastAssistantMessage()?.metadata?.finishReason).toBeUndefined();
  });
});

describe('cloud send: x_stream_error capture (mid-stream provider failure)', () => {
  it('persists metadata.streamError as {message,code,retryable} from an additive x_stream_error delta, keeping the partial content', async () => {
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ content: 'partial answer before' });
      callbacks.onDelta({
        x_stream_error: { message: 'Anthropic API overloaded', code: '529', retryable: true },
        finish_reason: 'error',
      });
      callbacks.onDone();
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'hi', CLOUD_MODEL);

    const assistantMsg = lastAssistantMessage();
    expect(assistantMsg?.metadata?.streamError).toEqual({
      message: 'Anthropic API overloaded',
      code: '529',
      retryable: true,
    });
    expect(assistantMsg?.content).toBe('partial answer before');
  });

  it('accepts a bare-string x_stream_error defensively (wraps it as {message})', async () => {
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ x_stream_error: 'rate limited' as never });
      callbacks.onDone();
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'hi', CLOUD_MODEL);

    expect(lastAssistantMessage()?.metadata?.streamError).toEqual({ message: 'rate limited' });
  });

  it('keeps the FIRST error payload seen, not the last (it identifies the actual failure)', async () => {
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ x_stream_error: { message: 'first failure' } });
      callbacks.onDelta({ x_stream_error: { message: 'second failure' } });
      callbacks.onDone();
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'hi', CLOUD_MODEL);

    expect(lastAssistantMessage()?.metadata?.streamError).toEqual({ message: 'first failure' });
  });

  it('does NOT record streamError on a normal completion (no x_stream_error delta)', async () => {
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ content: 'complete answer', finish_reason: 'stop' });
      callbacks.onDone();
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'hi', CLOUD_MODEL);

    expect(lastAssistantMessage()?.metadata?.streamError).toBeUndefined();
  });

  it('invalidates a cached provider-funded model after a streamed quota refusal', async () => {
    const offering = Object.entries(getProviderOfferings()).find(
      ([, candidate]) => candidate.provider === 'qwen' && candidate.quotaProbeProtocol === 'chat',
    );
    if (!offering) throw new Error('Expected a Qwen chat offering in the generated catalog.');
    const model = offering[0];
    useFreeQuotaCatalogueStore.setState({
      account: captureCloudAccountEpoch(),
      catalogue: {
        issuer: 'QwenCloud',
        observedOn: '2026-09-27',
        evidenceUrl: 'https://docs.qwencloud.com/resources/free-quota',
        reportedEligible: 1,
        reportedUnavailable: 0,
        models: [
          {
            key: model,
            displayName: 'Provider-funded chat',
            providerModelId: null,
            category: 'chat',
            limit: 100,
            unit: 'tokens',
            consumedApproximate: 0,
            expiresOn: null,
            status: 'ready',
          },
        ],
      },
      error: null,
      loading: false,
    });
    (api.get as jest.Mock).mockResolvedValue(useFreeQuotaCatalogueStore.getState().catalogue);
    jest.spyOn(managedCloudChat, 'getConversation').mockResolvedValue({
      conversation: {
        id: CONV_ID,
        title: 'Cloud Chat',
        projectId: null,
        pinned: false,
        starred: false,
        archived: false,
        isTemporary: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      messages: [],
      total: 0,
      hasMore: false,
    });
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({
        x_stream_error: {
          message: 'Provider free allowance exhausted',
          code: 'free_quota_exhausted',
        },
      });
      callbacks.onDone();
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'hi', model);

    expect(mockStreamChat).toHaveBeenCalledTimes(1);
    expect(useFreeQuotaCatalogueStore.getState().catalogue).toBeNull();
  });

  it('sends an attached image to an image-capable provider-funded Free offering', async () => {
    const model = readyPromotionalChatModel(true);
    jest.spyOn(managedCloudChat, 'getConversation').mockResolvedValue({
      conversation: {
        id: CONV_ID,
        title: 'Cloud Chat',
        projectId: null,
        pinned: false,
        starred: false,
        archived: false,
        isTemporary: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      messages: [],
      total: 0,
      hasMore: false,
    });
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ content: 'I can see the image.' });
      callbacks.onDone();
    });
    const assetId = '0190a000-0000-7000-8000-000000000104';
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'Upload & Send')?.onPress?.();
    });
    (api.uploadFile as jest.Mock).mockResolvedValue({
      id: assetId,
      url: 'https://agi.example/image.png',
      mimeType: 'image/png',
      name: 'image.png',
      byteCount: 100,
      type: 'image',
    });

    const accepted = await useChatExecutionStore
      .getState()
      .sendMessage(CONV_ID, 'Describe this image', model, [
        {
          id: 'image-attachment',
          uri: 'file:///image.png',
          mimeType: 'image/png',
          fileName: 'image.png',
        },
      ]);

    expect(accepted).toBe(true);
    expect(Alert.alert).toHaveBeenCalledWith(
      'Send files to AGI Cloud?',
      expect.stringContaining('image.png'),
      expect.any(Array),
      expect.any(Object),
    );
    expect(api.uploadFile).toHaveBeenCalledTimes(1);
    expect(mockStreamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        model,
        messages: expect.arrayContaining([
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe this image' },
              { type: 'file', file: { asset_id: assetId } },
            ],
          },
        ]),
      }),
      expect.any(Object),
      expect.any(Object),
    );

    const documentAccepted = await useChatExecutionStore
      .getState()
      .sendMessage(CONV_ID, 'Read this document', model, [
        {
          id: 'document-attachment',
          uri: 'file:///document.pdf',
          mimeType: 'application/pdf',
          fileName: 'document.pdf',
          assetId: '0190a000-0000-7000-8000-000000000105',
        },
      ]);
    expect(documentAccepted).toBe(false);
    expect(mockStreamChat).toHaveBeenCalledTimes(1);

    const followUpAccepted = await useChatExecutionStore
      .getState()
      .sendMessage(CONV_ID, 'Summarize your answer.', model);
    expect(followUpAccepted).toBe(true);
    const followUpRequest = mockStreamChat.mock.calls[1]?.[0];
    expect(followUpRequest?.messages).toEqual(
      expect.arrayContaining([
        {
          role: 'user',
          content:
            'Describe this image\n[An attachment in this earlier message is unavailable in this turn.]',
        },
        { role: 'user', content: 'Summarize your answer.' },
      ]),
    );
  });

  it('marks a cleanly closed empty provider stream as retryable instead of a successful blank bubble', async () => {
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDone();
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'answer this', CLOUD_MODEL);

    expect(lastAssistantMessage()?.metadata?.streamError).toEqual({
      message: 'The model finished without returning a response. Try again.',
      code: 'empty_response',
      retryable: true,
    });
  });

  it('keeps the wait and the reference the gateway put on the same frame', async () => {
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({
        x_stream_error: {
          message: 'This model is overloaded right now. Try again in about 2 minutes.',
          code: 'provider_overloaded',
          retryable: true,
          retryAfterSeconds: 120,
          requestId: 'req_mobile_overload',
        },
        finish_reason: 'error',
      });
      callbacks.onDone();
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'hi', CLOUD_MODEL);

    expect(lastAssistantMessage()?.metadata?.streamError).toEqual({
      message: 'This model is overloaded right now. Try again in about 2 minutes.',
      code: 'provider_overloaded',
      retryable: true,
      retryAfterSeconds: 120,
      requestId: 'req_mobile_overload',
    });
  });

  it('records neither field when the gateway sent neither', async () => {
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ x_stream_error: { message: 'The model could not be reached.' } });
      callbacks.onDone();
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'hi', CLOUD_MODEL);

    expect(lastAssistantMessage()?.metadata?.streamError).toEqual({
      message: 'The model could not be reached.',
    });
  });
});

describe('retrying a failed turn', () => {
  it('sends the attachment again, because the reader attached it to this question', async () => {
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ x_stream_error: { message: 'The model could not be reached.' } });
      callbacks.onDone();
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'what is in this', CLOUD_MODEL, [
      {
        id: 'att-1',
        uri: 'https://files.example/a.png',
        mimeType: 'image/png',
        fileName: 'a.png',
        assetId: 'asset-1',
      },
    ]);

    const msgs = useChatCloudMessageStore.getState().messages[CONV_ID] ?? [];
    const userMessage = msgs.find((m) => m.role === 'user');
    expect(userMessage?.attachments?.[0]?.fileName).toBe('a.png');

    mockStreamChat.mockClear();
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ content: 'a screenshot' });
      callbacks.onDone();
    });
    useChatExecutionStore.getState().retryMessage(CONV_ID, userMessage!.id);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const resent = useChatCloudMessageStore.getState().messages[CONV_ID] ?? [];
    expect(resent.find((m) => m.role === 'user')?.attachments?.[0]?.fileName).toBe('a.png');
  });
});

describe('cloud send: canonical agent activity', () => {
  it('projects the validated event stream into durable message metadata', async () => {
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      const base = {
        schemaVersion: AGENT_EVENT_SCHEMA_VERSION as const,
        sessionId: 'session-mobile-activity',
        turnId: 'turn-mobile-activity',
      };
      callbacks.onDelta({
        x_agent_event: {
          ...base,
          sequence: 0,
          emittedAtMs: 1_000,
          event: { type: 'lifecycle', phase: 'started' },
        },
      });
      callbacks.onDelta({
        x_agent_event: {
          ...base,
          sequence: 1,
          emittedAtMs: 1_100,
          event: {
            type: 'tool-execution-start',
            toolCallId: 'search-1',
            name: 'web_search',
            category: 'web-search',
            summary: 'Searching official sources',
            input: { query: 'official agent docs' },
          },
        },
      });
      callbacks.onDelta({
        x_agent_event: {
          ...base,
          sequence: 2,
          emittedAtMs: 1_200,
          event: {
            type: 'source-list',
            toolCallId: 'search-1',
            query: 'official agent docs',
            sources: [{ url: 'https://example.com/docs', title: 'Official docs' }],
          },
        },
      });
      callbacks.onDelta({
        x_agent_event: {
          ...base,
          sequence: 3,
          emittedAtMs: 1_400,
          event: {
            type: 'tool-execution-end',
            toolCallId: 'search-1',
            name: 'web_search',
            output: { resultCount: 1 },
            isError: false,
            elapsedMs: 300,
          },
        },
      });
      callbacks.onDelta({ content: 'Verified answer.' });
      callbacks.onDelta({
        x_agent_event: {
          ...base,
          sequence: 4,
          emittedAtMs: 1_500,
          event: { type: 'stop', reason: 'end-turn' },
        },
      });
      callbacks.onDone();
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'research this', CLOUD_MODEL);

    expect(lastAssistantMessage()?.metadata?.agentActivity).toMatchObject({
      schemaVersion: 1,
      status: 'completed',
      sessionId: 'session-mobile-activity',
      turnId: 'turn-mobile-activity',
      lastSequence: 4,
      entries: [
        expect.objectContaining({
          kind: 'tool',
          toolCallId: 'search-1',
          status: 'completed',
          sources: [{ url: 'https://example.com/docs', title: 'Official docs' }],
        }),
      ],
    });
  });

  it('settles a started activity as failed with safe UI copy on transport error', async () => {
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({
        x_agent_event: {
          schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
          sessionId: 'session-mobile-failure',
          turnId: 'turn-mobile-failure',
          sequence: 0,
          emittedAtMs: 2_000,
          event: { type: 'lifecycle', phase: 'started' },
        },
      });
      callbacks.onError(new Error('provider-secret-diagnostic'));
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'research this', CLOUD_MODEL);

    const activity = lastAssistantMessage()?.metadata?.agentActivity;
    expect(activity).toMatchObject({ status: 'failed', stopReason: 'error' });
    expect(JSON.stringify(activity)).toContain('Something went wrong. Please try again.');
    expect(JSON.stringify(activity)).not.toContain('provider-secret-diagnostic');
  });

  it('keeps the gateway sentence and code when the request is refused before the stream opens', async () => {
    const sentence =
      'This model is unavailable right now because of a problem on our side, not with your request. Choose another model, or try again shortly.';
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onError(new ApiHttpError(sentence, 503, 'provider_billing_exhausted'));
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'hello', CLOUD_MODEL);

    const state = useChatExecutionStore.getState();
    expect(state.error).toBe(sentence);
    expect(state.failureCode).toEqual({ message: sentence, code: 'provider_billing_exhausted' });
    expect(lastAssistantMessage()?.content).toBe(sentence);

    state.clearError();
    expect(useChatExecutionStore.getState().failureCode).toBeNull();
  });

  it('settles and persists the current Cloud activity when the user taps Stop', async () => {
    let activityStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      activityStarted = resolve;
    });
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks, signal) => {
      callbacks.onDelta({
        x_agent_event: {
          schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
          sessionId: 'session-mobile-cancel',
          turnId: 'turn-mobile-cancel',
          sequence: 0,
          emittedAtMs: 3_000,
          event: { type: 'lifecycle', phase: 'started' },
        },
      });
      activityStarted();
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
    });
    useChatMessageStore.getState().setCurrentConversationId(CONV_ID);

    const send = useChatExecutionStore
      .getState()
      .sendMessage(CONV_ID, 'research until stopped', CLOUD_MODEL);
    await started;
    useChatExecutionStore.getState().stopStreaming();
    await send;

    expect(lastAssistantMessage()).toMatchObject({
      isStreaming: false,
      metadata: {
        agentActivity: expect.objectContaining({
          status: 'cancelled',
          stopReason: 'cancelled',
        }),
      },
    });
  });
});

// MOBILE-039: a real connectivity drop mid-answer could not be checked without a
// device, so the drop is driven here through the same onError the transport uses.
describe('cloud send: the connection drops mid-answer', () => {
  it('keeps the partial answer, stops the streaming bar and settles every unfinished tool call', async () => {
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({
        tool_calls: [
          { index: 0, id: 'call-1', type: 'function', function: { name: 'web_search' } },
        ],
      });
      callbacks.onDelta({ content: 'The first half of the answer' });
      callbacks.onError(new Error('Network request failed'));
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'hi', CLOUD_MODEL);

    const assistant = lastAssistantMessage();
    expect(assistant?.content).toContain('The first half of the answer');
    expect(assistant?.isStreaming).not.toBe(true);
    for (const tool of assistant?.toolCalls ?? []) {
      expect(['succeeded', 'failed', 'partial', 'canceled']).toContain(tool.status);
      expect(tool.requiresApproval).not.toBe(true);
    }
  });

  it('leaves no conversation marked as streaming, so the composer is usable again', async () => {
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ content: 'half' });
      callbacks.onError(new Error('Network request failed'));
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'hi', CLOUD_MODEL);

    const state = useChatExecutionStore.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.streamingConversationIds).toEqual([]);
    expect(state.error).toBeTruthy();
  });
});

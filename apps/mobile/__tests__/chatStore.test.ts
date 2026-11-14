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

jest.mock('../services/api', () => {
  function MockApiPaywallError(
    this: { feature: string; requiredTier: string; reason: string; name: string; message: string },
    feat: string,
    reqTier: string,
    rsn: string,
  ) {
    this.feature = feat;
    this.requiredTier = reqTier;
    this.reason = rsn;
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

jest.mock('../services/llmGate', () => ({
  ...jest.requireActual('../services/llmGate'),
  ensureCloudSendConsent: jest.fn().mockResolvedValue(undefined),
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
    getRemoteChatDisabledReason: jest.fn(() => null),
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

jest.mock('../services/docParser', () => {
  const actual = jest.requireActual('../services/docParser');
  return { ...actual, parseDocument: jest.fn(actual.parseDocument) };
});

jest.mock('../src/features/memory/store', () => ({
  retrieveMemoryContext: jest.fn(async () => []),
}));

jest.mock('../src/features/memory/services/pastChatContext', () => ({
  retrievePastChatContext: jest.fn(async () => null),
}));

jest.mock('../src/features/memory/services/consolidation', () => ({
  consolidateFactsFromTurn: jest.fn(),
  shouldConsolidateMemoryOnClient: jest.fn(
    (opts: {
      executionMode: 'local' | 'cloud';
      isTemporaryChat: boolean;
      memoryEnabled: boolean;
      generateMemoryFromHistory: boolean;
    }) =>
      opts.executionMode === 'local' &&
      !opts.isTemporaryChat &&
      opts.memoryEnabled &&
      opts.generateMemoryFromHistory,
  ),
}));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store && store.persist && typeof store.persist.rehydrate === 'function')
      store.persist.rehydrate();
  }),
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

import { useChatStore } from '../stores/chatStore';
import { api } from '../services/api';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { useArtifactStore } from '../src/features/artifacts/store';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { cancelMobileCloudAgentRun, streamChat } from '../services/streaming';
import { getRemoteChatDisabledReason } from '../services/remoteChatGate';
import { localGenerate } from '@agiworkforce/local-llm';
import { parseDocument } from '../services/docParser';
import { getModelMetadataById, AGENT_EVENT_SCHEMA_VERSION } from '@agiworkforce/types';
import {
  SYNTHETIC_IMAGE_MODEL_ID,
  requireAutoMode,
  requireLocalModel,
  requireFreeMobileCloudModel,
  requireMobileCloudModel,
} from '../test-utils/modelFixtures';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useTierStore } from '../src/features/billing/store';
import { NEW_CHAT_STYLE_KEY, useChatViewStore } from '../stores/chat/chatViewStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useProjectStore } from '../src/features/projects/store';
import { useCloudProjectStore } from '../stores/projects/cloudProjectStore';
import {
  listInstalledModels,
  getInstalledModel,
  markInstalledModelUsed,
} from '../storage/installedModels';
import type { StreamCallbacks } from '../services/streaming';
import { useAuthStore } from '../src/features/auth/store';
import { useSettingsStore } from '../stores/settingsStore';
import { useLocalSettingsStore } from '../stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '../stores/settings/cloudSettingsStore';
import { consolidateFactsFromTurn } from '../src/features/memory/services/consolidation';
import { retrieveMemoryContext } from '../src/features/memory/store';
import { retrievePastChatContext } from '../src/features/memory/services/pastChatContext';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import { storage } from '../lib/mmkv';
import { MINOR_SAFE_REFUSAL, REDUCED_SENSITIVE_CONTENT_REFUSAL } from '../lib/contentFilter';
import { streamFailureNoticeText } from '../src/features/chat/utils/messageStreamError';

const AUTO_MODEL_ID = requireAutoMode().id;
const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;
const mockCancelMobileCloudAgentRun = cancelMobileCloudAgentRun as jest.MockedFunction<
  typeof cancelMobileCloudAgentRun
>;
const mockApiDelete = api.delete as jest.MockedFunction<typeof api.delete>;
const mockApiGet = api.get as jest.MockedFunction<typeof api.get>;
const mockApiUploadFile = api.uploadFile as jest.MockedFunction<typeof api.uploadFile>;
const mockRemoteDisabledReason = getRemoteChatDisabledReason as jest.MockedFunction<
  typeof getRemoteChatDisabledReason
>;
const mockLocalGenerate = localGenerate as jest.MockedFunction<typeof localGenerate>;
const mockParseDocument = parseDocument as jest.MockedFunction<typeof parseDocument>;
const mockListInstalledModels = listInstalledModels as jest.MockedFunction<
  typeof listInstalledModels
>;
const mockGetInstalledModel = getInstalledModel as jest.MockedFunction<typeof getInstalledModel>;
const mockMarkInstalledModelUsed = markInstalledModelUsed as jest.MockedFunction<
  typeof markInstalledModelUsed
>;
const mockConsolidateFactsFromTurn = consolidateFactsFromTurn as jest.MockedFunction<
  typeof consolidateFactsFromTurn
>;
const mockRetrieveMemoryContext = retrieveMemoryContext as jest.MockedFunction<
  typeof retrieveMemoryContext
>;
const mockRetrievePastChatContext = retrievePastChatContext as jest.MockedFunction<
  typeof retrievePastChatContext
>;
let capturedLocalGenerateOptions: Parameters<typeof localGenerate>[1] | null = null;

function getState() {
  return useChatStore.getState();
}

function resetStore() {
  useWaitlistStore.setState({
    joined: false,
    email: undefined,
    country: undefined,
    rank: undefined,
    joinedAt: undefined,
    cloudUnlocked: false,
    inviteId: undefined,
    inviteCode: undefined,
    cloudUnlockedAt: undefined,
  });
  useChatStore.setState({
    conversations: [],
    currentConversationId: null,
    messages: {},
    isStreaming: false,
    streamingContent: '',
    streamingReasoning: '',
    isLoadingConversations: false,
    isLoadingMessages: false,
    error: null,
    chatMode: 'chat',
    chatStyle: 'normal',
    workMode: 'chat',
    features: {
      webSearch: true,
      imageGen: true,
      health: false,
      codeExecution: false,
      research: false,
    },
  });
  useTierStore.setState({
    tier: 'free',
    billingTier: 'free',
    billingStatus: 'none',
    grantedCapabilities: ['canUseWebSearch', 'canUseConnectors'],
    capabilityDocument: null,
    capabilityHandshakeReceived: true,
    capabilityHandshakeVersion: 'test-mobile-capabilities',
    codeExecutionAvailable: false,
    genericWebSearchAvailable: false,
    currentConversationProvider: null,
  } as never);
  useChatCloudMessageStore.setState({ conversations: [], messages: {} });
}

const CONV_ID = 'test-conv-123';
const MODEL = 'fixture-model';
const LOCAL_MODEL = requireLocalModel().id;
const CLOUD_MODEL = requireFreeMobileCloudModel().id;
const SEARCH_MODEL = requireMobileCloudModel(
  (model) => getModelMetadataById(model.id)?.capabilities.search === true,
  'search-capable Mobile Cloud model',
).id;
const SEARCH_UNSUPPORTED_MODEL = requireMobileCloudModel(
  (model) => getModelMetadataById(model.id)?.capabilities.search !== true,
  'Mobile Cloud model without search support',
).id;
const RESEARCH_MODEL = requireMobileCloudModel((model) => {
  const capabilities = getModelMetadataById(model.id)?.capabilities;
  return capabilities?.research === true && capabilities.search === true;
}, 'research-and-search-capable Mobile Cloud model').id;
const CODE_MODEL = requireMobileCloudModel((model) => {
  const capabilities = getModelMetadataById(model.id)?.capabilities;
  return capabilities?.codeExecution === true && capabilities.tools === true;
}, 'code-execution-capable Mobile Cloud model').id;

function seedCloudConversation(model = CLOUD_MODEL) {
  const existing = getState().conversations.find((conversation) => conversation.id === CONV_ID);
  useChatStore.setState({
    conversations: [
      {
        id: CONV_ID,
        title: existing?.title ?? 'Test Chat',
        updatedAt: existing?.updatedAt ?? new Date().toISOString(),
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        messageCount: existing?.messageCount ?? 0,
        pinned: existing?.pinned ?? false,
        model,
        provider: 'cloud_managed',
        executionMode: 'cloud',
      },
    ],
    messages: { [CONV_ID]: [] },
  });
}

describe('chatStore, streaming state', () => {
  beforeEach(() => {
    __resetCloudAccountSessionForTests();
    activateCloudAccount('chat-store-test-user');
    useAuthStore.setState({
      clerkUserId: 'chat-store-test-user',
      isClerkLoaded: true,
      isClerkSignedIn: true,
    });
    resetStore();
    useSettingsStore.setState({ reduceSensitiveContent: false });
    useSettingsStore.setState({ isTemporaryChat: false });
    useLocalSettingsStore.setState({
      memoryEnabled: true,
      referencePastChats: true,
      generateMemoryFromHistory: true,
    });
    jest.clearAllMocks();
    mockRemoteDisabledReason.mockReturnValue(null);
    mockListInstalledModels.mockResolvedValue([]);
    mockGetInstalledModel.mockResolvedValue(null);
    mockMarkInstalledModelUsed.mockResolvedValue(undefined);
    capturedLocalGenerateOptions = null;

    useChatStore.setState({
      conversations: [
        {
          id: CONV_ID,
          title: 'Test Chat',
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          messageCount: 0,
          pinned: false,
        },
      ],
      messages: { [CONV_ID]: [] },
    });
  });

  describe('streaming success path', () => {
    it('sends selected chat mode and style context to the remote stream', async () => {
      let capturedBody: Parameters<typeof streamChat>[0] | null = null;
      seedCloudConversation();
      useChatStore.setState({ chatMode: 'create' });
      useChatViewStore.setState({ chatStyle: 'explanatory', styleConversationId: CONV_ID });

      mockStreamChat.mockImplementation(
        (body, callbacks) =>
          new Promise<void>((resolve) => {
            capturedBody = body;
            setTimeout(() => {
              callbacks.onDelta({ content: 'Draft ready' });
              callbacks.onDone();
              resolve();
            }, 0);
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'make a launch checklist', CLOUD_MODEL);
      });

      expect(capturedBody?.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('Mode: Create'),
          }),
        ]),
      );
      expect(capturedBody?.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('Style: Explanatory'),
          }),
        ]),
      );
    });

    it('automatically sends web_search:true when the Cloud route supports search', async () => {
      let capturedBody: Parameters<typeof streamChat>[0] | null = null;
      useTierStore.setState({ tier: 'max', billingTier: 'max' });
      seedCloudConversation(SEARCH_MODEL);
      useChatStore.setState({
        features: { webSearch: true, imageGen: true, health: false, codeExecution: false },
      });

      mockStreamChat.mockImplementation(
        (body, callbacks) =>
          new Promise<void>((resolve) => {
            capturedBody = body;
            setTimeout(() => {
              callbacks.onDelta({ content: 'searched' });
              callbacks.onDone();
              resolve();
            }, 0);
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'what is the weather today', SEARCH_MODEL);
      });

      expect(capturedBody?.web_search).toBe(true);
      expect(capturedBody?.tool_choice).toBeUndefined();
    });

    it('keeps ambient web search optional for an ordinary Cloud turn', async () => {
      let capturedBody: Parameters<typeof streamChat>[0] | null = null;
      useTierStore.setState({ tier: 'max', billingTier: 'max' });
      seedCloudConversation(SEARCH_MODEL);
      useChatStore.setState({
        features: { webSearch: true, imageGen: true, health: false, codeExecution: false },
      });

      mockStreamChat.mockImplementation(
        (body, callbacks) =>
          new Promise<void>((resolve) => {
            capturedBody = body;
            setTimeout(() => {
              callbacks.onDelta({ content: 'ordinary reply' });
              callbacks.onDone();
              resolve();
            }, 0);
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'help me outline a short note', SEARCH_MODEL);
      });

      expect(capturedBody?.web_search).toBe(true);
      expect(capturedBody?.tool_choice).toBeUndefined();
    });

    it('omits web_search when the user turned the Capabilities preference off', async () => {
      let capturedBody: Parameters<typeof streamChat>[0] | null = null;
      seedCloudConversation();
      useChatStore.setState({
        features: { webSearch: false, imageGen: true, health: false, codeExecution: false },
      });

      mockStreamChat.mockImplementation(
        (body, callbacks) =>
          new Promise<void>((resolve) => {
            capturedBody = body;
            setTimeout(() => {
              callbacks.onDelta({ content: 'no ambient search' });
              callbacks.onDone();
              resolve();
            }, 0);
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'just chat normally', CLOUD_MODEL);
      });

      expect(capturedBody?.web_search).toBeUndefined();
    });

    describe('code execution', () => {
      async function sendCodeCapableTurn(text: string) {
        let capturedBody: Parameters<typeof streamChat>[0] | null = null;
        useTierStore.setState({
          tier: 'max',
          billingTier: 'max',
          codeExecutionAvailable: true,
          grantedCapabilities: ['canUseWebSearch', 'canUseCloudExecution'],
        } as never);
        seedCloudConversation(CODE_MODEL);
        mockStreamChat.mockImplementation(
          (body, callbacks) =>
            new Promise<void>((resolve) => {
              capturedBody = body;
              callbacks.onDone();
              resolve();
            }),
        );
        await act(async () => {
          await getState().sendMessage(CONV_ID, text, CODE_MODEL);
        });
        return capturedBody as Parameters<typeof streamChat>[0] | null;
      }

      beforeEach(() => {
        useChatViewStore.setState({ runCodeByConversation: {} });
        useChatStore.setState({
          features: {
            webSearch: true,
            imageGen: true,
            health: false,
            codeExecution: true,
            research: false,
          },
        });
      });

      it('leaves a plain message on a code-capable model to the server instead of forcing a run', async () => {
        const body = await sendCodeCapableTurn('Hi');

        expect(body).not.toBeNull();
        expect(body).not.toHaveProperty('code_execution');
        expect(body).not.toHaveProperty('office_creation');
      });

      it('asks for a run on every turn only while Run code is on for that chat', async () => {
        useChatViewStore.getState().setRunCode(CONV_ID, true);
        expect((await sendCodeCapableTurn('Chart the first 20 primes'))?.code_execution).toBe(true);

        useChatViewStore.getState().setRunCode(CONV_ID, false);
        expect(await sendCodeCapableTurn('Hi again')).not.toHaveProperty('code_execution');
      });

      it('keeps Run code from another chat out of this one', async () => {
        useChatViewStore.getState().setRunCode('another-conversation', true);

        expect(await sendCodeCapableTurn('Hi')).not.toHaveProperty('code_execution');
      });

      it('tells the server not to run code or create files when the permission is off', async () => {
        useChatViewStore.getState().setRunCode(CONV_ID, true);
        useChatStore.setState({
          features: {
            webSearch: true,
            imageGen: true,
            health: false,
            codeExecution: false,
            research: false,
          },
        });

        const body = await sendCodeCapableTurn('Run this Python: print(1)');

        expect(body?.code_execution).toBe(false);
        expect(body?.office_creation).toBe(false);
      });

      it('carries the new-chat Run code choice to the conversation it creates', () => {
        useChatViewStore.getState().setRunCode(NEW_CHAT_STYLE_KEY, true);

        useChatViewStore.getState().adoptStyleSelection(NEW_CHAT_STYLE_KEY, CONV_ID);

        expect(useChatViewStore.getState().runCodeByConversation).toEqual({ [CONV_ID]: true });
      });
    });

    it('keeps the model capability clamp when the web-search preference is on', async () => {
      let capturedBody: Parameters<typeof streamChat>[0] | null = null;
      const unsupportedSearchModel = SEARCH_UNSUPPORTED_MODEL;
      useTierStore.setState({ tier: 'max', genericWebSearchAvailable: false });
      seedCloudConversation(unsupportedSearchModel);
      useChatStore.setState({
        features: { webSearch: true, imageGen: true, health: false, codeExecution: false },
      });

      mockStreamChat.mockImplementation(
        (body, callbacks) =>
          new Promise<void>((resolve) => {
            capturedBody = body;
            setTimeout(() => {
              callbacks.onDone();
              resolve();
            }, 0);
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'search for me', unsupportedSearchModel);
      });

      expect(capturedBody?.web_search).toBeUndefined();
    });

    it('omits web_search when neither the model nor deployment can execute it', async () => {
      let capturedBody: Parameters<typeof streamChat>[0] | null = null;
      const unsupportedSearchModel = SEARCH_UNSUPPORTED_MODEL;
      useTierStore.setState({ tier: 'max', genericWebSearchAvailable: false });
      seedCloudConversation(unsupportedSearchModel);

      mockStreamChat.mockImplementation(
        (body, callbacks) =>
          new Promise<void>((resolve) => {
            capturedBody = body;
            setTimeout(() => {
              callbacks.onDelta({ content: 'no search transport' });
              callbacks.onDone();
              resolve();
            }, 0);
          }),
      );

      await act(async () => {
        await getState().sendMessage(
          CONV_ID,
          'answer without a search transport',
          unsupportedSearchModel,
        );
      });

      expect(capturedBody?.web_search).toBeUndefined();
    });

    it('omits ambient web search when the account capability handshake denies it', async () => {
      let capturedBody: Parameters<typeof streamChat>[0] | null = null;
      seedCloudConversation();
      useTierStore.setState({
        grantedCapabilities: [],
        capabilityHandshakeReceived: true,
      } as never);

      mockStreamChat.mockImplementation(
        (body, callbacks) =>
          new Promise<void>((resolve) => {
            capturedBody = body;
            callbacks.onDone();
            resolve();
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'current news', CLOUD_MODEL);
      });

      expect(capturedBody?.web_search).toBeUndefined();
    });

    it('still requests web search when no capability handshake has been received', async () => {
      let capturedBody: Parameters<typeof streamChat>[0] | null = null;
      useTierStore.setState({ tier: 'max', billingTier: 'max' });
      seedCloudConversation(SEARCH_MODEL);
      useTierStore.setState({
        grantedCapabilities: [],
        capabilityHandshakeReceived: false,
      } as never);

      mockStreamChat.mockImplementation(
        (body, callbacks) =>
          new Promise<void>((resolve) => {
            capturedBody = body;
            callbacks.onDone();
            resolve();
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'current news', SEARCH_MODEL);
      });

      expect(capturedBody?.web_search).toBe(true);
    });

    it('waits for the Cloud entitlement handshake before the first searchable send', async () => {
      let resolveEntitlements!: (value: unknown) => void;
      let capturedBody: Parameters<typeof streamChat>[0] | null = null;
      useChatAppModeStore.setState({ appMode: 'cloud' });
      seedCloudConversation();
      useTierStore.setState({
        tier: 'free',
        grantedCapabilities: [],
        capabilityHandshakeReceived: false,
        capabilityHandshakeVersion: null,
        genericWebSearchAvailable: false,
        lastRefreshedAt: null,
      } as never);
      mockApiGet.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveEntitlements = resolve;
        }),
      );
      mockStreamChat.mockImplementation(
        (body, callbacks) =>
          new Promise<void>((resolve) => {
            capturedBody = body;
            callbacks.onDone();
            resolve();
          }),
      );

      const send = getState().sendMessage(CONV_ID, 'current news', CLOUD_MODEL);
      await Promise.resolve();
      expect(mockStreamChat).not.toHaveBeenCalled();

      resolveEntitlements({
        id: 'chat-store-test-user',
        email: 'test@example.com',
        name: 'Test User',
        avatar_url: null,
        created_at: null,
        updated_at: 1_787_000_000,
        plan: {
          tier: 'max',
          display_name: 'Max',
          status: 'active',
          current_period_end: null,
          subscription_source: 'stripe',
        },
        feature_flags: {
          advanced_model_access: true,
          code_execution: true,
          generic_web_search: true,
        },
        credits: null,
        routing_preferences: {},
        capability_handshake: {
          sessionId: 'chat-store-test-user',
          version: 'mobile-search-v1',
          computedAt: '2026-08-13T00:00:00.000Z',
          sources: {
            model: 'models.json@test',
            tier: 'tier:max',
            surface: 'surface:mobile',
            settings: 'settings:default',
          },
          granted: ['canChat', 'canUseWebSearch'],
          deniedBy: {},
        },
      });
      await act(async () => {
        await send;
      });

      expect(mockApiGet).toHaveBeenCalledWith('/api/me?surface=mobile');
      expect(capturedBody?.web_search).toBe(true);
      expect(useTierStore.getState()).toMatchObject({
        tier: 'max',
        capabilityHandshakeReceived: true,
        genericWebSearchAvailable: true,
      });
    });

    it('sends work_mode:agiwork only for the explicit Cloud work mode', async () => {
      let capturedBody: Parameters<typeof streamChat>[0] | null = null;
      seedCloudConversation();
      useTierStore.setState({
        tier: 'max',
        capabilityHandshakeReceived: true,
        grantedCapabilities: ['canUseAgiWork'],
      });
      useChatStore.setState({ workMode: 'agiwork' });

      mockStreamChat.mockImplementation(
        (body, callbacks) =>
          new Promise<void>((resolve) => {
            capturedBody = body;
            setTimeout(() => {
              callbacks.onDelta({ content: 'built' });
              callbacks.onDone();
              resolve();
            }, 0);
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'research and build this', CLOUD_MODEL);
      });

      expect(capturedBody?.work_mode).toBe('agiwork');
    });

    it('forwards only an exact managed skill name to the Cloud stream', async () => {
      let capturedBody: Parameters<typeof streamChat>[0] | null = null;
      seedCloudConversation();

      mockStreamChat.mockImplementation(
        (body, callbacks) =>
          new Promise<void>((resolve) => {
            capturedBody = body;
            setTimeout(() => {
              callbacks.onDelta({ content: 'reviewed' });
              callbacks.onDone();
              resolve();
            }, 0);
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'review this screen', CLOUD_MODEL, undefined, {
          skillName: 'frontend-design',
        });
      });

      expect(capturedBody?.skill_name).toBe('frontend-design');
      expect(capturedBody).not.toHaveProperty('skill_body');
    });

    it('does not send a persisted AGI Work mode after the account returns to Free', async () => {
      let capturedBody: Parameters<typeof streamChat>[0] | null = null;
      seedCloudConversation();
      useTierStore.setState({ tier: 'free' });
      useChatStore.setState({ workMode: 'agiwork' });

      mockStreamChat.mockImplementation(
        (body, callbacks) =>
          new Promise<void>((resolve) => {
            capturedBody = body;
            setTimeout(() => {
              callbacks.onDelta({ content: 'chat only' });
              callbacks.onDone();
              resolve();
            }, 0);
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'continue', CLOUD_MODEL);
      });

      expect(capturedBody?.work_mode).toBeUndefined();
    });

    it('does not send a persisted AGI Work mode for Basic because the server requires Pro', async () => {
      let capturedBody: Parameters<typeof streamChat>[0] | null = null;
      seedCloudConversation();
      useTierStore.setState({ tier: 'basic' });
      useChatStore.setState({ workMode: 'agiwork' });

      mockStreamChat.mockImplementation(
        (body, callbacks) =>
          new Promise<void>((resolve) => {
            capturedBody = body;
            callbacks.onDone();
            resolve();
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'continue', CLOUD_MODEL);
      });

      expect(capturedBody?.work_mode).toBeUndefined();
    });

    it('sends Deep Research only when the server handshake grants it', async () => {
      let capturedBody: Parameters<typeof streamChat>[0] | null = null;
      const researchModel = RESEARCH_MODEL;
      seedCloudConversation(researchModel);
      useTierStore.setState({
        tier: 'max',
        grantedCapabilities: ['canUseWebSearch', 'canUseDeepResearch'],
        capabilityHandshakeReceived: true,
      } as never);
      useChatStore.setState({
        features: {
          webSearch: true,
          imageGen: false,
          health: false,
          codeExecution: false,
          research: true,
        },
      });

      mockStreamChat.mockImplementation(
        (body, callbacks) =>
          new Promise<void>((resolve) => {
            capturedBody = body;
            callbacks.onDone();
            resolve();
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'research this', researchModel);
      });

      expect(capturedBody?.research).toBe(true);

      capturedBody = null;
      useTierStore.setState({
        tier: 'pro',
        grantedCapabilities: ['canUseWebSearch'],
        capabilityHandshakeReceived: true,
      } as never);

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'research this again', researchModel);
      });

      expect(capturedBody?.research).toBeUndefined();
    });

    it.each(['interrupted', 'error', 'paused'] as const)(
      'resends the approved research deliverable when a %s run is retried',
      async (phase) => {
        let capturedBody: Parameters<typeof streamChat>[0] | null = null;
        seedCloudConversation(RESEARCH_MODEL);
        useTierStore.setState({
          tier: 'max',
          grantedCapabilities: ['canUseWebSearch', 'canUseDeepResearch'],
          capabilityHandshakeReceived: true,
        } as never);
        const createdAt = new Date().toISOString();
        const deliverable = {
          depth: 'executive-summary',
          format: 'bullet-brief',
          minSources: 4,
          stopWhenNoNewSources: false,
          saveToLibrary: false,
        };
        useChatStore.setState({
          messages: {
            [CONV_ID]: [
              {
                id: 'research-user',
                conversationId: CONV_ID,
                role: 'user',
                content: 'Compare the options',
                model: RESEARCH_MODEL,
                createdAt,
              },
              {
                id: 'research-assistant',
                conversationId: CONV_ID,
                role: 'assistant',
                content: '',
                model: RESEARCH_MODEL,
                createdAt,
                isStreaming: false,
                metadata: {
                  research: {
                    phase,
                    deliverable,
                    steps: [{ id: 's1', type: 'search', description: 'Look', status: 'pending' }],
                  },
                },
              },
            ],
          },
        });
        mockStreamChat.mockImplementation(
          (body, callbacks) =>
            new Promise<void>((resolve) => {
              capturedBody = body;
              callbacks.onDone();
              resolve();
            }),
        );

        await act(async () => {
          await getState().resumeResearch(CONV_ID, 'research-assistant', 'retry');
        });

        expect(capturedBody?.research_resume).toMatchObject({
          approved_steps: [expect.objectContaining({ id: 's1' })],
          deliverable,
        });
      },
    );

    it('uses per-send task options over persisted chat mode', async () => {
      let capturedBody: Parameters<typeof streamChat>[0] | null = null;
      seedCloudConversation();
      useChatStore.setState({ chatMode: 'chat', chatStyle: 'normal' });

      mockStreamChat.mockImplementation(
        (body, callbacks) =>
          new Promise<void>((resolve) => {
            capturedBody = body;
            setTimeout(() => {
              callbacks.onDelta({ content: 'Code answer' });
              callbacks.onDone();
              resolve();
            }, 0);
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'fix this function', CLOUD_MODEL, undefined, {
          mode: 'create',
          taskInstruction: 'Task: Code. Write a focused patch.',
        });
      });

      const systemMessages = capturedBody?.messages.filter((m) => m.role === 'system') ?? [];
      expect(systemMessages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining('Mode: Create'),
          }),
        ]),
      );
      expect(systemMessages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining('Task: Code. Write a focused patch.'),
          }),
        ]),
      );
    });

    it('sets isStreaming=true while streaming, then clears it on onDone', async () => {
      seedCloudConversation();
      let capturedCallbacks: StreamCallbacks | null = null;

      mockStreamChat.mockImplementation(
        (_body, callbacks) =>
          new Promise<void>((resolve) => {
            capturedCallbacks = callbacks;
            setTimeout(() => {
              callbacks.onDelta({ content: 'Hello' });
              callbacks.onDone();
              resolve();
            }, 0);
          }),
      );

      const sendPromise = act(async () => {
        await getState().sendMessage(CONV_ID, 'Hi', CLOUD_MODEL);
      });

      await sendPromise;

      const state = getState();
      expect(state.isStreaming).toBe(false);
      expect(state.streamingContent).toBe('');
      expect(state.streamingReasoning).toBe('');
    });

    it('accumulates streaming content via onDelta', async () => {
      seedCloudConversation();
      mockStreamChat.mockImplementation(
        (_body, callbacks) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              callbacks.onDelta({ content: 'Hello' });
              callbacks.onDelta({ content: ' world' });
              callbacks.onDone();
              resolve();
            }, 0);
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'test', CLOUD_MODEL);
      });

      const msgs = getState().messages[CONV_ID] ?? [];
      const assistantMsg = msgs.find((m) => m.role === 'assistant');
      expect(assistantMsg?.content).toBe('Hello world');
      expect(assistantMsg?.isStreaming).toBe(false);
    });

    it('finalizes map cards and generated files into durable Cloud metadata', async () => {
      seedCloudConversation();
      const mapCard = {
        schemaVersion: 1,
        cardId: 'fixture-mobile-map',
        kind: 'map-search.v1',
        createdAt: '2026-08-13T12:00:00.000Z',
        fallback: {
          headline: 'Coffee near Austin',
          text: 'Map results for coffee near Austin.',
        },
        producedBy: { toolCallId: 'fixture-mobile-map', toolName: 'search_maps' },
        body: {
          title: 'Coffee near Austin',
          query: 'coffee near Austin',
          actions: [
            {
              provider: 'google_maps',
              label: 'Open in Google Maps',
              url: 'https://www.google.com/maps/search/?api=1&query=coffee%20austin',
            },
          ],
          view: {
            latitude: 30.2672,
            longitude: -97.7431,
            zoom: 11,
            attribution: '© OpenStreetMap contributors',
          },
          places: [],
        },
      };

      mockStreamChat.mockImplementation(
        (_body, callbacks) =>
          new Promise<void>((resolve) => {
            callbacks.onDelta({ content: 'Here are the results.' });
            callbacks.onDelta({ x_interactive_card: { card: mapCard } });
            callbacks.onDelta({ x_interactive_card: { card: mapCard } });
            callbacks.onDelta({
              x_generated_files: {
                files: [
                  {
                    id: 'asset-mobile-report',
                    file_name: 'report.pdf',
                    mime_type: 'application/pdf',
                    uri: '/api/files/asset-mobile-report',
                    byte_count: 2048,
                    kind: 'pdf',
                    checksum_sha256: 'a'.repeat(64),
                    surface: 'file',
                    previewable: true,
                  },
                ],
              },
            });
            callbacks.onDone();
            resolve();
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'Map coffee and create a report', CLOUD_MODEL);
      });

      const assistant = getState().messages[CONV_ID]?.find(
        (message) => message.role === 'assistant',
      );
      expect(assistant?.interactiveCards).toHaveLength(1);
      expect(assistant?.metadata?.interactiveCards).toEqual(assistant?.interactiveCards);
      expect(assistant?.artifacts).toEqual([
        expect.objectContaining({
          id: 'asset-mobile-report',
          generatedFile: expect.objectContaining({
            fileName: 'report.pdf',
            uri: expect.stringContaining('/api/files/asset-mobile-report'),
          }),
        }),
      ]);
      expect(assistant?.metadata?.generatedFiles).toEqual([
        expect.objectContaining({
          id: 'asset-mobile-report',
          fileName: 'report.pdf',
          uri: '/api/files/asset-mobile-report',
          previewable: true,
        }),
      ]);
    });

    it('reconciles durable replay text without duplicating content and persists the run cursor', async () => {
      seedCloudConversation();
      const runId = '0190a000-0000-7000-8000-000000000099';
      const runPath = `/api/llm/v1/chat/completions/runs/${runId}`;
      const envelope = (sequence: number, delta: string) => ({
        schemaVersion: AGENT_EVENT_SCHEMA_VERSION as const,
        sessionId: 'session-mobile-durable',
        turnId: 'turn-mobile-durable',
        sequence,
        emittedAtMs: 1_000 + sequence,
        event: { type: 'text-delta' as const, delta },
      });

      mockStreamChat.mockImplementation(
        (_body, callbacks) =>
          new Promise<void>((resolve) => {
            callbacks.onRunReference?.({ runId, runPath, lastSequence: -1 });
            callbacks.onDelta({ content: 'Already visible' });
            callbacks.onDelta({
              content: 'Already visible',
              durableReplay: true,
              x_agent_event: envelope(0, 'Already visible'),
            });
            callbacks.onDelta({
              content: ' recovered',
              durableReplay: true,
              x_agent_event: envelope(1, ' recovered'),
            });
            callbacks.onRunReference?.({
              runId,
              runPath,
              lastSequence: 1,
              state: 'completed',
              cancellationRequestedAt: null,
            });
            callbacks.onDone();
            resolve();
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'continue safely', CLOUD_MODEL);
      });

      const assistant = getState().messages[CONV_ID]?.find(
        (message) => message.role === 'assistant',
      );
      expect(assistant?.content).toBe('Already visible recovered');
      expect(assistant?.metadata?.cloudAgentRun).toEqual({
        runId,
        runPath,
        lastSequence: 1,
        state: 'completed',
        cancellationRequestedAt: null,
      });
    });

    it('clears streamingContent and streamingReasoning after onDone', async () => {
      mockStreamChat.mockImplementation(
        (_body, callbacks) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              callbacks.onDelta({ content: 'Answer', reasoning: 'Thinking...' });
              callbacks.onDone();
              resolve();
            }, 0);
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'question', CLOUD_MODEL);
      });

      expect(getState().streamingContent).toBe('');
      expect(getState().streamingReasoning).toBe('');
    });

    it('strips <thinking> tags from cloud delta.content into reasoning instead of rendering them raw', async () => {
      seedCloudConversation();
      mockStreamChat.mockImplementation(
        (_body, callbacks) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              callbacks.onDelta({ content: '<thinking>' });
              callbacks.onDelta({ content: 'Let me consider this.' });
              callbacks.onDelta({ content: '</thinking>' });
              callbacks.onDelta({ content: "Hello! I'm Claude." });
              callbacks.onDone();
              resolve();
            }, 0);
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'question', CLOUD_MODEL);
      });

      const msgs = getState().messages[CONV_ID] ?? [];
      const assistantMsg = msgs.find((m) => m.role === 'assistant');
      expect(assistantMsg?.content).toBe("Hello! I'm Claude.");
      expect(assistantMsg?.content).not.toContain('<thinking>');
      expect(assistantMsg?.content).not.toContain('</thinking>');
      expect(assistantMsg?.reasoning).toBe('Let me consider this.');
    });

    it('leaves reasoning undefined when the turn never emitted thinking (no "Thought for 0s")', async () => {
      seedCloudConversation();
      mockStreamChat.mockImplementation(
        (_body, callbacks) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              callbacks.onDelta({ content: 'Plain answer.' });
              callbacks.onDone();
              resolve();
            }, 0);
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'question', CLOUD_MODEL);
      });

      const msgs = getState().messages[CONV_ID] ?? [];
      const assistantMsg = msgs.find((m) => m.role === 'assistant');
      expect(assistantMsg?.content).toBe('Plain answer.');
      expect(assistantMsg?.reasoning).toBeUndefined();
    });

    it('extracts tag reasoning split across chunk boundaries without duplication', async () => {
      seedCloudConversation();
      mockStreamChat.mockImplementation(
        (_body, callbacks) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              callbacks.onDelta({ content: '<thinking>Step one.' });
              callbacks.onDelta({ content: ' Step two.</thinking>' });
              callbacks.onDelta({ content: 'Final answer.' });
              callbacks.onDone();
              resolve();
            }, 0);
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'question', CLOUD_MODEL);
      });

      const msgs = getState().messages[CONV_ID] ?? [];
      const assistantMsg = msgs.find((m) => m.role === 'assistant');
      expect(assistantMsg?.content).toBe('Final answer.');
      const reasoning = assistantMsg?.reasoning ?? '';
      expect(reasoning.match(/Step one\. Step two\./g)?.length).toBe(1);
    });
  });

  describe('memory master switch', () => {
    const STORED_FACT = 'user prefers rust over python';
    const PAST_CHAT_EXCERPT = 'Earlier chat: shipped the rust migration';

    function systemContentsOf(body: Parameters<typeof streamChat>[0] | null): string[] {
      const messages = (body as { messages?: Array<{ role: string; content: unknown }> } | null)
        ?.messages;
      return (messages ?? [])
        .filter((message) => message.role === 'system')
        .map((message) => String(message.content));
    }

    function captureCloudTurn(): { read: () => Parameters<typeof streamChat>[0] | null } {
      let capturedBody: Parameters<typeof streamChat>[0] | null = null;
      mockStreamChat.mockImplementation(
        (body, callbacks) =>
          new Promise<void>((resolve) => {
            capturedBody = body;
            setTimeout(() => {
              callbacks.onDelta({ content: 'ok' });
              callbacks.onDone();
              resolve();
            }, 0);
          }),
      );
      return { read: () => capturedBody };
    }

    beforeEach(() => {
      mockRetrieveMemoryContext.mockResolvedValue([
        {
          id: 'memory-1',
          fact: STORED_FACT,
          source_conversation_id: null,
          pinned: true,
          created_at: 1,
        },
      ]);
      mockRetrievePastChatContext.mockResolvedValue(PAST_CHAT_EXCERPT);
    });

    afterEach(() => {
      mockRetrieveMemoryContext.mockResolvedValue([]);
      mockRetrievePastChatContext.mockResolvedValue(null);
    });

    it('leaves memory and past chats to the server on a Cloud turn', async () => {
      useCloudSettingsStore.setState({ memoryEnabled: true, referencePastChats: true });
      seedCloudConversation();
      const turn = captureCloudTurn();

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'which language should I use', CLOUD_MODEL);
      });

      expect(mockRetrieveMemoryContext).not.toHaveBeenCalled();
      expect(mockRetrievePastChatContext).not.toHaveBeenCalled();
      const systemContents = systemContentsOf(turn.read());
      expect(systemContents.some((content) => content.includes(STORED_FACT))).toBe(false);
      expect(systemContents.some((content) => content.includes(PAST_CHAT_EXCERPT))).toBe(false);
    });

    it('stops writing new Local memories when the master switch is off', async () => {
      useLocalSettingsStore.setState({
        memoryEnabled: false,
        referencePastChats: true,
        generateMemoryFromHistory: true,
      });
      mockRemoteDisabledReason.mockReturnValue('mobile-local-only');
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
      mockLocalGenerate.mockResolvedValue({
        text: 'Nice to meet you.',
        runtime: 'executorch',
        aborted: false,
      });

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'My name is Grace Hopper.', LOCAL_MODEL);
      });

      expect(mockRetrieveMemoryContext).not.toHaveBeenCalled();
      expect(mockConsolidateFactsFromTurn).not.toHaveBeenCalled();
    });
  });

  describe('local LLM path', () => {
    describe('deferred Local settlement', () => {
      const finalText = [
        '```typescript',
        'export function answer() {',
        '  const value = 42;',
        '  return value;',
        '}',
        '```',
      ].join('\n');

      function deferred<T>() {
        let resolve!: (value: T) => void;
        let reject!: (reason: Error) => void;
        const promise = new Promise<T>((res, rej) => {
          resolve = res;
          reject = rej;
        });
        return { promise, resolve, reject };
      }

      function startUsagePendingTurn() {
        const usage = deferred<void>();
        mockMarkInstalledModelUsed.mockReturnValueOnce(usage.promise);
        mockLocalGenerate.mockImplementationOnce(async (_path, options) => {
          options.onToken?.('Partial reply');
          return { text: finalText, runtime: 'executorch', aborted: false };
        });
        const send = getState().sendMessage(CONV_ID, 'Remember my favorite language.', LOCAL_MODEL);
        return { usage, send };
      }

      beforeEach(() => {
        useChatStore.setState({ currentConversationId: CONV_ID });
        useArtifactStore.getState().clearArtifacts();
        mockRemoteDisabledReason.mockReturnValue('mobile-local-only');
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
      });

      it('settles against live rows and preserves edits and assistant metadata', async () => {
        const turn = startUsagePendingTurn();
        await waitFor(() => expect(mockMarkInstalledModelUsed).toHaveBeenCalledTimes(1));
        act(() => {
          useChatMessageStore.setState((state) => ({
            messages: {
              ...state.messages,
              [CONV_ID]: state.messages[CONV_ID]!.map((message) =>
                message.role === 'user'
                  ? { ...message, content: 'Edited while saving usage' }
                  : {
                      ...message,
                      metadata: { ...message.metadata, thinkingStartedAt: 123 },
                    },
              ),
            },
            conversations: state.conversations.map((conversation) =>
              conversation.id === CONV_ID
                ? { ...conversation, title: 'Edited title' }
                : conversation,
            ),
          }));
        });
        await act(async () => {
          turn.usage.resolve(undefined);
          await turn.send;
        });
        const messages = getState().messages[CONV_ID]!;
        expect(messages.find((message) => message.role === 'user')?.content).toBe(
          'Edited while saving usage',
        );
        expect(messages.find((message) => message.role === 'assistant')).toMatchObject({
          content: finalText,
          isStreaming: false,
          metadata: { thinkingStartedAt: 123 },
        });
        expect(
          getState().conversations.find((conversation) => conversation.id === CONV_ID)?.title,
        ).toBe('Edited title');
        expect(mockConsolidateFactsFromTurn).toHaveBeenCalledTimes(1);
        expect(useArtifactStore.getState().artifacts.length).toBeGreaterThan(0);
      });

      it('does not restore an assistant deleted while usage persistence is pending', async () => {
        const turn = startUsagePendingTurn();
        await waitFor(() => expect(mockMarkInstalledModelUsed).toHaveBeenCalledTimes(1));
        const assistant = getState().messages[CONV_ID]!.find(
          (message) => message.role === 'assistant',
        )!;
        act(() => getState().deleteMessage(CONV_ID, assistant.id));
        await act(async () => {
          turn.usage.resolve(undefined);
          await turn.send;
        });
        expect(getState().messages[CONV_ID]!.some((message) => message.id === assistant.id)).toBe(
          false,
        );
        expect(mockConsolidateFactsFromTurn).not.toHaveBeenCalled();
        expect(useArtifactStore.getState().artifacts).toEqual([]);
      });

      it('does not restore a conversation deleted while usage persistence is pending', async () => {
        const turn = startUsagePendingTurn();
        await waitFor(() => expect(mockMarkInstalledModelUsed).toHaveBeenCalledTimes(1));
        await act(async () => {
          await getState().deleteConversation(CONV_ID);
        });
        await act(async () => {
          turn.usage.resolve(undefined);
          await turn.send;
        });
        expect(getState().conversations.some((conversation) => conversation.id === CONV_ID)).toBe(
          false,
        );
        expect(getState().messages[CONV_ID]).toBeUndefined();
        expect(mockConsolidateFactsFromTurn).not.toHaveBeenCalled();
        expect(useArtifactStore.getState().artifacts).toEqual([]);
      });

      it.each(['resolve', 'reject'] as const)(
        'preserves a replacement stream when stopped usage persistence settles late (%s)',
        async (outcome) => {
          const turn = startUsagePendingTurn();
          await waitFor(() => expect(mockMarkInstalledModelUsed).toHaveBeenCalledTimes(1));
          const oldAssistant = getState().messages[CONV_ID]!.find(
            (message) => message.role === 'assistant',
          )!;
          act(() => getState().stopStreaming());
          const replacement = deferred<Awaited<ReturnType<typeof localGenerate>>>();
          let replacementOptions: Parameters<typeof localGenerate>[1] | undefined;
          mockLocalGenerate.mockImplementationOnce((_path, options) => {
            replacementOptions = options;
            options.onToken?.('Replacement partial');
            return replacement.promise;
          });
          const replacementSend = getState().sendMessage(
            CONV_ID,
            'Replacement question',
            LOCAL_MODEL,
          );
          await waitFor(() => expect(mockLocalGenerate).toHaveBeenCalledTimes(2));
          await act(async () => {
            if (outcome === 'resolve') turn.usage.resolve(undefined);
            else turn.usage.reject(new Error('Late usage persistence failure'));
            await turn.send;
          });
          expect(getState().isStreaming).toBe(true);
          expect(getState().streamingContent).toBe('Replacement partial');
          expect(
            getState().messages[CONV_ID]!.find((message) => message.id === oldAssistant.id)
              ?.content,
          ).toBe('Partial reply');
          expect(mockConsolidateFactsFromTurn).not.toHaveBeenCalled();
          expect(useArtifactStore.getState().artifacts).toEqual([]);
          act(() => getState().stopStreaming());
          expect(replacementOptions?.signal.aborted).toBe(true);
          await act(async () => {
            replacement.resolve({
              text: 'Replacement partial',
              runtime: 'executorch',
              aborted: true,
            });
            await replacementSend;
          });
        },
      );

      it('preserves partial content and reasoning when the current Local turn fails', async () => {
        mockLocalGenerate.mockImplementationOnce(async (_path, options) => {
          options.onToken?.('<think>Partial reasoning</think>Partial answer');
          throw new Error('Local runtime failed');
        });
        await act(async () => {
          await getState().sendMessage(CONV_ID, 'Question', LOCAL_MODEL);
        });
        expect(
          getState().messages[CONV_ID]!.find((message) => message.role === 'assistant'),
        ).toMatchObject({
          content: 'Partial answer',
          reasoning: 'Partial reasoning',
          isStreaming: false,
        });
        expect(getState().isStreaming).toBe(false);
        expect(mockConsolidateFactsFromTurn).not.toHaveBeenCalled();
      });

      it('ignores a late Local rejection after Stop starts a replacement stream', async () => {
        const old = deferred<Awaited<ReturnType<typeof localGenerate>>>();
        let oldOptions: Parameters<typeof localGenerate>[1] | undefined;
        mockLocalGenerate.mockImplementationOnce((_path, options) => {
          oldOptions = options;
          options.onToken?.('Old partial');
          return old.promise;
        });
        const oldSend = getState().sendMessage(CONV_ID, 'Old question', LOCAL_MODEL);
        await waitFor(() => expect(mockLocalGenerate).toHaveBeenCalledTimes(1));
        act(() => getState().stopStreaming());
        const replacement = deferred<Awaited<ReturnType<typeof localGenerate>>>();
        let replacementOptions: Parameters<typeof localGenerate>[1] | undefined;
        mockLocalGenerate.mockImplementationOnce((_path, options) => {
          replacementOptions = options;
          options.onToken?.('New partial');
          return replacement.promise;
        });
        const replacementSend = getState().sendMessage(CONV_ID, 'New question', LOCAL_MODEL);
        await waitFor(() => expect(mockLocalGenerate).toHaveBeenCalledTimes(2));
        await act(async () => {
          oldOptions?.onToken?.(' stale token');
          old.reject(new Error('Late Local failure'));
          await oldSend;
        });
        expect(getState().isStreaming).toBe(true);
        expect(getState().streamingContent).toBe('New partial');
        expect(getState().error).toBeNull();
        expect(
          getState()
            .messages[CONV_ID]!.filter((message) => message.role === 'assistant')
            .map((message) => message.content),
        ).toEqual(['Old partial', 'New partial']);
        expect(mockConsolidateFactsFromTurn).not.toHaveBeenCalled();
        act(() => getState().stopStreaming());
        expect(replacementOptions?.signal.aborted).toBe(true);
        await act(async () => {
          replacement.resolve({ text: 'New partial', runtime: 'executorch', aborted: true });
          await replacementSend;
        });
      });
    });

    it('captures durable facts only after a successful local assistant turn', async () => {
      mockRemoteDisabledReason.mockReturnValue('mobile-local-only');
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
      mockLocalGenerate.mockImplementation(async () => {
        expect(mockConsolidateFactsFromTurn).not.toHaveBeenCalled();
        return { text: 'Nice to meet you.', runtime: 'executorch', aborted: false };
      });

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'My name is Grace Hopper.', LOCAL_MODEL);
      });

      expect(mockConsolidateFactsFromTurn).toHaveBeenCalledTimes(1);
      expect(mockConsolidateFactsFromTurn).toHaveBeenCalledWith({
        message: 'My name is Grace Hopper.',
        conversationId: CONV_ID,
        includeSensitiveTopics: false,
      });
    });

    it('does not capture durable facts when local generation fails', async () => {
      mockRemoteDisabledReason.mockReturnValue('mobile-local-only');
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
      mockLocalGenerate.mockRejectedValue(new Error('local runtime unavailable'));

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'My name is Grace Hopper.', LOCAL_MODEL);
      });

      expect(mockConsolidateFactsFromTurn).not.toHaveBeenCalled();
    });

    it('does not capture durable facts when local generation is cancelled', async () => {
      useChatStore.setState({ currentConversationId: CONV_ID });
      mockRemoteDisabledReason.mockReturnValue('mobile-local-only');
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
      mockLocalGenerate.mockImplementation(
        (_modelPath, opts) =>
          new Promise((resolve) => {
            opts.signal.addEventListener(
              'abort',
              () => resolve({ text: 'Partial reply', runtime: 'executorch', aborted: true }),
              { once: true },
            );
          }),
      );

      const send = getState().sendMessage(CONV_ID, 'My name is Grace Hopper.', LOCAL_MODEL);
      await waitFor(() => expect(mockLocalGenerate).toHaveBeenCalledTimes(1));
      act(() => getState().stopStreaming());
      await act(async () => {
        await send;
      });

      expect(mockConsolidateFactsFromTurn).not.toHaveBeenCalled();
    });

    it('does not capture durable facts when the local runtime reports an abort', async () => {
      mockRemoteDisabledReason.mockReturnValue('mobile-local-only');
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
      mockLocalGenerate.mockResolvedValue({
        text: 'Partial reply',
        runtime: 'executorch',
        aborted: true,
      });

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'My name is Grace Hopper.', LOCAL_MODEL);
      });

      expect(mockConsolidateFactsFromTurn).not.toHaveBeenCalled();
    });

    it('does not capture durable facts when the local runtime returns no answer', async () => {
      mockRemoteDisabledReason.mockReturnValue('mobile-local-only');
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
      mockLocalGenerate.mockResolvedValue({
        text: '',
        runtime: 'executorch',
        aborted: false,
      });

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'My name is Grace Hopper.', LOCAL_MODEL);
      });

      expect(mockConsolidateFactsFromTurn).not.toHaveBeenCalled();
    });

    it('does not capture durable facts when the local turn is temporary', async () => {
      useSettingsStore.setState({ isTemporaryChat: true });
      useChatStore.setState({
        conversations: getState().conversations.map((conversation) =>
          conversation.id === CONV_ID ? { ...conversation, temporary: true } : conversation,
        ),
      });
      mockRemoteDisabledReason.mockReturnValue('mobile-local-only');
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
      mockLocalGenerate.mockResolvedValue({
        text: 'Nice to meet you.',
        runtime: 'executorch',
        aborted: false,
      });

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'My name is Grace Hopper.', LOCAL_MODEL);
      });

      expect(mockConsolidateFactsFromTurn).not.toHaveBeenCalled();
    });

    it('never captures durable facts on the device from a cloud stream', async () => {
      seedCloudConversation();
      mockRemoteDisabledReason.mockReturnValue(null);
      mockStreamChat.mockImplementation(
        (_body, callbacks) =>
          new Promise<void>((resolve) => {
            callbacks.onDelta({ content: 'Nice to meet you.' });
            callbacks.onDone();
            resolve();
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'My name is Grace Hopper.', CLOUD_MODEL);
      });

      expect(mockConsolidateFactsFromTurn).not.toHaveBeenCalled();
    });

    it('refuses a local conversation whose model no longer resolves instead of streaming it to cloud', async () => {
      mockRemoteDisabledReason.mockReturnValue(null);

      let accepted: boolean | undefined;
      await act(async () => {
        accepted = await getState().sendMessage(CONV_ID, 'My name is Grace Hopper.', MODEL);
      });

      expect(accepted).toBe(false);
      expect(mockStreamChat).not.toHaveBeenCalled();
      expect(mockLocalGenerate).not.toHaveBeenCalled();
      expect(getState().error).toContain('no longer available on this device');
    });

    it('does not capture durable facts when a cloud stream has no answer', async () => {
      seedCloudConversation();
      mockRemoteDisabledReason.mockReturnValue(null);
      mockStreamChat.mockImplementation(async (_body, callbacks) => {
        callbacks.onDone();
      });

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'My name is Grace Hopper.', CLOUD_MODEL);
      });

      expect(mockConsolidateFactsFromTurn).not.toHaveBeenCalled();
    });

    it('sends selected chat mode and style context to local generation', async () => {
      useChatStore.setState({ chatMode: 'research' });
      useChatViewStore.setState({ chatStyle: 'concise', styleConversationId: CONV_ID });
      mockRemoteDisabledReason.mockReturnValue('mobile-local-only');
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
      mockLocalGenerate.mockImplementation(async (_modelPath, opts) => {
        capturedLocalGenerateOptions = opts;
        opts.onToken?.('Answer');
        return { text: 'Answer', runtime: 'executorch', aborted: false };
      });

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'compare options', LOCAL_MODEL);
      });

      expect(capturedLocalGenerateOptions?.messages).toEqual([
        {
          role: 'system',
          content: expect.stringContaining('helpful assistant running locally'),
        },
        {
          role: 'system',
          content: expect.stringContaining('Mode: Research'),
        },
      ]);
      expect(capturedLocalGenerateOptions?.messages?.[1]?.content).toContain('Style: Concise');
    });

    it('runs the selected installed local model and streams tokens into the assistant message', async () => {
      useChatStore.setState({
        messages: {
          [CONV_ID]: [
            {
              id: 'prev-user',
              conversationId: CONV_ID,
              role: 'user',
              content: 'Earlier context',
              createdAt: new Date().toISOString(),
            },
            {
              id: 'prev-assistant',
              conversationId: CONV_ID,
              role: 'assistant',
              content: 'Earlier response',
              createdAt: new Date().toISOString(),
              isStreaming: false,
            },
          ],
        },
      });
      mockRemoteDisabledReason.mockReturnValue('mobile-local-only');
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
      mockLocalGenerate.mockImplementation(async (_modelPath, opts) => {
        capturedLocalGenerateOptions = opts;
        opts.onToken?.('Hel');
        opts.onToken?.('lo');
        return { text: 'Hello', runtime: 'executorch', aborted: false };
      });

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'Use local model', LOCAL_MODEL);
      });

      expect(mockLocalGenerate).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ modelId: LOCAL_MODEL, prompt: 'Use local model' }),
      );
      expect(capturedLocalGenerateOptions?.messages).toEqual([
        {
          role: 'system',
          content: expect.stringContaining('helpful assistant running locally'),
        },
        { role: 'user', content: 'Earlier context' },
        { role: 'assistant', content: 'Earlier response' },
      ]);
      expect(mockMarkInstalledModelUsed).toHaveBeenCalledWith(LOCAL_MODEL);

      const msgs = getState().messages[CONV_ID] ?? [];
      const assistantMsg = [...msgs].reverse().find((m) => m.role === 'assistant');
      expect(assistantMsg?.content).toBe('Hello');
      expect(assistantMsg?.isStreaming).toBe(false);
      expect(assistantMsg?.metadata).toMatchObject({
        localMode: true,
        localModelId: LOCAL_MODEL,
        localRuntime: 'executorch',
      });
    });

    it('uses the conversation project instructions instead of the currently active project', async () => {
      useChatStore.setState({
        conversations: [
          {
            id: CONV_ID,
            title: 'Project A chat',
            updatedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            messageCount: 0,
            pinned: false,
            model: LOCAL_MODEL,
            provider: 'local',
            executionMode: 'local',
            projectId: 'project-a',
          },
        ],
        messages: { [CONV_ID]: [] },
      });
      useProjectStore.setState({
        projects: [
          {
            id: 'project-a',
            name: 'Project A',
            description: '',
            instructions: 'Use Project A instructions.',
            sources: [],
            createdAt: '2026-06-11T00:00:00.000Z',
            updatedAt: '2026-06-11T00:00:00.000Z',
          },
          {
            id: 'project-b',
            name: 'Project B',
            description: '',
            instructions: 'Use Project B instructions.',
            sources: [],
            createdAt: '2026-06-11T00:00:00.000Z',
            updatedAt: '2026-06-11T00:00:00.000Z',
          },
        ],
        activeProjectId: 'project-b',
      });
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
      mockLocalGenerate.mockImplementation(async (_modelPath, opts) => {
        capturedLocalGenerateOptions = opts;
        return { text: 'Project scoped answer', runtime: 'executorch', aborted: false };
      });

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'Use this project context', LOCAL_MODEL);
      });

      const systemMessages = capturedLocalGenerateOptions?.messages?.filter(
        (message) => message.role === 'system',
      );
      expect(systemMessages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ content: 'Use Project A instructions.' }),
        ]),
      );
      expect(systemMessages).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ content: 'Use Project B instructions.' }),
        ]),
      );
    });

    describe('Local project sources', () => {
      const projectSource = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'text/plain',
        size: 40,
        uri: `file:///cache/${name}`,
        addedAt: '2026-06-11T00:00:00.000Z',
      });

      afterEach(() => {
        mockParseDocument.mockReset();
      });

      async function sendInLocalProject(sources: ReturnType<typeof projectSource>[]) {
        useChatStore.setState({
          conversations: [
            {
              id: CONV_ID,
              title: 'Project A chat',
              updatedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              messageCount: 0,
              pinned: false,
              model: LOCAL_MODEL,
              provider: 'local',
              executionMode: 'local',
              projectId: 'project-a',
            },
          ],
          messages: { [CONV_ID]: [] },
        });
        useProjectStore.setState({
          projects: [
            {
              id: 'project-a',
              name: 'Project A',
              description: '',
              instructions: '',
              sources,
              createdAt: '2026-06-11T00:00:00.000Z',
              updatedAt: '2026-06-11T00:00:00.000Z',
            },
            {
              id: 'project-b',
              name: 'Project B',
              description: '',
              instructions: '',
              sources: [projectSource('src-b', 'other.txt')],
              createdAt: '2026-06-11T00:00:00.000Z',
              updatedAt: '2026-06-11T00:00:00.000Z',
            },
          ],
          activeProjectId: 'project-b',
        });
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
        mockLocalGenerate.mockImplementation(async (_modelPath, opts) => {
          capturedLocalGenerateOptions = opts;
          return { text: 'Answer', runtime: 'executorch', aborted: false };
        });
        await act(async () => {
          await getState().sendMessage(
            CONV_ID,
            'What shipment label is in my project source?',
            LOCAL_MODEL,
          );
        });
        return (capturedLocalGenerateOptions?.messages ?? [])
          .filter((message) => message.role === 'system')
          .map((message) => String(message.content));
      }

      it('puts the conversation project sources in the first Local request', async () => {
        mockParseDocument.mockImplementation(async (uri) => ({
          text: uri.endsWith('label.txt') ? 'The shipment label is violet-742.' : 'wrong project',
          metadata: { docType: 'txt' },
        }));

        const systemMessages = await sendInLocalProject([projectSource('src-a', 'label.txt')]);

        expect(mockParseDocument).toHaveBeenCalledTimes(1);
        expect(mockParseDocument).toHaveBeenCalledWith('file:///cache/label.txt', 'text/plain');
        const sourceMessage = systemMessages.find((content) => content.includes('violet-742'));
        expect(sourceMessage).toContain('[Project source: label.txt (text/plain)]');
        expect(systemMessages.join('\n')).not.toContain('wrong project');
      });

      it('names a source whose file cannot be read instead of dropping it silently', async () => {
        mockParseDocument.mockRejectedValue(new Error('gone'));

        const systemMessages = await sendInLocalProject([projectSource('src-a', 'label.txt')]);

        expect(systemMessages.join('\n')).toContain(
          '[Project source: label.txt (text/plain), content could not be extracted on-device]',
        );
      });

      it('adds nothing once the project has no sources', async () => {
        const systemMessages = await sendInLocalProject([]);

        expect(mockParseDocument).not.toHaveBeenCalled();
        expect(systemMessages.join('\n')).not.toContain('Project source');
      });
    });

    describe('Local attached documents across turns', () => {
      const attachment = {
        id: 'doc-1',
        uri: 'file:///cache/allocations.txt',
        mimeType: 'text/plain',
        fileName: 'allocations.txt',
        fileSize: 64,
      };

      async function sendLocalTurn(content: string, attachments?: (typeof attachment)[]) {
        mockLocalGenerate.mockImplementation(async (_modelPath, opts) => {
          capturedLocalGenerateOptions = opts;
          return { text: 'Answer', runtime: 'executorch', aborted: false };
        });
        await act(async () => {
          await getState().sendMessage(CONV_ID, content, LOCAL_MODEL, attachments);
        });
        return (capturedLocalGenerateOptions?.messages ?? [])
          .filter((message) => message.role === 'user')
          .map((message) => String(message.content));
      }

      beforeEach(() => {
        useChatStore.setState({
          conversations: [
            {
              id: CONV_ID,
              title: 'Local document chat',
              updatedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              messageCount: 0,
              pinned: false,
              model: LOCAL_MODEL,
              provider: 'local',
              executionMode: 'local',
            },
          ],
          messages: { [CONV_ID]: [] },
        });
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
        mockParseDocument.mockImplementation(async () => ({
          text: 'Alpha allocation: 10\nBeta allocation: 20',
          metadata: { docType: 'txt' },
        }));
      });

      it('keeps an earlier turn document text in the history of a follow-up question', async () => {
        await sendLocalTurn('What is the Alpha allocation?', [attachment]);
        mockParseDocument.mockClear();

        const userTurns = await sendLocalTurn('And the Beta allocation?');

        expect(mockParseDocument).toHaveBeenCalledTimes(1);
        expect(mockParseDocument).toHaveBeenCalledWith(
          'file:///cache/allocations.txt',
          'text/plain',
        );
        expect(userTurns).toHaveLength(1);
        expect(userTurns[0]).toContain('Beta allocation: 20');
        expect(userTurns[0]).toContain('What is the Alpha allocation?');
      });

      it('names a document that can no longer be read instead of dropping it from the history', async () => {
        await sendLocalTurn('What is the Alpha allocation?', [attachment]);
        mockParseDocument.mockRejectedValue(new Error('gone'));

        const userTurns = await sendLocalTurn('And the Beta allocation?');

        expect(userTurns.join('\n')).toContain(
          '[Attached file: allocations.txt (text/plain), content could not be extracted on-device]',
        );
      });
    });

    describe('editing a Local message', () => {
      const stamp = new Date().toISOString();
      const original = [
        { id: 'edit-u1', role: 'user' as const, content: 'first question' },
        { id: 'edit-a1', role: 'assistant' as const, content: 'first answer' },
        { id: 'edit-u2', role: 'user' as const, content: 'second question' },
        { id: 'edit-a2', role: 'assistant' as const, content: 'second answer' },
      ].map((row) => ({
        ...row,
        conversationId: CONV_ID,
        createdAt: stamp,
        isStreaming: false,
      }));

      const contents = () => (getState().messages[CONV_ID] ?? []).map((row) => row.content);

      beforeEach(() => {
        useChatStore.setState({
          conversations: [
            {
              id: CONV_ID,
              title: 'Local edit chat',
              updatedAt: stamp,
              createdAt: stamp,
              messageCount: original.length,
              pinned: false,
              model: LOCAL_MODEL,
              provider: 'local',
              executionMode: 'local',
            },
          ],
          messages: { [CONV_ID]: original },
        });
        mockRemoteDisabledReason.mockReturnValue('mobile-local-only');
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
          text: 'edited answer',
          runtime: 'executorch',
          aborted: false,
        }));
      });

      it('keeps the original question and everything after it when the replacement is refused', async () => {
        useSettingsStore.setState({ reduceSensitiveContent: true });
        const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

        try {
          act(() => {
            expect(getState().editMessage(CONV_ID, 'edit-u2', 'What does NSFW stand for?')).toBe(
              true,
            );
          });
          await waitFor(() => expect(getState().isEditing).toBe(false));

          expect(alertSpy).toHaveBeenCalledWith(
            'Content not available',
            REDUCED_SENSITIVE_CONTENT_REFUSAL,
          );
          expect(getState().messages[CONV_ID]).toEqual(original);
          expect(mockLocalGenerate).not.toHaveBeenCalled();
        } finally {
          alertSpy.mockRestore();
        }
      });

      it('restores the removed turns in place and never reaches Cloud when the Local chat holds a Cloud model', async () => {
        const withCloudModel = original.map((row) =>
          row.id === 'edit-u1' ? { ...row, model: CLOUD_MODEL } : row,
        );
        useChatStore.setState({ messages: { [CONV_ID]: withCloudModel } });

        act(() => {
          getState().editMessage(CONV_ID, 'edit-u1', 'rewritten opening');
        });
        await waitFor(() => expect(getState().isEditing).toBe(false));

        expect(getState().error).toBe(
          'This is a Local Mode chat. Start a separate AGI Cloud chat to use Cloud models.',
        );
        expect(getState().messages[CONV_ID]).toEqual(withCloudModel);
        expect(mockStreamChat).not.toHaveBeenCalled();
        expect(mockLocalGenerate).not.toHaveBeenCalled();
      });

      it('replaces the edited question and the turns after it once the replacement is accepted', async () => {
        act(() => {
          getState().editMessage(CONV_ID, 'edit-u2', 'revised second question');
        });
        await waitFor(() => {
          expect(getState().isEditing).toBe(false);
          expect(contents()).toContain('edited answer');
        });

        expect(contents()).toEqual([
          'first question',
          'first answer',
          'revised second question',
          'edited answer',
        ]);
      });
    });

    it('leaves Cloud project instructions to the server, which loads them from the conversation', async () => {
      useChatStore.setState({
        conversations: [
          {
            id: CONV_ID,
            title: 'Cloud project chat',
            updatedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            messageCount: 0,
            pinned: false,
            model: CLOUD_MODEL,
            provider: 'cloud_managed',
            executionMode: 'cloud',
            projectId: 'cloud-project-a',
          },
        ],
        messages: { [CONV_ID]: [] },
      });
      useCloudProjectStore.setState({
        projects: [
          {
            id: 'cloud-project-a',
            name: 'Cloud Project A',
            description: null,
            instructions: 'Always answer in exactly one sentence.',
            color: null,
            isArchived: false,
            metadata: null,
            source: 'mobile',
            createdAt: '2026-06-11T00:00:00.000Z',
            updatedAt: '2026-06-11T00:00:00.000Z',
            deletedAt: null,
          },
        ],
        activeProjectId: 'cloud-project-a',
      });
      useWaitlistStore.setState({ cloudUnlocked: true });
      mockRemoteDisabledReason.mockReturnValue(null);

      let capturedBody: Parameters<typeof streamChat>[0] | null = null;
      mockStreamChat.mockImplementation(
        (body, callbacks) =>
          new Promise<void>((resolve) => {
            capturedBody = body;
            callbacks.onDelta({ content: 'One sentence answer.' });
            callbacks.onDone();
            resolve();
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'Describe a neural network', CLOUD_MODEL);
      });

      const systemMessages = capturedBody?.messages?.filter((message) => message.role === 'system');
      expect(systemMessages ?? []).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ content: 'Always answer in exactly one sentence.' }),
        ]),
      );
    });

    it('keeps a selected local model on-device even when remote chat is otherwise allowed', async () => {
      mockRemoteDisabledReason.mockReturnValue(null);
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
      mockLocalGenerate.mockImplementation(async (_modelPath, opts) => {
        opts.onToken?.('Local');
        return { text: 'Local answer', runtime: 'executorch', aborted: false };
      });

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'Stay local', LOCAL_MODEL);
      });

      expect(mockLocalGenerate).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ modelId: LOCAL_MODEL, prompt: 'Stay local' }),
      );
      expect(mockStreamChat).not.toHaveBeenCalled();
    });

    it('strips local reasoning and model control tokens from visible replies', async () => {
      mockRemoteDisabledReason.mockReturnValue('mobile-local-only');
      mockListInstalledModels.mockResolvedValue([
        {
          id: LOCAL_MODEL,
          display_name: 'AGI Standard',
          runtime: 'local',
          format: 'pte',
          size_bytes: 2_147_483_648,
          sha256: null,
          local_path: null,
          installed_at: 1,
          last_used_at: null,
          capabilities: null,
        },
      ]);
      mockLocalGenerate.mockImplementation(async (_modelPath, opts) => {
        capturedLocalGenerateOptions = opts;
        return {
          text: '<think>Pick a concise answer.</think>\n\nA local mode test can answer a simple offline question in one sentence.<|im_end|>',
          runtime: 'executorch',
          aborted: false,
        };
      });

      await act(async () => {
        await getState().sendMessage(
          CONV_ID,
          'Give me a one sentence local mode test.',
          LOCAL_MODEL,
        );
      });

      expect(capturedLocalGenerateOptions?.messages?.[0]?.content).toContain(
        "Answer the user's current request directly",
      );

      const msgs = getState().messages[CONV_ID] ?? [];
      const assistantMsg = [...msgs].reverse().find((m) => m.role === 'assistant');
      expect(assistantMsg?.content).toBe(
        'A local mode test can answer a simple offline question in one sentence.',
      );
      expect(assistantMsg?.content).not.toContain('<think>');
      expect(assistantMsg?.content).not.toContain('<|im_end|>');
      expect(assistantMsg?.reasoning).toBe('Pick a concise answer.');
    });
  });

  describe('cloud invite path', () => {
    it('writes an in-flight Cloud turn only to the Cloud message repository', async () => {
      const now = new Date().toISOString();
      useChatMessageStore.setState({ conversations: [], messages: {} });
      useChatCloudMessageStore.setState({
        conversations: [
          {
            id: CONV_ID,
            title: 'Cloud-only owner',
            updatedAt: now,
            createdAt: now,
            messageCount: 0,
            pinned: false,
            model: CLOUD_MODEL,
            provider: 'cloud_managed',
            executionMode: 'cloud',
          },
        ],
        messages: { [CONV_ID]: [] },
      });
      useWaitlistStore.setState({ cloudUnlocked: true });
      mockRemoteDisabledReason.mockReturnValue(null);
      mockStreamChat.mockImplementation(
        (_body, callbacks) =>
          new Promise<void>((resolve) => {
            callbacks.onDelta({ content: 'Cloud-owned answer' });
            callbacks.onDone();
            resolve();
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'Stay in Cloud storage', CLOUD_MODEL);
      });

      expect(useChatMessageStore.getState().messages[CONV_ID]).toBeUndefined();
      expect(useChatCloudMessageStore.getState().messages[CONV_ID]).toEqual([
        expect.objectContaining({ role: 'user', content: 'Stay in Cloud storage' }),
        expect.objectContaining({ role: 'assistant', content: 'Cloud-owned answer' }),
      ]);
    });

    it('does not fall back to local generation for locked cloud models', async () => {
      seedCloudConversation();
      mockRemoteDisabledReason.mockReturnValue('mobile-local-only');

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'Use AGI Cloud', CLOUD_MODEL);
      });

      expect(mockLocalGenerate).not.toHaveBeenCalled();
      expect(mockStreamChat).not.toHaveBeenCalled();
      expect(getState().error).toBe('mobile-local-only');
      expect(getState().messages[CONV_ID]).toEqual([]);
    });

    it('streams unlocked cloud models through the remote path', async () => {
      seedCloudConversation();
      useWaitlistStore.setState({ cloudUnlocked: true });
      mockRemoteDisabledReason.mockReturnValue(null);
      let capturedBody: Parameters<typeof streamChat>[0] | null = null;
      mockStreamChat.mockImplementation(
        (body, callbacks) =>
          new Promise<void>((resolve) => {
            capturedBody = body;
            callbacks.onDelta({ content: 'Cloud answer' });
            callbacks.onDone();
            resolve();
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'Use AGI Cloud', CLOUD_MODEL);
      });

      expect(mockLocalGenerate).not.toHaveBeenCalled();
      expect(capturedBody?.model).toBe(CLOUD_MODEL);
      const msgs = getState().messages[CONV_ID] ?? [];
      const assistantMsg = [...msgs].reverse().find((m) => m.role === 'assistant');
      expect(assistantMsg?.content).toBe('Cloud answer');
      expect(assistantMsg?.metadata?.localMode).toBeUndefined();
    });

    it('reuses an owner-scoped Library asset without uploading its bytes again', async () => {
      seedCloudConversation();
      useWaitlistStore.setState({ cloudUnlocked: true });
      mockRemoteDisabledReason.mockReturnValue(null);
      let capturedBody: Parameters<typeof streamChat>[0] | null = null;
      mockStreamChat.mockImplementation(
        (body, callbacks) =>
          new Promise<void>((resolve) => {
            capturedBody = body;
            callbacks.onDelta({ content: 'Reviewed' });
            callbacks.onDone();
            resolve();
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'Review this again', CLOUD_MODEL, [
          {
            id: 'library-message-1:0',
            uri: '/api/files/11111111-1111-4111-8111-111111111111',
            mimeType: 'application/pdf',
            fileName: 'launch-plan.pdf',
            fileSize: 2048,
            assetId: '11111111-1111-4111-8111-111111111111',
          },
        ]);
      });

      expect(mockApiUploadFile).not.toHaveBeenCalled();
      expect(capturedBody?.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.arrayContaining([
              {
                type: 'file',
                file: { asset_id: '11111111-1111-4111-8111-111111111111' },
              },
            ]),
          }),
        ]),
      );
      expect(
        getState().messages[CONV_ID]?.find((message) => message.role === 'user')?.attachments,
      ).toEqual([
        expect.objectContaining({
          assetId: '11111111-1111-4111-8111-111111111111',
          fileName: 'launch-plan.pdf',
          fileSize: 2048,
        }),
      ]);
    });

    it('resolves a Cloud Auto profile to a concrete admitted model and preserves provenance', async () => {
      seedCloudConversation(AUTO_MODEL_ID);
      useWaitlistStore.setState({ cloudUnlocked: true });
      mockRemoteDisabledReason.mockReturnValue(null);
      let capturedBody: Parameters<typeof streamChat>[0] | null = null;
      mockStreamChat.mockImplementation(
        (body, callbacks) =>
          new Promise<void>((resolve) => {
            capturedBody = body;
            callbacks.onDelta({ content: 'Auto-routed answer' });
            callbacks.onDone();
            resolve();
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'Explain this simply', AUTO_MODEL_ID);
      });

      expect(capturedBody?.model).toEqual(expect.any(String));
      expect(capturedBody?.model).not.toBe(AUTO_MODEL_ID);
      const messages = getState().messages[CONV_ID] ?? [];
      const userMessage = messages.find((message) => message.role === 'user');
      const assistantMessage = messages.find((message) => message.role === 'assistant');
      expect(userMessage?.model).toBe(AUTO_MODEL_ID);
      expect(userMessage?.metadata).toEqual(
        expect.objectContaining({
          requestedModel: AUTO_MODEL_ID,
          resolvedModel: capturedBody?.model,
        }),
      );
      expect(assistantMessage?.model).toBe(capturedBody?.model);
      expect(assistantMessage?.metadata).toEqual(
        expect.objectContaining({
          requestedModel: AUTO_MODEL_ID,
          resolvedModel: capturedBody?.model,
        }),
      );
    });

    it('deletes the replaced Cloud tail remotely before regenerating it', async () => {
      const now = new Date().toISOString();
      const userId = '0190a000-0000-7000-8000-000000000010';
      const assistantId = '0190a000-0000-7000-8000-000000000011';
      useChatMessageStore.setState({ conversations: [], messages: {} });
      useChatCloudMessageStore.setState({
        conversations: [
          {
            id: CONV_ID,
            title: 'Cloud retry',
            updatedAt: now,
            createdAt: now,
            messageCount: 2,
            pinned: false,
            model: CLOUD_MODEL,
            provider: 'cloud_managed',
            executionMode: 'cloud',
          },
        ],
        messages: {
          [CONV_ID]: [
            {
              id: userId,
              conversationId: CONV_ID,
              role: 'user',
              content: 'retry this',
              createdAt: now,
              model: CLOUD_MODEL,
            },
            {
              id: assistantId,
              conversationId: CONV_ID,
              role: 'assistant',
              content: 'old answer',
              createdAt: now,
              model: CLOUD_MODEL,
            },
          ],
        },
      });
      useWaitlistStore.setState({ cloudUnlocked: true });
      mockApiDelete.mockResolvedValue(undefined);
      mockStreamChat.mockImplementation(
        (_body, callbacks) =>
          new Promise<void>((resolve) => {
            callbacks.onDelta({ content: 'new answer' });
            callbacks.onDone();
            resolve();
          }),
      );

      act(() => {
        getState().retryMessage(CONV_ID, assistantId);
      });

      await waitFor(() => {
        expect(mockApiDelete).toHaveBeenCalledTimes(2);
        expect(useChatCloudMessageStore.getState().messages[CONV_ID]?.at(-1)?.content).toBe(
          'new answer',
        );
      });
      expect(useChatMessageStore.getState().messages[CONV_ID]).toBeUndefined();
    });
  });

  describe('streaming error path', () => {
    it('clears isStreaming on onError', async () => {
      mockStreamChat.mockImplementation(
        (_body, callbacks) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              callbacks.onError(new Error('Connection reset'));
              resolve();
            }, 0);
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'question', CLOUD_MODEL);
      });

      expect(getState().isStreaming).toBe(false);
    });

    it('clears streamingContent on onError', async () => {
      mockStreamChat.mockImplementation(
        (_body, callbacks) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              callbacks.onDelta({ content: 'Partial' });
              callbacks.onError(new Error('Network error'));
              resolve();
            }, 0);
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'question', CLOUD_MODEL);
      });

      expect(getState().streamingContent).toBe('');
      expect(getState().streamingReasoning).toBe('');
    });

    it('paints a visible error in the assistant bubble when the stream errors with no content', async () => {
      seedCloudConversation();
      mockStreamChat.mockImplementation(
        (_body, callbacks) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              callbacks.onError(
                new Error('The request timed out. Please check your connection and try again.'),
              );
              resolve();
            }, 0);
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'question', CLOUD_MODEL);
      });

      const msgs = getState().messages[CONV_ID] ?? [];
      const assistantMsg = msgs.find((m) => m.role === 'assistant');
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg?.isStreaming).toBe(false);
      expect(assistantMsg?.content).toBe('');
      expect(assistantMsg?.metadata?.streamError).toEqual({
        message: 'Something went wrong. Please try again.',
      });
      expect(streamFailureNoticeText(assistantMsg)).toBe('Something went wrong. Please try again.');
      expect(getState().error).toBe('Something went wrong. Please try again.');
    });

    it('marks the assistant message as non-streaming on error', async () => {
      mockStreamChat.mockImplementation(
        (_body, callbacks) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              callbacks.onError(new Error('timeout'));
              resolve();
            }, 0);
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'question', CLOUD_MODEL);
      });

      const msgs = getState().messages[CONV_ID] ?? [];
      const streamingMsgs = msgs.filter((m) => m.isStreaming);
      expect(streamingMsgs).toHaveLength(0);
    });
  });

  describe('send acceptance & per-conversation streaming', () => {
    it('blocks sensitive prompts before local or cloud execution when an adult opts in', async () => {
      useSettingsStore.getState().setReduceSensitiveContent(true);
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

      let accepted: boolean | undefined;
      await act(async () => {
        accepted = await getState().sendMessage(CONV_ID, 'show me porn', MODEL);
      });

      expect(accepted).toBe(false);
      expect(alertSpy).toHaveBeenCalledWith(
        'Content not available',
        'This content is unavailable while Reduce sensitive content is on. You can change this in Settings > Safety & Security.',
      );
      expect(mockStreamChat).not.toHaveBeenCalled();
      expect(mockLocalGenerate).not.toHaveBeenCalled();
      expect(getState().messages[CONV_ID] ?? []).toHaveLength(0);

      alertSpy.mockRestore();
    });

    it.each([
      ['new-conversation', MODEL, false],
      ['Cloud-conversation', CLOUD_MODEL, true],
    ])(
      'refuses a %s send in minor-safe mode with the adult preference off and points to Parental Controls',
      async (_label, model, cloud) => {
        if (cloud) seedCloudConversation();
        const getString = storage.getString as jest.Mock;
        getString.mockImplementation((key: string) =>
          key === 'age-gate:v1'
            ? JSON.stringify({
                confirmed: true,
                isMinor: true,
                confirmedAt: '2026-11-01T00:00:00.000Z',
                regionCode: 'US',
                threshold: 13,
              })
            : undefined,
        );
        const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

        try {
          let accepted: boolean | undefined;
          await act(async () => {
            accepted = await getState().sendMessage(CONV_ID, 'explain the term nsfw', model);
          });

          expect(useSettingsStore.getState().reduceSensitiveContent).toBe(false);
          expect(accepted).toBe(false);
          expect(alertSpy).toHaveBeenCalledWith('Content not available', MINOR_SAFE_REFUSAL);
          const body = alertSpy.mock.calls[0]?.[1] ?? '';
          expect(body).toContain('Settings > Parental Controls');
          expect(body).not.toContain('Settings > Privacy');
          expect(mockStreamChat).not.toHaveBeenCalled();
          expect(mockLocalGenerate).not.toHaveBeenCalled();
        } finally {
          getString.mockReturnValue(undefined);
          alertSpy.mockRestore();
        }
      },
    );

    it('resolves false and never fires onAccepted when a pre-flight gate blocks the send', async () => {
      mockRemoteDisabledReason.mockReturnValue('Remote chat is disabled for this test');
      const onAccepted = jest.fn();

      let accepted: boolean | undefined;
      await act(async () => {
        accepted = await getState().sendMessage(CONV_ID, 'blocked message', MODEL, undefined, {
          onAccepted,
        });
      });

      expect(accepted).toBe(false);
      expect(onAccepted).not.toHaveBeenCalled();
      expect(getState().messages[CONV_ID] ?? []).toHaveLength(0);
      expect(mockStreamChat).not.toHaveBeenCalled();
    });

    it('fires onAccepted when the user message commits, before the stream finishes', async () => {
      seedCloudConversation();
      const onAccepted = jest.fn();
      let acceptedBeforeDone = false;

      mockStreamChat.mockImplementation(
        (_body, callbacks) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              acceptedBeforeDone = onAccepted.mock.calls.length > 0;
              callbacks.onDelta({ content: 'reply' });
              callbacks.onDone();
              resolve();
            }, 0);
          }),
      );

      let accepted: boolean | undefined;
      await act(async () => {
        accepted = await getState().sendMessage(CONV_ID, 'hello', CLOUD_MODEL, undefined, {
          onAccepted,
        });
      });

      expect(onAccepted).toHaveBeenCalledTimes(1);
      expect(acceptedBeforeDone).toBe(true);
      expect(accepted).toBe(true);
    });

    it('tracks streaming per conversation via streamingConversationIds', async () => {
      seedCloudConversation();
      let idsDuringStream: string[] = [];

      mockStreamChat.mockImplementation(
        (_body, callbacks) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              idsDuringStream = [...getState().streamingConversationIds];
              callbacks.onDelta({ content: 'streamed' });
              callbacks.onDone();
              resolve();
            }, 0);
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'scope me', CLOUD_MODEL);
      });

      expect(idsDuringStream).toContain(CONV_ID);
      expect(getState().streamingConversationIds).toHaveLength(0);
      expect(getState().isStreaming).toBe(false);
    });

    it('resets streaming state even when the stream resolves without onDone or onError', async () => {
      mockStreamChat.mockImplementation(() => Promise.resolve());

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'silent stream', CLOUD_MODEL);
      });

      expect(getState().isStreaming).toBe(false);
      expect(getState().streamingConversationIds).toHaveLength(0);
      const msgs = getState().messages[CONV_ID] ?? [];
      expect(msgs.filter((m) => m.isStreaming)).toHaveLength(0);
    });

    it('honors the per-model thinking toggle instead of forcing thinking on', async () => {
      seedCloudConversation();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useModelStore } = require('../src/features/model-picker/store');
      let capturedBody: Parameters<typeof streamChat>[0] | null = null;
      mockStreamChat.mockImplementation(
        (body, callbacks) =>
          new Promise<void>((resolve) => {
            capturedBody = body;
            setTimeout(() => {
              callbacks.onDone();
              resolve();
            }, 0);
          }),
      );

      useModelStore.setState({ thinkingEnabledPerModel: {} });
      await act(async () => {
        await getState().sendMessage(CONV_ID, 'no thinking', CLOUD_MODEL);
      });
      expect(capturedBody?.thinking).toBe(false);
      const effortWithoutThinking = capturedBody?.effort;

      useModelStore.setState({ thinkingEnabledPerModel: { [CLOUD_MODEL]: true } });
      await act(async () => {
        await getState().sendMessage(CONV_ID, 'with thinking', CLOUD_MODEL);
      });
      expect(capturedBody?.thinking).toBe(true);
      expect(capturedBody?.effort).toBe(effortWithoutThinking);
    });
  });

  describe('image generation messages', () => {
    it('adds a user command and assistant progress message when image generation starts', () => {
      let assistantMessageId = '';

      act(() => {
        assistantMessageId = getState().beginImageGeneration(
          CONV_ID,
          '/image a quiet workspace',
          'a quiet workspace',
          CLOUD_MODEL,
        );
      });

      const msgs = getState().messages[CONV_ID] ?? [];
      expect(msgs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: '/image a quiet workspace',
          }),
          expect.objectContaining({
            id: assistantMessageId,
            role: 'assistant',
            isGeneratingImage: true,
            imageGenStatus: 'generating',
            imageGenPrompt: 'a quiet workspace',
          }),
        ]),
      );
      expect(getState().conversations[0]?.messageCount).toBe(2);
    });

    it('converts the assistant progress message into a generated image', () => {
      let assistantMessageId = '';

      act(() => {
        assistantMessageId = getState().beginImageGeneration(
          CONV_ID,
          '/image product launch',
          'product launch',
          CLOUD_MODEL,
        );
        getState().completeImageGeneration(CONV_ID, assistantMessageId, {
          imageUrl: 'https://example.com/generated.png',
          revisedPrompt: 'A polished product launch scene',
          model: SYNTHETIC_IMAGE_MODEL_ID,
        });
      });

      const assistantMessage = getState().messages[CONV_ID]?.find(
        (message) => message.id === assistantMessageId,
      );
      expect(assistantMessage).toEqual(
        expect.objectContaining({
          type: 'image',
          imageUrl: 'https://example.com/generated.png',
          revisedPrompt: 'A polished product launch scene',
          isGeneratingImage: false,
          imageGenStatus: 'completed',
          imageGenProgress: 100,
          model: SYNTHETIC_IMAGE_MODEL_ID,
        }),
      );
      expect(getState().conversations[0]?.lastMessage).toBe(
        'Generated image: A polished product launch scene',
      );
    });

    it('leaves a visible assistant error when image generation fails', () => {
      let assistantMessageId = '';

      act(() => {
        assistantMessageId = getState().beginImageGeneration(
          CONV_ID,
          '/image impossible request',
          'impossible request',
          CLOUD_MODEL,
        );
        getState().failImageGeneration(CONV_ID, assistantMessageId, 'Provider unavailable');
      });

      const assistantMessage = getState().messages[CONV_ID]?.find(
        (message) => message.id === assistantMessageId,
      );
      expect(assistantMessage).toEqual(
        expect.objectContaining({
          content: 'Image generation failed: Provider unavailable',
          isGeneratingImage: false,
          imageGenStatus: 'failed',
          imageGenError: 'Provider unavailable',
        }),
      );
      expect(getState().conversations[0]?.lastMessage).toBe(
        'Image generation failed: Provider unavailable',
      );
    });
  });

  describe('stopStreaming', () => {
    it('does not stop a background conversation after navigating to another chat', async () => {
      const backgroundConversationId = CONV_ID;
      const foregroundConversationId = 'test-conv-foreground';
      seedCloudConversation();
      useChatStore.setState((state) => ({
        conversations: [
          ...state.conversations,
          {
            id: foregroundConversationId,
            title: 'Foreground chat',
            updatedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            messageCount: 0,
            pinned: false,
            model: CLOUD_MODEL,
            provider: 'cloud_managed',
            executionMode: 'cloud',
          },
        ],
        messages: {
          ...state.messages,
          [foregroundConversationId]: [],
        },
        currentConversationId: backgroundConversationId,
      }));

      let backgroundSignal: AbortSignal | undefined;
      mockStreamChat.mockImplementation(
        (_body, _callbacks, signal) =>
          new Promise<void>((resolve) => {
            backgroundSignal = signal;
            signal.addEventListener('abort', () => resolve(), { once: true });
          }),
      );

      void getState().sendMessage(backgroundConversationId, 'keep working', CLOUD_MODEL);
      await waitFor(() =>
        expect(getState().streamingConversationIds).toContain(backgroundConversationId),
      );

      act(() => {
        useChatStore.setState({ currentConversationId: foregroundConversationId });
        getState().stopStreaming();
      });

      expect(backgroundSignal?.aborted).toBe(false);
      expect(getState().streamingConversationIds).toContain(backgroundConversationId);

      act(() => {
        useChatStore.setState({ currentConversationId: backgroundConversationId });
        getState().stopStreaming();
      });
      expect(backgroundSignal?.aborted).toBe(true);
    });

    it('cancels the active managed Cloud run on the server', async () => {
      seedCloudConversation();
      useChatStore.setState({ currentConversationId: CONV_ID });
      const runId = '0190a000-0000-7000-8000-000000000099';
      const runPath = `/api/llm/v1/chat/completions/runs/${runId}`;
      mockStreamChat.mockImplementation(
        (_body, callbacks) =>
          new Promise<void>(() => {
            callbacks.onRunReference?.({ runId, runPath, lastSequence: -1 });
          }),
      );
      mockCancelMobileCloudAgentRun.mockResolvedValue({
        id: runId,
        userId: 'user-mobile-1',
        requestId: 'request-mobile-1',
        conversationId: CONV_ID,
        originSurface: 'mobile',
        workMode: 'chat',
        state: 'cancelled',
        provider: 'openai',
        model: CLOUD_MODEL,
        lastEventSequence: -1,
        cancellationRequestedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      void getState().sendMessage(CONV_ID, 'start a long task', CLOUD_MODEL);
      await waitFor(() => expect(mockStreamChat).toHaveBeenCalledTimes(1));

      act(() => {
        getState().stopStreaming();
      });

      await waitFor(() => expect(mockCancelMobileCloudAgentRun).toHaveBeenCalledWith(runId));
    });

    it('sets isStreaming=false when stopStreaming is called', async () => {
      mockStreamChat.mockImplementation(() => new Promise<void>(() => {}));

      act(() => {
        useChatStore.setState({ currentConversationId: CONV_ID, isStreaming: true });
        getState().sendMessage(CONV_ID, 'hi', CLOUD_MODEL);
      });

      await act(async () => {
        getState().stopStreaming();
      });

      expect(getState().isStreaming).toBe(false);
    });

    it('clears streamingContent when stopStreaming is called', async () => {
      mockStreamChat.mockImplementation(() => new Promise<void>(() => {}));

      act(() => {
        useChatStore.setState({
          currentConversationId: CONV_ID,
          isStreaming: true,
          streamingContent: 'partial content',
        });
        getState().sendMessage(CONV_ID, 'hi', CLOUD_MODEL);
      });

      await act(async () => {
        getState().stopStreaming();
      });

      expect(getState().streamingContent).toBe('');
    });

    it('marks streaming messages as not-streaming when stop is called', async () => {
      useChatStore.setState({
        currentConversationId: CONV_ID,
        isStreaming: true,
        messages: {
          [CONV_ID]: [
            {
              id: 'msg-1',
              conversationId: CONV_ID,
              role: 'assistant',
              content: 'partial',
              createdAt: new Date().toISOString(),
              isStreaming: true,
            },
          ],
        },
      });

      mockStreamChat.mockImplementation(() => new Promise<void>(() => {}));

      await act(async () => {
        getState().stopStreaming();
      });

      const msgs = getState().messages[CONV_ID] ?? [];
      expect(msgs.every((m) => !m.isStreaming)).toBe(true);
    });
  });
});

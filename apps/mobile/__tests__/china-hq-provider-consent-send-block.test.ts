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

import {
  ChineseHqProviderNotOptedInError,
  chineseHqProviderDisplayName,
} from '@agiworkforce/compliance';
import { streamChat, type StreamCallbacks } from '../services/streaming';
import { useChatExecutionStore } from '../stores/chat/chatExecutionStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';
import { useTierStore } from '../src/features/billing/store';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import { providerConsentErrorMessage } from '../src/features/chat/utils/providerConsentRecovery';

const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;

const CONV_ID = '0190a000-0000-7000-8000-0000000000c1';
const BLOCKED_PROVIDER = 'deepseek';
const ENTITLED_TIER = 'max';
const GENERIC_ERROR = 'Something went wrong. Please try again.';

function cloudModelForProvider(provider: string): string {
  return requireMobileCloudModel(
    (model) => model.provider === provider,
    `Mobile Cloud model served by ${provider}`,
  ).id;
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('cn-hq-consent-test-user');
  useCloudSyncStateStore.getState().reset();
  useChatCloudMessageStore.getState().clearCloudData();
  useChatMessageStore.setState({ conversations: [], messages: {} });
  useChatExecutionStore.setState({ error: null, paywallError: null, providerConsentError: null });
  useChatAppModeStore.getState().setAppMode('local');
  useTierStore.setState({ tier: ENTITLED_TIER, billingTier: ENTITLED_TIER });
});

function seedConversation(model: string) {
  useChatCloudMessageStore.getState().addCloudConversation({
    id: CONV_ID,
    title: 'Cloud Chat',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: 0,
    pinned: false,
    model,
    executionMode: 'cloud',
  });
}

describe('blocked China-HQ send surfaces a specific, actionable error', () => {
  it('maps the consent gate rejection to providerConsentError instead of the generic message', async () => {
    const model = cloudModelForProvider(BLOCKED_PROVIDER);
    seedConversation(model);
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onError(new ChineseHqProviderNotOptedInError(BLOCKED_PROVIDER));
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'hello', model);

    const state = useChatExecutionStore.getState();
    expect(state.providerConsentError).toEqual({
      providerId: BLOCKED_PROVIDER,
      displayName: chineseHqProviderDisplayName(BLOCKED_PROVIDER),
      code: 'cn_hq_provider_not_opted_in',
    });
    expect(state.error).not.toBe(GENERIC_ERROR);
    expect(state.error).toBe(
      providerConsentErrorMessage({
        providerId: BLOCKED_PROVIDER,
        displayName: chineseHqProviderDisplayName(BLOCKED_PROVIDER),
        code: 'cn_hq_provider_not_opted_in',
      }),
    );
    expect(state.error).toContain(chineseHqProviderDisplayName(BLOCKED_PROVIDER));
    expect(state.paywallError).toBeNull();
  });

  it('writes the naming message onto the assistant bubble, not the generic one', async () => {
    const model = cloudModelForProvider(BLOCKED_PROVIDER);
    seedConversation(model);
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onError(new ChineseHqProviderNotOptedInError(BLOCKED_PROVIDER));
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'hello', model);

    const assistant = (useChatCloudMessageStore.getState().messages[CONV_ID] ?? []).find(
      (m) => m.role === 'assistant',
    );
    expect(assistant?.content).toContain(chineseHqProviderDisplayName(BLOCKED_PROVIDER));
    expect(assistant?.content).not.toBe(GENERIC_ERROR);
    expect(assistant?.isStreaming).toBe(false);
  });

  it('still falls back to the generic message for unrelated stream failures', async () => {
    const model = cloudModelForProvider(BLOCKED_PROVIDER);
    seedConversation(model);
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onError(new Error('upstream exploded'));
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'hello', model);

    const state = useChatExecutionStore.getState();
    expect(state.providerConsentError).toBeNull();
    expect(state.error).toBe(GENERIC_ERROR);
  });

  it('clears the consent error once the user opts in', async () => {
    const model = cloudModelForProvider(BLOCKED_PROVIDER);
    seedConversation(model);
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onError(new ChineseHqProviderNotOptedInError(BLOCKED_PROVIDER));
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'hello', model);
    expect(useChatExecutionStore.getState().providerConsentError).not.toBeNull();

    useChatExecutionStore.getState().clearProviderConsentError();

    expect(useChatExecutionStore.getState().providerConsentError).toBeNull();
  });
});

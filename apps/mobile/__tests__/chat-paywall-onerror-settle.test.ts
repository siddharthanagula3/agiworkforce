jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => 'test-token'),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

jest.mock('../services/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  ApiPaywallError: jest.requireActual('../services/apiErrors').ApiPaywallError,
}));

jest.mock('../services/llmGate', () => ({
  ...jest.requireActual('../services/llmGate'),
  ensureCloudSendConsent: jest.fn().mockResolvedValue(undefined),
}));

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

import { ApiPaywallError } from '../services/apiErrors';
import { streamChat, type StreamCallbacks } from '../services/streaming';
import { useChatExecutionStore } from '../stores/chat/chatExecutionStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { requireFreeMobileCloudModel } from '../test-utils/modelFixtures';
import { useTierStore } from '../src/features/billing/store';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;

const CONV_ID = '0190a000-0000-7000-8000-0000000000f2';
const PAYWALL_REASON = 'Upgrade to keep going.';

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('paywall-onerror-test-user');
  useCloudSyncStateStore.getState().reset();
  useChatCloudMessageStore.getState().clearCloudData();
  useChatMessageStore.setState({ conversations: [], messages: {} });
  useChatExecutionStore.setState({
    error: null,
    paywallError: null,
    providerConsentError: null,
    freeCapacityError: null,
  });
  useChatAppModeStore.getState().setAppMode('local');
  useTierStore.setState({ tier: 'free', billingTier: 'free' });
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

function assistantMessage() {
  return (useChatCloudMessageStore.getState().messages[CONV_ID] ?? []).find(
    (m) => m.role === 'assistant',
  );
}

describe('a paywall refusal delivered through the stream onError', () => {
  it('settles the turn as failed and stops the running tool call', async () => {
    const model = requireFreeMobileCloudModel().id;
    seedConversation(model);
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      useChatCloudMessageStore.setState((state) => ({
        messages: {
          ...state.messages,
          [CONV_ID]: (state.messages[CONV_ID] ?? []).map((m) =>
            m.role === 'assistant'
              ? { ...m, toolCalls: [{ id: 'tool-1', name: 'web_search', status: 'running' }] }
              : m,
          ),
        },
      }));
      callbacks.onError(new ApiPaywallError('model_access', 'pro', PAYWALL_REASON));
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'hello', model);

    const assistant = assistantMessage();
    expect(assistant?.isStreaming).toBe(false);
    expect(assistant?.toolCalls?.map((tool) => tool.status)).toEqual(['failed']);
    expect(useChatExecutionStore.getState().paywallError).not.toBeNull();
  });
});

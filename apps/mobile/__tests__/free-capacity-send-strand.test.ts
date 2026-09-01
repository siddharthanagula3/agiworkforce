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

import { ApiFreeCapacityError } from '../services/apiErrors';
import { FREE_CAPACITY_BUSY_MESSAGE } from '../src/features/chat/utils/freeCapacityRecovery';
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

const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;

const CONV_ID = '0190a000-0000-7000-8000-0000000000f1';
const ENTITLED_TIER = 'free';
const NOW_MS = Date.parse('2026-09-01T12:00:00.000Z');
const RETRY_AFTER_MS = 90_000;
const GENERIC_ERROR = 'Something went wrong. Please try again.';

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(NOW_MS);
  __resetCloudAccountSessionForTests();
  activateCloudAccount('free-capacity-test-user');
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
  useTierStore.setState({ tier: ENTITLED_TIER, billingTier: ENTITLED_TIER });
});

afterEach(() => {
  jest.useRealTimers();
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

async function sendAndStrand(retryAtMs: number | null) {
  const model = requireMobileCloudModel().id;
  seedConversation(model);
  mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
    callbacks.onError(new ApiFreeCapacityError(retryAtMs));
  });
  await useChatExecutionStore.getState().sendMessage(CONV_ID, 'hello', model);
}

describe('a stranded free lane reaches the send banner as a retry deadline', () => {
  it('records retry_at and names free capacity instead of the generic failure', async () => {
    await sendAndStrand(NOW_MS + RETRY_AFTER_MS);

    const state = useChatExecutionStore.getState();
    expect(state.freeCapacityError).toEqual({
      retryAtMs: NOW_MS + RETRY_AFTER_MS,
      code: 'free_capacity_unavailable',
    });
    expect(state.error).toBe(FREE_CAPACITY_BUSY_MESSAGE);
    expect(state.error).not.toBe(GENERIC_ERROR);
    expect(state.paywallError).toBeNull();
  });

  it('keeps the stored message free of a deadline the banner would outlive', async () => {
    await sendAndStrand(NOW_MS + RETRY_AFTER_MS);

    const state = useChatExecutionStore.getState();
    expect(state.error).not.toMatch(/\d+s/);
    expect(state.error).not.toContain(String(NOW_MS + RETRY_AFTER_MS));
  });

  it('settles the assistant bubble without leaking the wire code', async () => {
    await sendAndStrand(NOW_MS + RETRY_AFTER_MS);

    const assistant = (useChatCloudMessageStore.getState().messages[CONV_ID] ?? []).find(
      (m) => m.role === 'assistant',
    );
    expect(assistant?.content).toContain('Free capacity is busy');
    expect(assistant?.content).not.toContain('free_capacity_unavailable');
    expect(assistant?.isStreaming).toBe(false);
  });

  it('still names free capacity when the server sends no retry_at', async () => {
    await sendAndStrand(null);

    const state = useChatExecutionStore.getState();
    expect(state.freeCapacityError).toEqual({
      retryAtMs: null,
      code: 'free_capacity_unavailable',
    });
    expect(state.error).toBe(FREE_CAPACITY_BUSY_MESSAGE);
  });

  it('drops the deadline when the banner is dismissed so retry is live again', async () => {
    await sendAndStrand(NOW_MS + RETRY_AFTER_MS);
    expect(useChatExecutionStore.getState().freeCapacityError).not.toBeNull();

    useChatExecutionStore.getState().clearError();

    const state = useChatExecutionStore.getState();
    expect(state.freeCapacityError).toBeNull();
    expect(state.error).toBeNull();
  });

  it('leaves an unrelated stream failure on the generic message', async () => {
    const model = requireMobileCloudModel().id;
    seedConversation(model);
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onError(new Error('upstream exploded'));
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'hello', model);

    const state = useChatExecutionStore.getState();
    expect(state.freeCapacityError).toBeNull();
    expect(state.error).toBe(GENERIC_ERROR);
  });
});

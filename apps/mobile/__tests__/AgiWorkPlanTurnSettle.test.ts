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

jest.mock('../services/streaming', () => ({
  streamChat: jest.fn(),
  cancelMobileCloudAgentRun: jest.fn(),
}));
jest.mock('../services/replyReadyNotice', () => ({
  announceReplyReadyInBackground: jest.fn(),
}));
jest.mock('../services/llmGate', () => ({
  ensureCloudSendConsent: jest.fn().mockResolvedValue(undefined),
  CloudProviderConsentRequiredError: class CloudProviderConsentRequiredError extends Error {},
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

import { cancelMobileCloudAgentRun, streamChat } from '../services/streaming';
import { clearCloudExecutionState, useChatExecutionStore } from '../stores/chat/chatExecutionStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { requireFreeMobileCloudModel } from '../test-utils/modelFixtures';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;
const mockCancelRun = cancelMobileCloudAgentRun as jest.MockedFunction<
  typeof cancelMobileCloudAgentRun
>;

const CONV_ID = '0190a000-0000-7000-8000-000000000081';
const CLOUD_MODEL = requireFreeMobileCloudModel().id;
const PLAN = {
  goal: { goal: 'Compare three canal routes' },
  steps: [
    { id: 'step-1', description: 'Gather the routes', status: 'completed' },
    { id: 'step-2', description: 'Measure each route', status: 'in_progress' },
    { id: 'step-3', description: 'Write the comparison', status: 'pending' },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  clearCloudExecutionState();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('agiwork-plan-settle-user');
  useCloudSyncStateStore.getState().reset();
  useChatCloudMessageStore.getState().clearCloudData();
  useChatMessageStore.setState({ conversations: [], messages: {} });
  useChatExecutionStore.setState({ error: null, paywallError: null });
  useChatAppModeStore.getState().setAppMode('local');
  useChatCloudMessageStore.getState().addCloudConversation({
    id: CONV_ID,
    title: 'Canals',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: 0,
    pinned: false,
    model: CLOUD_MODEL,
    executionMode: 'cloud',
  });
  useChatMessageStore.getState().setCurrentConversationId(CONV_ID);
  mockCancelRun.mockReturnValue(new Promise(() => undefined));
});

function answer() {
  return (useChatCloudMessageStore.getState().messages[CONV_ID] ?? []).find(
    (message) => message.role === 'assistant',
  );
}

function planStatuses(): unknown {
  const plan = answer()?.metadata?.agiWorkPlan as Array<{ status: string }> | undefined;
  return plan?.map((step) => step.status);
}

describe('an AGI Work plan when its turn ends early', () => {
  it('marks the running step stopped when the person taps Stop', async () => {
    let signal!: AbortSignal;
    const running = new Promise<void>((resolve) => {
      mockStreamChat.mockImplementationOnce(async (_body, callbacks, turnSignal) => {
        signal = turnSignal!;
        callbacks.onDelta({ content: 'Step 2: Measure each route', x_agiwork_plan: PLAN });
        resolve();
        await new Promise<void>((settle) =>
          signal.addEventListener('abort', () => settle(), { once: true }),
        );
      });
    });
    const sent = useChatExecutionStore
      .getState()
      .sendMessage(CONV_ID, 'Compare the canal routes.', CLOUD_MODEL);
    await running;
    expect(planStatuses()).toEqual(['completed', 'in_progress', 'pending']);

    useChatExecutionStore.getState().stopStreaming();
    expect(planStatuses()).toEqual(['completed', 'cancelled', 'pending']);

    await sent;
    expect(answer()?.isStreaming).toBe(false);
    expect(planStatuses()).toEqual(['completed', 'cancelled', 'pending']);
  });

  it('marks the running step failed when the connection fails', async () => {
    mockStreamChat.mockImplementationOnce(async (_body, callbacks) => {
      callbacks.onDelta({ content: 'Step 2: Measure each route', x_agiwork_plan: PLAN });
      throw new Error('socket closed');
    });

    await useChatExecutionStore
      .getState()
      .sendMessage(CONV_ID, 'Compare the canal routes.', CLOUD_MODEL);

    expect(answer()?.isStreaming).toBe(false);
    expect(planStatuses()).toEqual(['completed', 'failed', 'pending']);
  });

  it('leaves a plan with no running step as the server sent it', async () => {
    const finished = {
      ...PLAN,
      steps: PLAN.steps.map((step) => ({ ...step, status: 'completed' })),
    };
    mockStreamChat.mockImplementationOnce(async (_body, callbacks) => {
      callbacks.onDelta({ content: 'All steps are done.', x_agiwork_plan: finished });
      throw new Error('socket closed');
    });

    await useChatExecutionStore
      .getState()
      .sendMessage(CONV_ID, 'Compare the canal routes.', CLOUD_MODEL);

    expect(planStatuses()).toEqual(['completed', 'completed', 'completed']);
  });
});

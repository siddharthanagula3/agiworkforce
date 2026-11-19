import { AGENT_EVENT_SCHEMA_VERSION } from '@agiworkforce/types';

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

jest.mock('../services/streaming', () => ({
  streamChat: jest.fn(),
  streamToolApprovalResume: jest.fn(),
  streamToolInputResume: jest.fn(),
  streamDeviceStepResume: jest.fn(),
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

const mockRunPhoneDeviceStep = jest.fn();
jest.mock('../src/features/integrations/services/phoneDeviceSteps', () => ({
  ...jest.requireActual('../src/features/integrations/services/phoneDeviceSteps'),
  runPhoneDeviceStep: (...args: unknown[]) => mockRunPhoneDeviceStep(...args),
}));

import {
  streamChat,
  streamDeviceStepResume,
  type StreamCallbacks,
  type StreamDelta,
} from '../services/streaming';
import { ApiHttpError } from '../services/apiErrors';
import {
  useChatExecutionStore,
  isApprovalTurnLive,
  __resetPendingApprovalTurnsForTests,
} from '../stores/chat/chatExecutionStore';
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
const mockResume = streamDeviceStepResume as jest.MockedFunction<typeof streamDeviceStepResume>;

const CONV_ID = '0190a000-0000-7000-8000-000000000031';
const RUN_ID = '0190a000-0000-7000-8000-000000000032';
const CALL_ID = 'call_device_1';
const CLOUD_MODEL = requireFreeMobileCloudModel().id;
const RESULT_TEXT = 'Standup at 9:30';

const deviceStepDelta: StreamDelta = {
  x_agent_event: {
    schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
    sessionId: 'session-1',
    turnId: 'turn-1',
    sequence: 0,
    emittedAtMs: 0,
    event: {
      type: 'device-step-requested',
      toolCallId: CALL_ID,
      toolName: 'device_calendar_events',
      deviceId: 'this-phone',
      deviceName: 'Phone',
      summary: 'Read your calendar',
      input: { start: '2030-01-02T00:00:00', end: '2030-01-03T00:00:00' },
      expiresAtMs: 4_000_000_000_000,
    },
  },
} as unknown as StreamDelta;

function pauseOnDeviceStep() {
  mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
    callbacks.onRunReference?.({
      runId: RUN_ID,
      runPath: `/api/llm/v1/chat/completions/runs/${RUN_ID}`,
      lastSequence: -1,
    });
    callbacks.onDelta(deviceStepDelta);
    callbacks.onDone();
  });
}

function failDelivery() {
  mockResume.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
    callbacks.onError(new ApiHttpError('Agent continuation is temporarily unavailable', 503));
  });
}

function acceptDelivery() {
  mockResume.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
    callbacks.onDelta({ content: 'Your standup is at 9:30.' });
    callbacks.onDone();
  });
}

async function until(condition: () => boolean) {
  for (let attempt = 0; attempt < 100 && !condition(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  expect(condition()).toBe(true);
}

function messages() {
  return useChatCloudMessageStore.getState().messages[CONV_ID] ?? [];
}

function assistant() {
  return messages().find((m) => m.role === 'assistant')!;
}

function user() {
  return messages().find((m) => m.role === 'user')!;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResume.mockReset();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('device-result-delivery-user');
  __resetPendingApprovalTurnsForTests();
  useCloudSyncStateStore.getState().reset();
  useChatCloudMessageStore.getState().clearCloudData();
  useChatMessageStore.setState({ conversations: [], messages: {} });
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
  mockRunPhoneDeviceStep.mockResolvedValue({ content: RESULT_TEXT, isError: false });
  pauseOnDeviceStep();
});

async function sendAndFailDelivery() {
  failDelivery();
  await useChatExecutionStore.getState().sendMessage(CONV_ID, "what's on my calendar", CLOUD_MODEL);
  await until(() => mockResume.mock.calls.length === 1);
  await until(() => !useChatExecutionStore.getState().isStreaming);
}

describe('completed phone result delivery', () => {
  it('keeps the finished result and submits it on Retry instead of starting a new prompt', async () => {
    await sendAndFailDelivery();

    expect(assistant().toolCalls?.find((t) => t.toolCallId === CALL_ID)).toMatchObject({
      status: 'succeeded',
      output: RESULT_TEXT,
    });
    expect(isApprovalTurnLive(assistant().id)).toBe(true);
    expect(mockResume).toHaveBeenCalledTimes(1);

    acceptDelivery();
    useChatExecutionStore.getState().retryMessage(CONV_ID, user().id);
    await until(() => mockResume.mock.calls.length === 2);

    expect(mockResume.mock.calls[1]![0]).toMatchObject({
      run_id: RUN_ID,
      device_id: 'this-phone',
      device_results: [{ tool_call_id: CALL_ID, content: RESULT_TEXT, is_error: false }],
    });
    expect(mockStreamChat).toHaveBeenCalledTimes(1);
    expect(mockRunPhoneDeviceStep).toHaveBeenCalledTimes(1);
  });

  it('does not resubmit on its own after a failed delivery', async () => {
    await sendAndFailDelivery();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockResume).toHaveBeenCalledTimes(1);
  });

  it('restores the delivery after the in-memory turn is lost', async () => {
    await sendAndFailDelivery();
    const assistantId = assistant().id;
    __resetPendingApprovalTurnsForTests();

    expect(isApprovalTurnLive(assistantId)).toBe(true);

    acceptDelivery();
    useChatExecutionStore.getState().retryMessage(CONV_ID, user().id);
    await until(() => mockResume.mock.calls.length === 2);

    expect(mockResume.mock.calls[1]![0]).toMatchObject({
      run_id: RUN_ID,
      device_results: [{ tool_call_id: CALL_ID, content: RESULT_TEXT, is_error: false }],
    });
    expect(mockStreamChat).toHaveBeenCalledTimes(1);
  });

  it('drops the retained result when the server says the run is gone', async () => {
    mockResume.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onError(new ApiHttpError('Run not found', 404));
    });
    await useChatExecutionStore
      .getState()
      .sendMessage(CONV_ID, "what's on my calendar", CLOUD_MODEL);
    await until(() => mockResume.mock.calls.length === 1);
    await until(() => !useChatExecutionStore.getState().isStreaming);

    expect(isApprovalTurnLive(assistant().id)).toBe(false);
  });
});

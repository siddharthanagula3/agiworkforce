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
  cancelMobileCloudAgentRun: jest.fn().mockResolvedValue(undefined),
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
  streamToolApprovalResume,
  streamToolInputResume,
  type StreamCallbacks,
  type StreamDelta,
} from '../services/streaming';
import {
  useChatExecutionStore,
  isApprovalTurnLive,
  clearCloudExecutionState,
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
const mockApprovalResume = streamToolApprovalResume as jest.MockedFunction<
  typeof streamToolApprovalResume
>;
const mockInputResume = streamToolInputResume as jest.MockedFunction<typeof streamToolInputResume>;
const mockDeviceResume = streamDeviceStepResume as jest.MockedFunction<
  typeof streamDeviceStepResume
>;

const CONV_ID = '0190a000-0000-7000-8000-000000000041';
const RUN_ID = '0190a000-0000-7000-8000-000000000042';
const CLOUD_MODEL = requireFreeMobileCloudModel().id;

beforeEach(() => {
  jest.clearAllMocks();
  mockStreamChat.mockReset();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('paused-turn-superseded-user');
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
});

let releaseHangingTurn: (() => void) | undefined;

afterEach(() => {
  releaseHangingTurn?.();
  releaseHangingTurn = undefined;
  clearCloudExecutionState();
});

function assistants() {
  return (useChatCloudMessageStore.getState().messages[CONV_ID] ?? []).filter(
    (m) => m.role === 'assistant',
  );
}

async function until(condition: () => boolean) {
  for (let attempt = 0; attempt < 100 && !condition(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  expect(condition()).toBe(true);
}

async function pauseFirstTurn(delta: StreamDelta, lastSequence = -1): Promise<string> {
  mockStreamChat.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
    callbacks.onRunReference?.({
      runId: RUN_ID,
      runPath: `/api/llm/v1/chat/completions/runs/${RUN_ID}`,
      lastSequence,
    });
    callbacks.onDelta(delta);
    callbacks.onDone();
  });
  await useChatExecutionStore.getState().sendMessage(CONV_ID, 'first question', CLOUD_MODEL);
  return assistants()[0]!.id;
}

interface NewerTurn {
  signal: () => AbortSignal | undefined;
  finish: () => Promise<void>;
}

async function startNewerTurn(): Promise<NewerTurn> {
  let signal: AbortSignal | undefined;
  let release!: () => void;
  let started!: () => void;
  const running = new Promise<void>((resolve) => {
    started = resolve;
  });
  mockStreamChat.mockImplementationOnce(async (_body, callbacks: StreamCallbacks, abort) => {
    signal = abort;
    callbacks.onDelta({ content: 'The newer reply ' });
    started();
    await new Promise<void>((resolve) => {
      release = resolve;
      releaseHangingTurn = resolve;
    });
    if (abort?.aborted) return;
    callbacks.onDelta({ content: 'is complete.' });
    callbacks.onDone();
  });
  const sending = useChatExecutionStore
    .getState()
    .sendMessage(CONV_ID, 'second question', CLOUD_MODEL);
  await running;
  return {
    signal: () => signal,
    finish: async () => {
      release();
      await sending;
    },
  };
}

const APPROVAL_REQUEST: StreamDelta = {
  x_tool_approval_request: {
    tool_call_id: 'call_comment',
    name: 'mcp__github__create_comment',
    args: { body: 'ship it' },
  },
};

const INPUT_REQUEST: StreamDelta = {
  x_tool_input_request: {
    tool_call_id: 'call_input',
    name: 'mcp__github__create_issue',
    connector_id: 'github',
    input_requests: {
      confirm_repo: {
        method: 'elicitation/create',
        params: {
          message: 'Which repository should I use?',
          requestedSchema: {
            type: 'object',
            properties: { repo: { type: 'string', title: 'Repository' } },
            required: ['repo'],
          },
        },
      },
    },
    round: 0,
  },
};

const INPUT_ANSWER = [
  {
    toolCallId: 'call_input',
    responses: { confirm_repo: { action: 'accept', content: { repo: 'acme/app' } } },
  },
];

const DEVICE_STEP_REQUEST = {
  x_agent_event: {
    schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
    sessionId: 'session-1',
    turnId: 'turn-1',
    sequence: 0,
    emittedAtMs: 0,
    event: {
      type: 'device-step-requested',
      toolCallId: 'call_device',
      toolName: 'device_calendar_events',
      deviceId: 'this-phone',
      deviceName: 'Phone',
      summary: 'Read your calendar',
      input: { start: '2030-01-02T00:00:00', end: '2030-01-03T00:00:00' },
      expiresAtMs: 4_000_000_000_000,
    },
  },
} as unknown as StreamDelta;

function agentEvent(sequence: number, event: Record<string, unknown>) {
  return {
    schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
    sessionId: 'session-1',
    turnId: 'turn-1',
    sequence,
    emittedAtMs: 1_000 + sequence,
    event,
  } as unknown as StreamDelta['x_agent_event'];
}

const COMMENT_POSTED: StreamDelta = {
  x_tool_result: {
    tool_call_id: 'call_comment',
    name: 'mcp__github__create_comment',
    content: 'Comment posted',
    is_error: false,
  },
};

function hangUntilStopped(signal: AbortSignal | undefined) {
  return new Promise<void>((resolve) => signal?.addEventListener('abort', () => resolve()));
}

async function sendFinishedTurn() {
  mockStreamChat.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
    callbacks.onDelta({ content: 'A later answer.' });
    callbacks.onDone();
  });
  await useChatExecutionStore.getState().sendMessage(CONV_ID, 'later question', CLOUD_MODEL);
}

async function expectNewerTurnUntouched(newer: NewerTurn) {
  expect(newer.signal()?.aborted).toBe(false);
  expect(useChatExecutionStore.getState().streamingConversationIds).toContain(CONV_ID);
  await newer.finish();
  expect(assistants()[1]).toMatchObject({
    content: 'The newer reply is complete.',
    isStreaming: false,
  });
}

describe('a paused request after a newer turn has started', () => {
  it('ends an older approval as expired and never cancels the reply being written', async () => {
    const olderId = await pauseFirstTurn(APPROVAL_REQUEST);
    expect(isApprovalTurnLive(olderId)).toBe(true);

    const newer = await startNewerTurn();

    expect(isApprovalTurnLive(olderId)).toBe(false);
    expect(assistants()[0]!.toolCalls?.[0]).toMatchObject({
      toolCallId: 'call_comment',
      status: 'awaiting-approval',
      requiresApproval: false,
    });

    await useChatExecutionStore
      .getState()
      .resolveToolApproval(CONV_ID, olderId, 'call_comment', 'approved');

    expect(mockApprovalResume).not.toHaveBeenCalled();
    expect(assistants()[0]!.toolCalls?.[0]?.approvalDecision).toBeUndefined();
    await expectNewerTurnUntouched(newer);
  });

  it('expires an older approval kept only in the stored copy when a newer turn arrives', async () => {
    const olderId = await pauseFirstTurn(APPROVAL_REQUEST);
    __resetPendingApprovalTurnsForTests();
    useChatCloudMessageStore.setState((state) => ({
      messages: {
        ...state.messages,
        [CONV_ID]: [
          ...(state.messages[CONV_ID] ?? []),
          {
            id: 'user-from-another-device',
            conversationId: CONV_ID,
            role: 'user',
            content: 'asked on the web',
            createdAt: new Date().toISOString(),
          },
        ],
      },
    }));

    await useChatExecutionStore
      .getState()
      .resolveToolApproval(CONV_ID, olderId, 'call_comment', 'approved');

    expect(mockApprovalResume).not.toHaveBeenCalled();
    expect(isApprovalTurnLive(olderId)).toBe(false);
    expect(assistants()[0]!.toolCalls?.[0]).toMatchObject({ requiresApproval: false });
  });

  it('closes an older tool question as no longer active instead of answering it', async () => {
    const olderId = await pauseFirstTurn(INPUT_REQUEST);
    expect(assistants()[0]!.pendingToolInput).toBeDefined();

    const newer = await startNewerTurn();

    expect(assistants()[0]!.pendingToolInput).toBeUndefined();
    expect(assistants()[0]!.metadata?.toolInputOutcome).toBe('expired');

    await useChatExecutionStore.getState().answerToolInput(CONV_ID, olderId, INPUT_ANSWER);

    expect(mockInputResume).not.toHaveBeenCalled();
    await expectNewerTurnUntouched(newer);
  });

  it('keeps an unanswered older tool question on its answer so the closed form can still be read', async () => {
    await pauseFirstTurn(INPUT_REQUEST);
    const request = assistants()[0]!.pendingToolInput;
    expect(request).toBeDefined();

    const newer = await startNewerTurn();

    expect(assistants()[0]!.pendingToolInput).toBeUndefined();
    expect(assistants()[0]!.answeredToolInput).toEqual(request);
    expect(assistants()[0]!.metadata?.toolInputOutcome).toBe('expired');
    await expectNewerTurnUntouched(newer);
  });

  it('does not deliver an older phone step result into a reply being written', async () => {
    let finishStep!: (outcome: { content: string; isError: boolean }) => void;
    mockRunPhoneDeviceStep.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishStep = resolve;
        }),
    );
    await pauseFirstTurn(DEVICE_STEP_REQUEST);
    await until(() => mockRunPhoneDeviceStep.mock.calls.length === 1);

    const newer = await startNewerTurn();
    finishStep({ content: 'Standup at 9:30', isError: false });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockDeviceResume).not.toHaveBeenCalled();
    expect(assistants()[0]!.metadata?.phoneDeviceSteps).toBeUndefined();
    expect(
      assistants()[0]!.toolCalls?.find((tool) => tool.toolCallId === 'call_device'),
    ).toMatchObject({ status: 'succeeded', output: 'Standup at 9:30' });
    await expectNewerTurnUntouched(newer);
  });
});

describe('a resumed turn that was stopped, then followed by a new message', () => {
  it('keeps the result of an allowed tool that already ran', async () => {
    const olderId = await pauseFirstTurn(APPROVAL_REQUEST);
    useChatMessageStore.getState().setCurrentConversationId(CONV_ID);
    let ran!: () => void;
    const toolRan = new Promise<void>((resolve) => {
      ran = resolve;
    });
    mockApprovalResume.mockImplementationOnce(async (_body, callbacks: StreamCallbacks, signal) => {
      callbacks.onDelta(COMMENT_POSTED);
      callbacks.onDelta({ content: 'I posted the comment' });
      ran();
      await hangUntilStopped(signal);
    });

    const allowing = useChatExecutionStore
      .getState()
      .resolveToolApproval(CONV_ID, olderId, 'call_comment', 'approved');
    await toolRan;
    useChatExecutionStore.getState().stopStreaming();
    await allowing;
    await sendFinishedTurn();

    expect(isApprovalTurnLive(olderId)).toBe(false);
    expect(assistants()[0]!.toolCalls?.[0]).toMatchObject({
      toolCallId: 'call_comment',
      status: 'succeeded',
      output: 'Comment posted',
      approvalDecision: 'approved',
      requiresApproval: false,
    });
    expect(assistants()[1]).toMatchObject({ content: 'A later answer.', isStreaming: false });
  });

  it('keeps a phone step result whose delivery was stopped', async () => {
    mockRunPhoneDeviceStep.mockResolvedValueOnce({ content: 'Standup at 9:30', isError: false });
    let delivering!: () => void;
    const delivery = new Promise<void>((resolve) => {
      delivering = resolve;
    });
    mockDeviceResume.mockImplementationOnce(async (_body, _callbacks: StreamCallbacks, signal) => {
      delivering();
      await hangUntilStopped(signal);
    });
    const olderId = await pauseFirstTurn(DEVICE_STEP_REQUEST);
    useChatMessageStore.getState().setCurrentConversationId(CONV_ID);
    await delivery;
    useChatExecutionStore.getState().stopStreaming();
    await until(() => !useChatExecutionStore.getState().streamingConversationIds.includes(CONV_ID));
    await new Promise((resolve) => setTimeout(resolve, 0));

    await sendFinishedTurn();

    expect(mockDeviceResume).toHaveBeenCalledTimes(1);
    expect(isApprovalTurnLive(olderId)).toBe(false);
    expect(
      assistants()[0]!.toolCalls?.find((tool) => tool.toolCallId === 'call_device'),
    ).toMatchObject({ status: 'succeeded', output: 'Standup at 9:30' });
  });
});

describe('an allowed tool whose resume outlives one connection', () => {
  it('follows from the paused answer and finishes with the call still allowed', async () => {
    const olderId = await pauseFirstTurn(APPROVAL_REQUEST, 6);
    mockApprovalResume.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ content: 'Posted. ' });
      callbacks.onDelta({
        content: 'Posted. ',
        x_agent_event: agentEvent(7, { type: 'text-delta', delta: 'Posted. ' }),
        durableReplay: true,
      });
      callbacks.onDelta({
        x_agent_event: agentEvent(8, {
          type: 'tool-execution-end',
          toolCallId: 'call_comment',
          name: 'mcp__github__create_comment',
          output: 'Comment posted',
          isError: false,
          elapsedMs: 200,
        }),
        durableReplay: true,
      });
      callbacks.onDelta({
        content: 'Done.',
        x_agent_event: agentEvent(9, { type: 'text-delta', delta: 'Done.' }),
        durableReplay: true,
      });
      callbacks.onDone();
    });

    await useChatExecutionStore
      .getState()
      .resolveToolApproval(CONV_ID, olderId, 'call_comment', 'approved');

    expect(mockApprovalResume.mock.calls[0]![3]).toEqual({ afterSequence: 6 });
    expect(assistants()[0]).toMatchObject({ content: 'Posted. Done.', isStreaming: false });
    expect(assistants()[0]!.toolCalls?.[0]).toMatchObject({
      toolCallId: 'call_comment',
      approvalDecision: 'approved',
      requiresApproval: false,
    });
    expect(assistants()[0]!.toolCalls?.[0]?.status).not.toBe('awaiting-approval');
    expect(useChatExecutionStore.getState().error).toBeNull();
    expect(isApprovalTurnLive(olderId)).toBe(false);
  });
});

describe('stopping an answer to a tool question', () => {
  it('closes the form as no longer active when stopped before the first update', async () => {
    const olderId = await pauseFirstTurn(INPUT_REQUEST);
    useChatMessageStore.getState().setCurrentConversationId(CONV_ID);
    let sent!: () => void;
    const sending = new Promise<void>((resolve) => {
      sent = resolve;
    });
    mockInputResume.mockImplementationOnce(async (_body, _callbacks: StreamCallbacks, signal) => {
      sent();
      await new Promise<void>((resolve) => signal?.addEventListener('abort', () => resolve()));
    });

    const answering = useChatExecutionStore
      .getState()
      .answerToolInput(CONV_ID, olderId, INPUT_ANSWER);
    await sending;
    useChatExecutionStore.getState().stopStreaming();
    await answering;

    expect(assistants()[0]!.pendingToolInput).toBeUndefined();
    expect(assistants()[0]!.metadata?.toolInputOutcome).toBe('expired');
    expect(assistants()[0]!.answeredToolInput?.runId).toBe(RUN_ID);
    expect(isApprovalTurnLive(olderId)).toBe(false);
  });
});

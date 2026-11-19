import { AGENT_EVENT_SCHEMA_VERSION } from '@agiworkforce/types';
import {
  MANAGED_CLOUD_AGENT_RUN_ID_HEADER,
  MANAGED_CLOUD_AGENT_RUN_URL_HEADER,
  MANAGED_CLOUD_TOOL_LOOP_DURABLE,
  MANAGED_CLOUD_TOOL_LOOP_HEADER,
  TOOL_APPROVAL_RESUME_PATH,
  TOOL_INPUT_RESUME_PATH,
  DEVICE_STEP_RESUME_PATH,
  managedCloudAgentRunPath,
} from '@agiworkforce/cloud-contracts';
import type { StreamDelta } from '../services/streaming';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';

const MODEL = requireMobileCloudModel();
const RUN_ID = '0190a000-0000-7000-8000-0000000000e2';
const guardedFetchMock = jest.fn();
const tokenMock = jest.fn();
const deviceHeadersMock = jest.fn();

function load() {
  jest.resetModules();
  guardedFetchMock.mockReset();
  tokenMock.mockReset().mockResolvedValue('account-a-token');
  deviceHeadersMock.mockReset().mockResolvedValue({});
  jest.doMock('@/lib/constants', () => ({
    API_URL: 'https://api.agi.test',
    TIMEOUTS: { STREAMING: 60_000, STREAM_STALL: 30_000 },
  }));
  jest.doMock('@/lib/egressGuard', () => ({ guardedFetch: guardedFetchMock }));
  jest.doMock('../services/authSession', () => ({ getAuthToken: tokenMock }));
  jest.doMock('../services/llmGate', () => ({
    ensureCloudSendConsent: jest.fn().mockResolvedValue(undefined),
    ensureLlmGateOpen: jest.fn(),
  }));
  jest.doMock('../services/remoteChatGate', () => ({ assertRemoteChatAllowed: jest.fn() }));
  jest.doMock('@/src/features/waitlist/store', () => ({
    useWaitlistStore: { getState: () => ({ cloudUnlocked: true }) },
  }));
  jest.doMock('@/src/features/integrations/services/phoneDeviceHost', () => ({
    phoneDeviceHostHeaders: deviceHeadersMock,
  }));
  jest.doMock('../services/api', () => ({
    ApiPaywallError: class ApiPaywallError extends Error {},
    recoverStreamSession: jest.fn().mockResolvedValue(true),
    streamAuthRefusal: jest.fn().mockReturnValue(null),
  }));

  const accounts = jest.requireActual<
    typeof import('../src/features/auth/services/cloudAccountSession')
  >('../src/features/auth/services/cloudAccountSession');
  accounts.activateCloudAccount('stream-account-a');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../services/streaming') as typeof import('../services/streaming');
}

function headers(values: Record<string, string>) {
  const lower = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return { get: (name: string) => lower[name.toLowerCase()] ?? null };
}

function frame(delta: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ choices: [{ index: 0, delta }] })}\n\n`;
}

function textEvent(sequence: number, delta: string) {
  return {
    schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
    sessionId: 'session-1',
    turnId: 'turn-1',
    sequence,
    emittedAtMs: 1000 + sequence,
    event: { type: 'text-delta', delta },
  };
}

const RUN_HEADERS = {
  [MANAGED_CLOUD_AGENT_RUN_ID_HEADER]: RUN_ID,
  [MANAGED_CLOUD_AGENT_RUN_URL_HEADER]: managedCloudAgentRunPath(RUN_ID),
  [MANAGED_CLOUD_TOOL_LOOP_HEADER]: MANAGED_CLOUD_TOOL_LOOP_DURABLE,
};

function resumeResponse(runHeaders: boolean, ending: 'detached' | 'cut') {
  return {
    ok: true,
    status: 200,
    body: null,
    headers: headers(runHeaders ? RUN_HEADERS : {}),
    text: async () =>
      frame({ content: 'The report ', x_agent_event: textEvent(4, 'The report ') }) +
      (ending === 'detached'
        ? frame({ x_run_detached: { run_id: RUN_ID, reason: 'function_budget' } }) +
          'data: [DONE]\n\n'
        : ''),
  } as unknown as Response;
}

function journalPage() {
  return {
    ok: true,
    status: 200,
    headers: headers({}),
    json: async () => ({
      run: {
        id: RUN_ID,
        userId: 'stream-account-a',
        requestId: 'request-1',
        conversationId: 'conversation-1',
        originSurface: 'mobile',
        workMode: 'chat',
        state: 'completed',
        provider: MODEL.provider,
        model: MODEL.id,
        lastEventSequence: 5,
        cancellationRequestedAt: null,
        completedAt: '2026-11-15T12:00:00.000Z',
        createdAt: '2026-11-15T12:00:00.000Z',
        updatedAt: '2026-11-15T12:00:00.000Z',
      },
      nextAfterSequence: 5,
      events: [textEvent(4, 'The report '), textEvent(5, 'is ready.')],
    }),
  } as unknown as Response;
}

function callbacks() {
  return {
    onDelta: jest.fn<void, [StreamDelta]>(),
    onDone: jest.fn(),
    onError: jest.fn(),
    onReconnecting: jest.fn(),
    onRunReference: jest.fn(),
  };
}

type Services = ReturnType<typeof load>;
type Resume = (
  services: Services,
  calls: ReturnType<typeof callbacks>,
  options?: { afterSequence?: number },
) => Promise<void>;

const RESUMES: Array<[string, string, Resume]> = [
  [
    'an approval',
    TOOL_APPROVAL_RESUME_PATH,
    (services, calls, options) =>
      services.streamToolApprovalResume(
        {
          run_id: RUN_ID,
          operationId: RUN_ID,
          tool_approvals: [{ tool_call_id: 'call-1', decision: 'approved' }],
        },
        calls,
        undefined,
        options,
      ),
  ],
  [
    'an answer to a tool question',
    TOOL_INPUT_RESUME_PATH,
    (services, calls, options) =>
      services.streamToolInputResume(
        {
          run_id: RUN_ID,
          operationId: RUN_ID,
          tool_inputs: [{ tool_call_id: 'call-1', input_responses: { city: 'Oslo' } }],
        },
        calls,
        undefined,
        options,
      ),
  ],
  [
    'a phone step result',
    DEVICE_STEP_RESUME_PATH,
    (services, calls, options) =>
      services.streamDeviceStepResume(
        {
          run_id: RUN_ID,
          operationId: RUN_ID,
          device_id: 'device-1',
          device_results: [{ tool_call_id: 'call-1', content: 'done', is_error: false }],
        },
        calls,
        undefined,
        options,
      ),
  ],
];

describe.each(RESUMES)('%s that outlives one connection', (_label, path, resume) => {
  it('follows the run journal after the detach frame and finishes in the same answer', async () => {
    const services = load();
    guardedFetchMock
      .mockResolvedValueOnce(resumeResponse(true, 'detached'))
      .mockResolvedValueOnce(journalPage());
    const calls = callbacks();

    await resume(services, calls);

    expect(String(guardedFetchMock.mock.calls[0]![0])).toContain(path);
    expect(guardedFetchMock).toHaveBeenCalledTimes(2);
    expect(String(guardedFetchMock.mock.calls[1]![0])).toContain(
      `${managedCloudAgentRunPath(RUN_ID)}?after=4`,
    );
    const text = calls.onDelta.mock.calls.map(([delta]) => delta.content ?? '').join('');
    expect(text).toBe('The report is ready.');
    expect(calls.onDelta.mock.calls.at(-1)![0]).toMatchObject({ durableReplay: true });
    expect(calls.onDone).toHaveBeenCalledTimes(1);
    expect(calls.onError).not.toHaveBeenCalled();
  });

  it('follows from where the paused answer stopped when the cut comes before any event', async () => {
    const services = load();
    guardedFetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: null,
        headers: headers(RUN_HEADERS),
        text: async () =>
          frame({ x_run_detached: { run_id: RUN_ID, reason: 'function_budget' } }) +
          'data: [DONE]\n\n',
      } as unknown as Response)
      .mockResolvedValueOnce(journalPage());
    const calls = callbacks();

    await resume(services, calls, { afterSequence: 3 });

    expect(String(guardedFetchMock.mock.calls[1]![0])).toContain(
      `${managedCloudAgentRunPath(RUN_ID)}?after=3`,
    );
    expect(calls.onDone).toHaveBeenCalledTimes(1);
    expect(calls.onError).not.toHaveBeenCalled();
  });

  it('says the answer ended early when there is no run to follow', async () => {
    const services = load();
    guardedFetchMock.mockResolvedValueOnce(resumeResponse(false, 'detached'));
    const calls = callbacks();

    await resume(services, calls);

    expect(guardedFetchMock).toHaveBeenCalledTimes(1);
    expect(calls.onDone).not.toHaveBeenCalled();
    expect(calls.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'The response ended before completion. Please retry.' }),
    );
  });

  it('says the answer ended early when the stream stops without an ending', async () => {
    const services = load();
    guardedFetchMock.mockResolvedValueOnce(resumeResponse(true, 'cut'));
    const calls = callbacks();

    await resume(services, calls);

    expect(guardedFetchMock).toHaveBeenCalledTimes(1);
    expect(calls.onDone).not.toHaveBeenCalled();
    expect(calls.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'The response ended before completion. Please retry.' }),
    );
  });
});

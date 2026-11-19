import { act, renderHook } from '@testing-library/react-native';
import { applyAgentActivityEvent, type AgentActivityState } from '@agiworkforce/client-runtime';
import { AGENT_EVENT_SCHEMA_VERSION } from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';

const mockApiFetch = jest.fn();
jest.mock('@/services/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import {
  IN_FLIGHT_TURN_RECHECK_MS,
  lastAnswerLiveRun,
  shouldAskWhetherTurnIsRunning,
  useInFlightTurnRecovery,
} from '@/src/features/chat/inFlightTurnRecovery';
import { hasUnfinishedRun, settledTurnActivity } from '@/src/features/chat/utils/agentActivity';

function replay(events: AgentEventEnvelope['event'][]): AgentActivityState {
  let state: AgentActivityState | undefined;
  events.forEach((event, sequence) => {
    state = applyAgentActivityEvent(state, {
      schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
      sessionId: 'session-1',
      turnId: 'turn-1',
      sequence,
      emittedAtMs: 1_000 + sequence * 500,
      event,
    } as AgentEventEnvelope);
  });
  return state!;
}

const started: AgentEventEnvelope['event'][] = [
  { type: 'lifecycle', phase: 'started' },
  {
    type: 'tool-execution-start',
    toolCallId: 'call_search',
    name: 'web_search',
    category: 'web-search',
    summary: 'Search the web',
    input: { query: 'tides' },
  },
];
const unfinished = replay(started);
const finished = replay([
  ...started,
  {
    type: 'tool-execution-end',
    toolCallId: 'call_search',
    name: 'web_search',
    output: 'results',
    isError: false,
    elapsedMs: 20,
  },
  { type: 'stop', reason: 'end-turn' },
]);
const waitingOnApproval = replay([
  { type: 'lifecycle', phase: 'started' },
  {
    type: 'approval-requested',
    approvalId: 'call_0',
    toolCallId: 'call_0',
    name: 'execute_code',
    category: 'code-execution',
    summary: 'Run code',
    input: { language: 'python', code: 'print(1)' },
  },
]);

const question = { role: 'user' as const, isStreaming: false };
function answerWith(agentActivity: AgentActivityState | undefined) {
  return {
    role: 'assistant' as const,
    isStreaming: false,
    content: 'Tides rise',
    metadata: agentActivity ? { agentActivity } : {},
  };
}

function runsResponse(runs: unknown[]) {
  return { ok: true, json: async () => ({ runs }) };
}

describe('settling a turn whose run is not live', () => {
  const input = { streaming: false, hasText: true };

  it('shows a run that ended as failed at the time it was last updated', () => {
    const settled = settledTurnActivity(unfinished, { ...input, liveRun: 'ended' });

    expect(settled.status).toBe('failed');
    expect(settled.completedAtMs).toBe(unfinished.updatedAtMs);
    const tool = settled.entries.find((entry) => entry.kind === 'tool');
    expect(tool && tool.kind === 'tool' ? tool.status : undefined).toBe('failed');
  });

  it('shows a run that ended on an answer saved as stopped as stopped, not failed', () => {
    for (const finishReason of ['stopped', 'cancelled', 'canceled']) {
      const settled = settledTurnActivity(unfinished, { ...input, liveRun: 'ended', finishReason });

      expect(settled.status).toBe('cancelled');
      expect(settled.completedAtMs).toBe(unfinished.updatedAtMs);
      const tool = settled.entries.find((entry) => entry.kind === 'tool');
      expect(tool && tool.kind === 'tool' ? tool.status : undefined).toBe('cancelled');
    }
    expect(
      settledTurnActivity(unfinished, { ...input, liveRun: 'ended', finishReason: 'error' }).status,
    ).toBe('failed');
    expect(
      settledTurnActivity(unfinished, { ...input, liveRun: 'live', finishReason: 'stopped' })
        .status,
    ).toBe('running');
  });

  it('leaves the run as stored when it is live, unknown or not yet asked about', () => {
    expect(settledTurnActivity(unfinished, { ...input, liveRun: 'live' }).status).toBe('running');
    expect(settledTurnActivity(unfinished, { ...input, liveRun: 'unknown' }).status).toBe(
      'running',
    );
    expect(settledTurnActivity(unfinished, input).status).toBe('running');
  });

  it('never settles a streaming row, a finished run or a request still waiting on the person', () => {
    expect(
      settledTurnActivity(unfinished, { ...input, streaming: true, liveRun: 'ended' }).status,
    ).toBe('running');
    expect(settledTurnActivity(finished, { ...input, liveRun: 'ended' })).toBe(finished);
    expect(settledTurnActivity(waitingOnApproval, { ...input, liveRun: 'ended' })).toBe(
      waitingOnApproval,
    );
  });

  it('knows which answers still have a run marked as working', () => {
    expect(hasUnfinishedRun(answerWith(unfinished))).toBe(true);
    expect(hasUnfinishedRun({ ...answerWith(unfinished), isStreaming: true })).toBe(false);
    expect(hasUnfinishedRun(answerWith(finished))).toBe(false);
    expect(hasUnfinishedRun(answerWith(waitingOnApproval))).toBe(false);
    expect(hasUnfinishedRun(answerWith(undefined))).toBe(false);
  });
});

describe('asking whether the last answer is still being written', () => {
  const base = { conversationId: 'c1', isCloud: true, isStreaming: false };

  beforeEach(() => {
    jest.useFakeTimers();
    mockApiFetch.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('asks for a cloud answer whose run is still marked as working', () => {
    expect(shouldAskWhetherTurnIsRunning({ ...base, messages: [question] })).toBe(true);
    expect(
      shouldAskWhetherTurnIsRunning({ ...base, messages: [question, answerWith(unfinished)] }),
    ).toBe(true);
    expect(
      shouldAskWhetherTurnIsRunning({ ...base, messages: [question, answerWith(finished)] }),
    ).toBe(false);
    expect(
      shouldAskWhetherTurnIsRunning({
        ...base,
        isCloud: false,
        messages: [question, answerWith(unfinished)],
      }),
    ).toBe(false);
  });

  function renderAnswerRecovery(onFinished = jest.fn()) {
    return renderHook(() =>
      useInFlightTurnRecovery({
        ...base,
        messages: [question, answerWith(unfinished)],
        onFinished,
      }),
    );
  }

  it('keeps the answer live while the server says its run is running', async () => {
    mockApiFetch.mockResolvedValue(runsResponse([{ state: 'running', staleForMs: 10 }]));
    const { result } = renderAnswerRecovery();
    expect(result.current).toBe('checking');

    await act(async () => {});
    expect(result.current).toBe('running');
    expect(lastAnswerLiveRun({ isCloud: true, isStreaming: false, verdict: result.current })).toBe(
      'live',
    );
  });

  it.each([
    ['there is no run for the conversation', []],
    ['the run went quiet', [{ state: 'running', staleForMs: 600_000 }]],
  ])('settles the answer as stalled when %s', async (_case, runs) => {
    mockApiFetch.mockResolvedValue(runsResponse(runs));
    const { result } = renderAnswerRecovery();

    await act(async () => {});
    expect(result.current).toBe('stalled');
    expect(lastAnswerLiveRun({ isCloud: true, isStreaming: false, verdict: result.current })).toBe(
      'ended',
    );
  });

  it.each([
    ['the request fails', () => mockApiFetch.mockResolvedValue({ ok: false })],
    ['the phone is offline', () => mockApiFetch.mockRejectedValue(new TypeError('Network'))],
  ])('reports the status as unknown when %s', async (_case, arrange) => {
    arrange();
    const { result } = renderAnswerRecovery();

    await act(async () => {});
    expect(result.current).toBe('unknown');
    expect(lastAnswerLiveRun({ isCloud: true, isStreaming: false, verdict: result.current })).toBe(
      'unknown',
    );
  });

  it('reloads when a run it watched finishes, then asks again before calling it stalled', async () => {
    mockApiFetch
      .mockResolvedValueOnce(runsResponse([{ state: 'running', staleForMs: 10 }]))
      .mockResolvedValueOnce(runsResponse([]))
      .mockResolvedValueOnce(runsResponse([]));
    const onFinished = jest.fn();
    const { result } = renderAnswerRecovery(onFinished);

    await act(async () => {});
    expect(result.current).toBe('running');

    await act(async () => {
      jest.advanceTimersByTime(IN_FLIGHT_TURN_RECHECK_MS);
    });
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(result.current).toBe('checking');

    await act(async () => {
      jest.advanceTimersByTime(IN_FLIGHT_TURN_RECHECK_MS);
    });
    expect(result.current).toBe('stalled');
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('treats a local answer that is not streaming as ended and a streaming one as stored', () => {
    expect(lastAnswerLiveRun({ isCloud: false, isStreaming: false, verdict: 'idle' })).toBe(
      'ended',
    );
    expect(lastAnswerLiveRun({ isCloud: false, isStreaming: true, verdict: 'idle' })).toBe(
      undefined,
    );
    expect(lastAnswerLiveRun({ isCloud: true, isStreaming: false, verdict: 'checking' })).toBe(
      undefined,
    );
  });
});

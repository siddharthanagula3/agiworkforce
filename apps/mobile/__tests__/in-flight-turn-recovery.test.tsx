import { act, renderHook } from '@testing-library/react-native';

const mockApiFetch = jest.fn();
jest.mock('@/services/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import {
  IN_FLIGHT_TURN_RECHECK_MS,
  readInFlightTurnVerdict,
  shouldAskWhetherTurnIsRunning,
  useInFlightTurnRecovery,
} from '@/src/features/chat/inFlightTurnRecovery';

function runsResponse(runs: unknown[]) {
  return { ok: true, json: async () => ({ runs }) };
}

const userLast = [{ role: 'user' as const, isStreaming: false }];

describe('in-flight turn recovery', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockApiFetch.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('asks only for a cloud chat whose last message is an unanswered user turn', () => {
    const base = { conversationId: 'c1', isCloud: true, isStreaming: false };
    expect(shouldAskWhetherTurnIsRunning({ ...base, messages: userLast })).toBe(true);
    expect(shouldAskWhetherTurnIsRunning({ ...base, isCloud: false, messages: userLast })).toBe(
      false,
    );
    expect(shouldAskWhetherTurnIsRunning({ ...base, isStreaming: true, messages: userLast })).toBe(
      false,
    );
    expect(
      shouldAskWhetherTurnIsRunning({
        ...base,
        messages: [{ role: 'assistant', isStreaming: false }],
      }),
    ).toBe(false);
  });

  it('treats a quiet row as stalled and a waiting row as alive', () => {
    expect(readInFlightTurnVerdict([])).toBe('idle');
    expect(readInFlightTurnVerdict([{ state: 'running', staleForMs: 1_000 }])).toBe('running');
    expect(readInFlightTurnVerdict([{ state: 'running', staleForMs: 600_000 }])).toBe('stalled');
    expect(readInFlightTurnVerdict([{ state: 'paused', staleForMs: 600_000 }])).toBe('running');
    expect(readInFlightTurnVerdict([{ state: 'running' }])).toBe('running');
  });

  it('follows a running turn and reloads once it finishes', async () => {
    mockApiFetch
      .mockResolvedValueOnce(runsResponse([{ state: 'running', staleForMs: 10 }]))
      .mockResolvedValueOnce(runsResponse([]));
    const onFinished = jest.fn();

    const { result } = renderHook(() =>
      useInFlightTurnRecovery({
        conversationId: 'c1',
        isCloud: true,
        isStreaming: false,
        messages: userLast,
        onFinished,
      }),
    );

    await act(async () => {});
    expect(result.current).toBe('running');
    expect(mockApiFetch.mock.calls[0][0]).toBe(
      '/api/llm/v1/chat/completions/runs?conversationId=c1',
    );

    await act(async () => {
      jest.advanceTimersByTime(IN_FLIGHT_TURN_RECHECK_MS);
    });
    expect(result.current).toBe('idle');
    expect(onFinished).toHaveBeenCalledTimes(1);
  });
});

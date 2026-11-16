import { act, renderHook } from '@testing-library/react-native';

const mockApiFetch = jest.fn();
jest.mock('@/services/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import {
  IN_FLIGHT_TURN_RECHECK_MS,
  IN_FLIGHT_TURN_STALL_DEADLINE_MS,
  lastAnswerLiveRun,
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
      .mockResolvedValueOnce(runsResponse([]))
      .mockResolvedValueOnce(runsResponse([]));
    const onFinished = jest.fn();

    const { result } = renderHook(() =>
      useInFlightTurnRecovery({
        conversationId: 'c1',
        isCloud: true,
        isStreaming: false,
        isOnline: true,
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
    expect(result.current).toBe('checking');
    expect(onFinished).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(IN_FLIGHT_TURN_RECHECK_MS);
    });
    expect(result.current).toBe('stalled');
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  describe('a question left without an answer', () => {
    function renderQuestion(
      overrides: Partial<{ isStreaming: boolean; messages: typeof userLast }> = {},
    ) {
      return renderHook(() =>
        useInFlightTurnRecovery({
          conversationId: 'c1',
          isCloud: true,
          isStreaming: false,
          isOnline: true,
          messages: userLast,
          onFinished: jest.fn(),
          ...overrides,
        }),
      );
    }

    it('is reported as stopped once the server knows of no run for it', async () => {
      mockApiFetch.mockResolvedValue(runsResponse([]));
      const { result } = renderQuestion();
      expect(result.current).toBe('checking');

      await act(async () => {});
      expect(result.current).toBe('stalled');
    });

    it('is still being checked while the first status request is pending', async () => {
      mockApiFetch.mockReturnValue(new Promise(() => undefined));
      const { result } = renderQuestion();

      await act(async () => {});
      expect(result.current).toBe('checking');
    });

    it('is running while the server has a live run for it', async () => {
      mockApiFetch.mockResolvedValue(runsResponse([{ state: 'running', staleForMs: 10 }]));
      const { result } = renderQuestion();

      await act(async () => {});
      expect(result.current).toBe('running');
    });

    it.each([
      ['the request fails', () => mockApiFetch.mockResolvedValue({ ok: false })],
      ['the phone is offline', () => mockApiFetch.mockRejectedValue(new TypeError('Network'))],
    ])('is unknown, never stopped, when %s', async (_case, arrange) => {
      arrange();
      const { result } = renderQuestion();

      await act(async () => {});
      expect(result.current).toBe('unknown');
    });

    it('is not asked about while this phone is still sending it', async () => {
      mockApiFetch.mockResolvedValue(runsResponse([]));
      const { result } = renderQuestion({ isStreaming: true });

      await act(async () => {});
      expect(result.current).toBe('idle');
      expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it('is not asked about while it waits in the offline queue', async () => {
      mockApiFetch.mockResolvedValue(runsResponse([]));
      const { result } = renderQuestion({
        messages: [{ role: 'user', isStreaming: false, isQueued: true }] as typeof userLast,
      });

      await act(async () => {});
      expect(result.current).toBe('idle');
      expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it.each([
      ['its offline send failed and the bubble offers its own retry', { queueFailed: true }],
      ['the person stopped it before it started', { metadata: { finishReason: 'stopped' } }],
    ])('is not asked about when %s', async (_case, row) => {
      mockApiFetch.mockResolvedValue(runsResponse([]));
      const { result } = renderQuestion({
        messages: [
          { role: 'user', isStreaming: false, isQueued: false, ...row },
        ] as typeof userLast,
      });

      await act(async () => {});
      expect(result.current).toBe('idle');
      expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it('is asked about again once the phone comes back online', async () => {
      mockApiFetch
        .mockRejectedValueOnce(new TypeError('Network'))
        .mockResolvedValueOnce(runsResponse([]));
      const { result, rerender } = renderHook(
        ({ isOnline }: { isOnline: boolean }) =>
          useInFlightTurnRecovery({
            conversationId: 'c1',
            isCloud: true,
            isStreaming: false,
            isOnline,
            messages: userLast,
            onFinished: jest.fn(),
          }),
        { initialProps: { isOnline: false } },
      );

      await act(async () => {});
      expect(result.current).toBe('unknown');

      rerender({ isOnline: true });
      await act(async () => {});
      expect(result.current).toBe('stalled');
      expect(mockApiFetch).toHaveBeenCalledTimes(2);
    });

    it('never reads as idle on the render where it first needs an answer', () => {
      mockApiFetch.mockReturnValue(new Promise(() => undefined));
      const seen: string[] = [];
      const { rerender } = renderHook(
        ({ isStreaming }: { isStreaming: boolean }) => {
          const verdict = useInFlightTurnRecovery({
            conversationId: 'c1',
            isCloud: true,
            isStreaming,
            isOnline: true,
            messages: userLast,
            onFinished: jest.fn(),
          });
          seen.push(verdict);
          return verdict;
        },
        { initialProps: { isStreaming: true } },
      );
      expect(seen).toEqual(['idle']);

      seen.length = 0;
      rerender({ isStreaming: false });

      expect(seen[0]).toBe('checking');
      expect(seen).not.toContain('idle');
    });

    describe('sent moments ago when the server knows of no run for it', () => {
      const SENT_AT = '2026-11-16T18:00:00.000Z';
      const sentAtMs = Date.parse(SENT_AT);
      const sentQuestion = [
        { role: 'user' as const, isStreaming: false, createdAt: SENT_AT },
      ] as typeof userLast;

      it('waits for an answer from another device instead of reporting it stopped', async () => {
        jest.setSystemTime(sentAtMs + 10_000);
        mockApiFetch.mockResolvedValue(runsResponse([]));
        const { result } = renderQuestion({ messages: sentQuestion });

        await act(async () => {});
        expect(result.current).toBe('waiting');
        expect(lastAnswerLiveRun({ isCloud: true, isStreaming: false, verdict: 'waiting' })).toBe(
          'unknown',
        );
      });

      it('is reported as stopped once the stall deadline has passed', async () => {
        jest.setSystemTime(sentAtMs + 10_000);
        mockApiFetch.mockResolvedValue(runsResponse([]));
        const { result } = renderQuestion({ messages: sentQuestion });
        await act(async () => {});
        expect(result.current).toBe('waiting');

        jest.setSystemTime(sentAtMs + IN_FLIGHT_TURN_STALL_DEADLINE_MS - IN_FLIGHT_TURN_RECHECK_MS);
        await act(async () => {
          jest.advanceTimersByTime(IN_FLIGHT_TURN_RECHECK_MS);
        });
        expect(result.current).toBe('stalled');
        expect(mockApiFetch).toHaveBeenCalledTimes(2);
      });

      it('is reported as stopped straight away when it is older than the deadline', async () => {
        jest.setSystemTime(sentAtMs + IN_FLIGHT_TURN_STALL_DEADLINE_MS);
        mockApiFetch.mockResolvedValue(runsResponse([]));
        const { result } = renderQuestion({ messages: sentQuestion });

        await act(async () => {});
        expect(result.current).toBe('stalled');
      });

      it('is followed once a run for it appears', async () => {
        jest.setSystemTime(sentAtMs + 10_000);
        mockApiFetch
          .mockResolvedValueOnce(runsResponse([]))
          .mockResolvedValue(runsResponse([{ state: 'running', staleForMs: 10 }]));
        const { result } = renderQuestion({ messages: sentQuestion });
        await act(async () => {});
        expect(result.current).toBe('waiting');

        await act(async () => {
          jest.advanceTimersByTime(IN_FLIGHT_TURN_RECHECK_MS);
        });
        expect(result.current).toBe('running');
      });

      it('stops waiting a deadline after opening when its time is ahead of this phone', async () => {
        const openedAt = sentAtMs - 60 * 60_000;
        jest.setSystemTime(openedAt);
        mockApiFetch.mockResolvedValue(runsResponse([]));
        const { result } = renderQuestion({ messages: sentQuestion });
        await act(async () => {});
        expect(result.current).toBe('waiting');

        jest.setSystemTime(openedAt + IN_FLIGHT_TURN_STALL_DEADLINE_MS - IN_FLIGHT_TURN_RECHECK_MS);
        await act(async () => {
          jest.advanceTimersByTime(IN_FLIGHT_TURN_RECHECK_MS);
        });
        expect(result.current).toBe('stalled');
      });

      it('is unknown, never waiting or stopped, while the phone is offline', async () => {
        jest.setSystemTime(sentAtMs + 10_000);
        mockApiFetch.mockRejectedValue(new TypeError('Network'));
        const { result } = renderQuestion({ messages: sentQuestion });

        await act(async () => {});
        expect(result.current).toBe('unknown');
      });
    });
  });
});

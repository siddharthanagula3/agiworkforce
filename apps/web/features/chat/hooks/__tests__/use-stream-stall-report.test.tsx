import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ reportClientFailure: vi.fn() }));
const { reportClientFailure } = mocks;

vi.mock('@agiworkforce/unified-chat', () => ({
  reportClientFailure: mocks.reportClientFailure,
}));

import {
  STREAM_STALL_MS,
  streamProgressMark,
  useStreamStallReport,
} from '../use-stream-stall-report';

const ROWS = [{ id: 'm1', content: 'hello' }];

beforeEach(() => {
  vi.useFakeTimers();
  reportClientFailure.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a turn the user watches do nothing', () => {
  it('reports a stream that stops producing text while it is still streaming', () => {
    renderHook(() => useStreamStallReport({ streaming: true, rows: ROWS, turnKey: 'c1' }));

    vi.advanceTimersByTime(STREAM_STALL_MS - 1);
    expect(reportClientFailure).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(reportClientFailure).toHaveBeenCalledWith({
      failure: 'stream_stall',
      detail: 'timeout',
    });
  });

  it('stays quiet while tokens keep arriving', () => {
    const { rerender } = renderHook(
      ({ rows }: { rows: Array<{ id: string; content: string }> }) =>
        useStreamStallReport({ streaming: true, rows, turnKey: 'c1' }),
      { initialProps: { rows: ROWS } },
    );

    for (let step = 1; step <= 5; step += 1) {
      vi.advanceTimersByTime(STREAM_STALL_MS - 1_000);
      rerender({ rows: [{ id: 'm1', content: 'hello'.repeat(step + 1) }] });
    }
    vi.advanceTimersByTime(STREAM_STALL_MS - 1_000);

    expect(reportClientFailure).not.toHaveBeenCalled();
  });

  it('stays quiet when nothing is streaming, however long the transcript sits', () => {
    renderHook(() => useStreamStallReport({ streaming: false, rows: ROWS, turnKey: 'c1' }));

    vi.advanceTimersByTime(STREAM_STALL_MS * 10);

    expect(reportClientFailure).not.toHaveBeenCalled();
  });

  it('counts one stall per stalled turn rather than one per timer', () => {
    const { rerender } = renderHook(
      ({ streaming }: { streaming: boolean }) =>
        useStreamStallReport({ streaming, rows: ROWS, turnKey: 'c1' }),
      { initialProps: { streaming: true } },
    );

    vi.advanceTimersByTime(STREAM_STALL_MS);
    rerender({ streaming: false });
    rerender({ streaming: true });
    vi.advanceTimersByTime(STREAM_STALL_MS * 3);

    expect(reportClientFailure).toHaveBeenCalledTimes(1);
  });

  it('marks progress by the last row rather than by identity', () => {
    expect(streamProgressMark([])).toBe('');
    expect(streamProgressMark(ROWS)).not.toBe(
      streamProgressMark([{ id: 'm1', content: 'hello there' }]),
    );
  });
});

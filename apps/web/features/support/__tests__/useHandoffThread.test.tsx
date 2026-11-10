import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type {
  SupportHandoffMessageView,
  SupportHandoffThreadPage,
} from '@agiworkforce/cloud-contracts/support';
import { useHandoffThread } from '../hooks/useHandoffThread';

function view(
  seq: number,
  author: 'user' | 'agent' | 'system' = 'user',
): SupportHandoffMessageView {
  return { seq, author, body: `message ${String(seq)}`, at: '2026-11-08T10:00:00.000Z' };
}

function page(messages: SupportHandoffMessageView[], nextAfter: number): SupportHandoffThreadPage {
  return { status: 'connected', messages, nextAfter, pollIntervalMs: 1000 };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useHandoffThread', () => {
  it('keeps reading from the last fetched page after a local send, so earlier peer messages are not skipped', async () => {
    const afters: number[] = [];
    const load = vi.fn(async (_id: string, after: number) => {
      afters.push(after);
      if (after === 0) return page([view(10)], 10);
      if (after >= 12) return page([], 12);
      return page([view(11), view(12, 'agent')], 12);
    });
    const send = vi.fn(async () => ({ ok: true as const, message: view(12, 'agent') }));

    const { result } = renderHook(() =>
      useHandoffThread({ sessionId: 'a', pollIntervalMs: 1000, load, send }),
    );
    await waitFor(() => expect(result.current.messages.map((entry) => entry.seq)).toEqual([10]));

    act(() => result.current.send('reply'));
    await waitFor(() =>
      expect(result.current.messages.map((entry) => entry.seq)).toEqual([10, 12]),
    );

    await act(async () => {
      vi.advanceTimersByTime(1200);
    });
    await waitFor(() =>
      expect(result.current.messages.map((entry) => entry.seq)).toEqual([10, 11, 12]),
    );
    expect(afters[afters.length - 1]).toBe(10);
  });

  it('drops a read that finishes after the thread switched to another session', async () => {
    let releaseA: (value: SupportHandoffThreadPage) => void = () => {};
    const load = vi.fn((id: string) =>
      id === 'a'
        ? new Promise<SupportHandoffThreadPage>((resolve) => {
            releaseA = resolve;
          })
        : Promise.resolve(page([view(1)], 1)),
    );
    const send = vi.fn();

    const { result, rerender } = renderHook(
      ({ sessionId }) => useHandoffThread({ sessionId, pollIntervalMs: 1000, load, send }),
      { initialProps: { sessionId: 'a' } },
    );
    rerender({ sessionId: 'b' });
    await waitFor(() => expect(result.current.messages.map((entry) => entry.seq)).toEqual([1]));

    await act(async () => {
      releaseA(page([view(7), view(8)], 8));
    });

    expect(result.current.messages.map((entry) => entry.seq)).toEqual([1]);
  });

  it('drops a send acknowledgement that arrives after the thread switched sessions', async () => {
    let releaseSend: (value: { ok: true; message: SupportHandoffMessageView }) => void = () => {};
    const load = vi.fn(async () => page([], 0));
    const send = vi.fn(
      () =>
        new Promise<{ ok: true; message: SupportHandoffMessageView }>((resolve) => {
          releaseSend = resolve;
        }),
    );

    const { result, rerender } = renderHook(
      ({ sessionId }) => useHandoffThread({ sessionId, pollIntervalMs: 1000, load, send }),
      { initialProps: { sessionId: 'a' } },
    );
    act(() => result.current.send('for a'));
    expect(result.current.sending).toBe(true);

    rerender({ sessionId: 'b' });
    expect(result.current.sending).toBe(false);

    await act(async () => {
      releaseSend({ ok: true, message: view(3, 'agent') });
    });

    expect(result.current.messages).toEqual([]);
  });
});

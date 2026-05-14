import { describe, expect, it } from 'vitest';

import { StreamIdleTimeoutError, withStreamIdleWatchdog } from '../watchdog';

async function* timedSource(delays: number[], values: string[]): AsyncIterable<string> {
  for (let i = 0; i < delays.length; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, delays[i] ?? 0));
    yield values[i] ?? '';
  }
}

async function* hangAfter(
  initialDelays: number[],
  initialValues: string[],
  hangMs: number,
): AsyncIterable<string> {
  for (let i = 0; i < initialDelays.length; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, initialDelays[i] ?? 0));
    yield initialValues[i] ?? '';
  }
  await new Promise<void>((resolve) => setTimeout(resolve, hangMs));
  yield 'never';
}

describe('withStreamIdleWatchdog', () => {
  it('passes chunks through when each is delivered within timeout', async () => {
    const wd = withStreamIdleWatchdog(timedSource([10, 10, 10], ['a', 'b', 'c']), {
      idleMs: 100,
      warningMs: null,
    });
    const out: string[] = [];
    for await (const c of wd) out.push(c);
    expect(out).toEqual(['a', 'b', 'c']);
  });

  it('throws StreamIdleTimeoutError when iterator hangs', async () => {
    const wd = withStreamIdleWatchdog(hangAfter([5, 5], ['a', 'b'], 1_000), {
      idleMs: 50,
      warningMs: null,
    });
    let err: unknown;
    try {
      for await (const _c of wd) {
        // consume
      }
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(StreamIdleTimeoutError);
    expect((err as StreamIdleTimeoutError).idleMs).toBe(50);
  });

  it('resets the timer on every chunk', async () => {
    // 3 chunks, each spaced 30ms; idleMs=50ms → must complete.
    const wd = withStreamIdleWatchdog(timedSource([30, 30, 30], ['a', 'b', 'c']), {
      idleMs: 50,
      warningMs: null,
    });
    const out: string[] = [];
    for await (const c of wd) out.push(c);
    expect(out).toEqual(['a', 'b', 'c']);
  });

  it('fires onHalfTimeWarning before timeout', async () => {
    let warned = 0;
    const wd = withStreamIdleWatchdog(hangAfter([10], ['a'], 1_000), {
      idleMs: 100,
      warningMs: 30,
      hooks: {
        onHalfTimeWarning: () => {
          warned++;
        },
      },
    });
    let err: unknown;
    try {
      for await (const _c of wd) {
        // consume
      }
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(StreamIdleTimeoutError);
    expect(warned).toBe(1);
  });

  it('does not fire warning when warningMs is null', async () => {
    let warned = 0;
    const wd = withStreamIdleWatchdog(hangAfter([10], ['a'], 1_000), {
      idleMs: 60,
      warningMs: null,
      hooks: {
        onHalfTimeWarning: () => {
          warned++;
        },
      },
    });
    try {
      for await (const _c of wd) {
        // consume
      }
    } catch {
      /* expected */
    }
    expect(warned).toBe(0);
  });

  it('calls onChunk for each delivered chunk', async () => {
    let chunks = 0;
    const wd = withStreamIdleWatchdog(timedSource([5, 5], ['a', 'b']), {
      idleMs: 200,
      warningMs: null,
      hooks: {
        onChunk: () => {
          chunks++;
        },
      },
    });
    for await (const _c of wd) {
      // consume
    }
    expect(chunks).toBe(2);
  });
});

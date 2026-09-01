import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createFrameCoalescedAppender,
  FRAME_COALESCE_FALLBACK_MS,
  type CoalescedAppendKind,
} from './frame-coalesced-appender';

const MESSAGE_ID = 'assistant-1';
const OTHER_MESSAGE_ID = 'assistant-2';

let frameCallbacks: Map<number, FrameRequestCallback>;
let nextFrameHandle: number;
let cancelAnimationFrameSpy: ReturnType<typeof vi.fn>;

function runPendingFrames(): void {
  const due = [...frameCallbacks.entries()];
  frameCallbacks.clear();
  for (const [, callback] of due) callback(performance.now());
}

function stubAnimationFrame({ starved }: { starved: boolean }): void {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const handle = nextFrameHandle;
    nextFrameHandle += 1;
    if (!starved) frameCallbacks.set(handle, callback);
    return handle;
  });
  vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameSpy);
}

function recordingAppender() {
  const writes: Array<{ kind: CoalescedAppendKind; messageId: string; text: string }> = [];
  const appender = createFrameCoalescedAppender({
    onFlush: (kind, messageId, text) => writes.push({ kind, messageId, text }),
  });
  return { appender, writes };
}

beforeEach(() => {
  frameCallbacks = new Map();
  nextFrameHandle = 1;
  cancelAnimationFrameSpy = vi.fn((handle: number) => {
    frameCallbacks.delete(handle);
  });
  vi.useFakeTimers();
  stubAnimationFrame({ starved: false });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('createFrameCoalescedAppender', () => {
  it('collapses many appends into a single write per frame', () => {
    const { appender, writes } = recordingAppender();

    for (const token of ['Hel', 'lo', ' ', 'wor', 'ld']) {
      appender.append('content', MESSAGE_ID, token);
    }

    expect(writes).toEqual([]);

    runPendingFrames();

    expect(writes).toEqual([{ kind: 'content', messageId: MESSAGE_ID, text: 'Hello world' }]);
  });

  it('schedules a fresh frame for appends that arrive after a flush', () => {
    const { appender, writes } = recordingAppender();

    appender.append('content', MESSAGE_ID, 'first');
    runPendingFrames();
    appender.append('content', MESSAGE_ID, 'second');
    runPendingFrames();

    expect(writes.map((write) => write.text)).toEqual(['first', 'second']);
  });

  it('delivers the exact concatenation when a caller force-flushes', () => {
    const { appender, writes } = recordingAppender();

    appender.append('content', MESSAGE_ID, 'partial ');
    appender.append('content', MESSAGE_ID, 'answer');
    appender.flush();

    expect(writes).toEqual([{ kind: 'content', messageId: MESSAGE_ID, text: 'partial answer' }]);

    runPendingFrames();
    vi.advanceTimersByTime(FRAME_COALESCE_FALLBACK_MS);

    expect(writes).toHaveLength(1);
    expect(cancelAnimationFrameSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps interleaved content and thinking buffers separate and in arrival order', () => {
    const { appender, writes } = recordingAppender();

    appender.append('thinking', MESSAGE_ID, 'let me ');
    appender.append('content', MESSAGE_ID, 'The ');
    appender.append('thinking', MESSAGE_ID, 'check');
    appender.append('content', MESSAGE_ID, 'answer');
    runPendingFrames();

    expect(writes).toEqual([
      { kind: 'thinking', messageId: MESSAGE_ID, text: 'let me check' },
      { kind: 'content', messageId: MESSAGE_ID, text: 'The answer' },
    ]);
  });

  it('buffers each message id independently', () => {
    const { appender, writes } = recordingAppender();

    appender.append('content', MESSAGE_ID, 'one');
    appender.append('content', OTHER_MESSAGE_ID, 'two');
    runPendingFrames();

    expect(writes).toEqual([
      { kind: 'content', messageId: MESSAGE_ID, text: 'one' },
      { kind: 'content', messageId: OTHER_MESSAGE_ID, text: 'two' },
    ]);
  });

  it('falls back to a timeout when animation frames never run', () => {
    vi.unstubAllGlobals();
    stubAnimationFrame({ starved: true });
    const { appender, writes } = recordingAppender();

    appender.append('content', MESSAGE_ID, 'background tab');

    vi.advanceTimersByTime(FRAME_COALESCE_FALLBACK_MS - 1);
    expect(writes).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(writes).toEqual([{ kind: 'content', messageId: MESSAGE_ID, text: 'background tab' }]);
  });

  it('flushes without an animation frame API at all', () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('requestAnimationFrame', undefined);
    vi.stubGlobal('cancelAnimationFrame', undefined);
    const { appender, writes } = recordingAppender();

    appender.append('content', MESSAGE_ID, 'no raf here');
    vi.advanceTimersByTime(FRAME_COALESCE_FALLBACK_MS);

    expect(writes).toEqual([{ kind: 'content', messageId: MESSAGE_ID, text: 'no raf here' }]);
  });

  it('loses no trailing text when a force-flush lands mid-frame', () => {
    const { appender, writes } = recordingAppender();

    appender.append('content', MESSAGE_ID, 'streamed ');
    runPendingFrames();
    appender.append('content', MESSAGE_ID, 'tail');
    appender.flush();

    expect(writes.map((write) => write.text).join('')).toBe('streamed tail');

    runPendingFrames();
    vi.advanceTimersByTime(FRAME_COALESCE_FALLBACK_MS);

    expect(writes).toHaveLength(2);
  });

  it('ignores empty appends and no-op flushes', () => {
    const { appender, writes } = recordingAppender();

    appender.append('content', MESSAGE_ID, '');
    appender.flush();

    expect(writes).toEqual([]);
    expect(cancelAnimationFrameSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(FRAME_COALESCE_FALLBACK_MS);
    expect(writes).toEqual([]);
  });
});

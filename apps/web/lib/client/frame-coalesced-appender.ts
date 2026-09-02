export const FRAME_COALESCE_FALLBACK_MS = 32;
export const CONTENT_REVEAL_FLOOR_CHARS = 64;
export const CONTENT_CATCH_UP_MS = 280;

const ASSUMED_FIRST_TICK_DT_MS = 16;
const CONTENT_RATE_EWMA_ALPHA = 0.3;
const HIGH_SURROGATE_MIN = 0xd800;
const HIGH_SURROGATE_MAX = 0xdbff;

export type CoalescedAppendKind = 'content' | 'thinking';

export interface FrameCoalescedAppenderOptions {
  onFlush: (kind: CoalescedAppendKind, messageId: string, text: string) => void;
}

export interface FrameCoalescedAppender {
  append: (kind: CoalescedAppendKind, messageId: string, text: string) => void;
  flush: () => void;
}

interface PendingAppend {
  kind: CoalescedAppendKind;
  messageId: string;
  text: string;
}

interface ContentPaceState {
  deadline: number | null;
  lastTickAt: number | null;
  lastAppendAt: number | null;
  rateEwma: number;
}

const nowMs = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

export function createFrameCoalescedAppender({
  onFlush,
}: FrameCoalescedAppenderOptions): FrameCoalescedAppender {
  const pending = new Map<string, PendingAppend>();
  const paceState = new Map<string, ContentPaceState>();
  let frameHandle: number | null = null;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const unschedule = () => {
    if (frameHandle !== null) {
      if (typeof globalThis.cancelAnimationFrame === 'function') {
        globalThis.cancelAnimationFrame(frameHandle);
      }
      frameHandle = null;
    }
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
  };

  const nextContentRevealChars = (key: string, text: string, frameTime: number): number => {
    const backlog = text.length;
    if (backlog <= CONTENT_REVEAL_FLOOR_CHARS) {
      paceState.delete(key);
      return backlog;
    }
    const state = paceState.get(key) ?? {
      deadline: null,
      lastTickAt: null,
      lastAppendAt: null,
      rateEwma: 0,
    };
    if (state.deadline === null) state.deadline = frameTime + CONTENT_CATCH_UP_MS;
    const dt =
      state.lastTickAt === null
        ? ASSUMED_FIRST_TICK_DT_MS
        : Math.max(frameTime - state.lastTickAt, 0);
    const remaining = Math.max(state.deadline - frameTime, dt, 1);
    const byDeadline = Math.ceil((backlog * dt) / remaining);
    const byRate = Math.ceil(state.rateEwma * dt);
    let reveal = Math.min(backlog, Math.max(CONTENT_REVEAL_FLOOR_CHARS, byDeadline, byRate));
    if (reveal < backlog) {
      const code = text.charCodeAt(reveal - 1);
      if (code >= HIGH_SURROGATE_MIN && code <= HIGH_SURROGATE_MAX) {
        reveal = Math.min(reveal + 1, backlog);
      }
    }
    state.lastTickAt = frameTime;
    if (reveal >= backlog) {
      paceState.delete(key);
    } else {
      paceState.set(key, state);
    }
    return reveal;
  };

  const tick = (frameTime: number) => {
    unschedule();
    if (pending.size === 0) return;
    let needsReschedule = false;
    for (const [key, entry] of pending) {
      if (entry.kind !== 'content') {
        onFlush(entry.kind, entry.messageId, entry.text);
        pending.delete(key);
        continue;
      }
      const revealChars = nextContentRevealChars(key, entry.text, frameTime);
      if (revealChars >= entry.text.length) {
        onFlush(entry.kind, entry.messageId, entry.text);
        pending.delete(key);
      } else {
        const chunk = entry.text.slice(0, revealChars);
        entry.text = entry.text.slice(chunk.length);
        onFlush(entry.kind, entry.messageId, chunk);
        needsReschedule = true;
      }
    }
    if (needsReschedule) schedule();
  };

  const flush = () => {
    unschedule();
    if (pending.size === 0) return;
    const drained = [...pending.values()];
    pending.clear();
    paceState.clear();
    for (const entry of drained) {
      onFlush(entry.kind, entry.messageId, entry.text);
    }
  };

  const schedule = () => {
    if (frameHandle !== null || timeoutHandle !== null) return;
    if (typeof globalThis.requestAnimationFrame === 'function') {
      frameHandle = globalThis.requestAnimationFrame((time) => {
        frameHandle = null;
        tick(time);
      });
    }
    timeoutHandle = setTimeout(() => {
      timeoutHandle = null;
      tick(nowMs());
    }, FRAME_COALESCE_FALLBACK_MS);
  };

  return {
    append: (kind, messageId, text) => {
      if (!text) return;
      const key = `${kind}:${messageId}`;
      const entry = pending.get(key);
      if (entry) {
        entry.text += text;
      } else {
        pending.set(key, { kind, messageId, text });
      }
      if (kind === 'content') {
        const now = nowMs();
        const state = paceState.get(key);
        if (state) {
          if (state.lastAppendAt !== null) {
            const dt = now - state.lastAppendAt;
            if (dt > 0) {
              const instantRate = text.length / dt;
              state.rateEwma =
                state.rateEwma === 0
                  ? instantRate
                  : state.rateEwma * (1 - CONTENT_RATE_EWMA_ALPHA) +
                    instantRate * CONTENT_RATE_EWMA_ALPHA;
            }
          }
          state.lastAppendAt = now;
        } else {
          paceState.set(key, { deadline: null, lastTickAt: null, lastAppendAt: now, rateEwma: 0 });
        }
      }
      schedule();
    },
    flush,
  };
}

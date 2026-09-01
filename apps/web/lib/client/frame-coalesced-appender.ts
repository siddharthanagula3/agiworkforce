export const FRAME_COALESCE_FALLBACK_MS = 32;

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

export function createFrameCoalescedAppender({
  onFlush,
}: FrameCoalescedAppenderOptions): FrameCoalescedAppender {
  const pending = new Map<string, PendingAppend>();
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

  const flush = () => {
    unschedule();
    if (pending.size === 0) return;
    const drained = [...pending.values()];
    pending.clear();
    for (const entry of drained) {
      onFlush(entry.kind, entry.messageId, entry.text);
    }
  };

  const schedule = () => {
    if (frameHandle !== null || timeoutHandle !== null) return;
    if (typeof globalThis.requestAnimationFrame === 'function') {
      frameHandle = globalThis.requestAnimationFrame(() => {
        frameHandle = null;
        flush();
      });
    }
    timeoutHandle = setTimeout(() => {
      timeoutHandle = null;
      flush();
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
      schedule();
    },
    flush,
  };
}

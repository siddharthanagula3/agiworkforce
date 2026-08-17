import type { ControlReceiptOutcome } from '@agiworkforce/types';

export type ControlDeliveryOutcome = 'acknowledged' | 'rejected' | 'dropped';

export interface ControlDelivery {
  requestId: string;
  action: string;
  outcome: ControlDeliveryOutcome;
}

export interface ControlAckTrackerOptions {
  timeoutMs: number;
  maxAttempts: number;
  maxPending: number;
  resend: (action: string, payload: unknown) => void;
  onChange: (pendingCount: number, delivery?: ControlDelivery) => void;
}

export interface ControlAckTracker {
  track(action: string, payload: unknown): void;
  resolve(requestId: string, outcome: ControlReceiptOutcome): void;
  clear(): void;
  pendingCount(): number;
  pendingRequestIds(): string[];
}

interface PendingControl {
  action: string;
  payload: unknown;
  attempts: number;
  timer: ReturnType<typeof setTimeout>;
}

const MAX_REQUEST_ID_LENGTH = 128;

export function readControlRequestId(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>)['requestId'];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_REQUEST_ID_LENGTH ? trimmed : null;
}

export function createControlAckTracker(options: ControlAckTrackerOptions): ControlAckTracker {
  const pending = new Map<string, PendingControl>();

  const arm = (requestId: string): ReturnType<typeof setTimeout> =>
    setTimeout(() => {
      const entry = pending.get(requestId);
      if (!entry) return;

      if (entry.attempts >= options.maxAttempts) {
        pending.delete(requestId);
        options.onChange(pending.size, {
          requestId,
          action: entry.action,
          outcome: 'dropped',
        });
        return;
      }

      entry.attempts += 1;
      entry.timer = arm(requestId);
      options.resend(entry.action, entry.payload);
    }, options.timeoutMs);

  return {
    track(action, payload) {
      const requestId = readControlRequestId(payload);
      if (!requestId || pending.has(requestId)) return;

      while (pending.size >= options.maxPending) {
        const oldest = pending.keys().next().value;
        if (oldest === undefined) break;
        const evicted = pending.get(oldest);
        if (evicted) clearTimeout(evicted.timer);
        pending.delete(oldest);
      }

      pending.set(requestId, { action, payload, attempts: 1, timer: arm(requestId) });
      options.onChange(pending.size);
    },

    resolve(requestId, outcome) {
      const entry = pending.get(requestId);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(requestId);
      options.onChange(pending.size, {
        requestId,
        action: entry.action,
        outcome: outcome === 'rejected' ? 'rejected' : 'acknowledged',
      });
    },

    clear() {
      for (const entry of pending.values()) clearTimeout(entry.timer);
      pending.clear();
      options.onChange(0);
    },

    pendingCount() {
      return pending.size;
    },

    pendingRequestIds() {
      return [...pending.keys()];
    },
  };
}

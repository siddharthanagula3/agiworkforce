import type { ControlReceiptEvent } from '@agiworkforce/types';

const MAX_TRACKED_CONTROL_RECEIPTS = 256;

export interface ControlReceiptLedger {
  record(controlAction: string, requestId: string, now?: Date): ControlReceiptEvent;
  clear(): void;
  size(): number;
}

export function createControlReceiptLedger(
  maxTracked = MAX_TRACKED_CONTROL_RECEIPTS,
): ControlReceiptLedger {
  const issued = new Map<string, ControlReceiptEvent>();

  return {
    record(controlAction, requestId, now = new Date()) {
      const key = `${controlAction} ${requestId}`;
      const seen = issued.get(key);
      if (seen) {
        return { ...seen, outcome: 'duplicate', receivedAt: now.toISOString() };
      }

      const receipt: ControlReceiptEvent = {
        action: 'control.receipt',
        version: 1,
        requestId,
        controlAction,
        outcome: 'accepted',
        receivedAt: now.toISOString(),
      };
      issued.set(key, receipt);
      while (issued.size > maxTracked) {
        const oldest = issued.keys().next().value;
        if (oldest === undefined) break;
        issued.delete(oldest);
      }
      return receipt;
    },

    clear() {
      issued.clear();
    },

    size() {
      return issued.size;
    },
  };
}

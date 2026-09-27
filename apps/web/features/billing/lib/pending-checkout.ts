import { isSelfServePaidPlanTier, type SelfServePaidPlanTier } from '@agiworkforce/types';

const PENDING_CHECKOUT_KEY = 'agi.billing.pendingCheckout';
const PENDING_CHECKOUT_TTL_MS = 60 * 60 * 1000;

export interface PendingCheckout {
  sessionId: string;
  plan: SelfServePaidPlanTier;
  startedAt: number;
}

export function rememberPendingCheckout(sessionId: string, plan: SelfServePaidPlanTier): void {
  try {
    window.localStorage.setItem(
      PENDING_CHECKOUT_KEY,
      JSON.stringify({ sessionId, plan, startedAt: Date.now() }),
    );
  } catch {
    return;
  }
}

export function clearPendingCheckout(): void {
  try {
    window.localStorage.removeItem(PENDING_CHECKOUT_KEY);
  } catch {
    return;
  }
}

export function readPendingCheckout(now = Date.now()): PendingCheckout | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(PENDING_CHECKOUT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: Partial<PendingCheckout>;
  try {
    parsed = JSON.parse(raw) as Partial<PendingCheckout>;
  } catch {
    clearPendingCheckout();
    return null;
  }
  if (
    typeof parsed.sessionId !== 'string' ||
    !parsed.sessionId.startsWith('cs_') ||
    !isSelfServePaidPlanTier(parsed.plan) ||
    typeof parsed.startedAt !== 'number' ||
    now - parsed.startedAt > PENDING_CHECKOUT_TTL_MS
  ) {
    clearPendingCheckout();
    return null;
  }
  return { sessionId: parsed.sessionId, plan: parsed.plan, startedAt: parsed.startedAt };
}

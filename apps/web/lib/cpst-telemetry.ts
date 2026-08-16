import 'server-only';

export type CpstTaskOutcome = 'success' | 'failure' | 'abandoned' | 'unknown';

export type CpstVerifierResult = 'pass' | 'fail' | 'skipped' | 'unavailable';

export const CPST_VERIFIER_RESULT_NO_SEAM = 'skipped' satisfies CpstVerifierResult;

export interface CpstUsageFields {
  taskOutcome?: CpstTaskOutcome;
  retries?: number;
  fallbackUsed?: boolean;
  fallbackReason?: string;
  verifierResult?: CpstVerifierResult;
  routePlanId?: string;
  taskFamily?: string;
  taskFamilyConfidence?: number;
}

export interface CpstTerminalSignals {
  billingOutcome: 'completed' | 'failed';
  cancelled?: boolean;
}

export interface CpstRequestView {
  usedFallback?: boolean | undefined;
  fallbackReason?: string | undefined;
  routePlanId?: string | undefined;
  resolvedTaskType?: string | undefined;
  classifierConfidence?: number | undefined;
  retries?: number | undefined;
}

export function buildInterimRoutePlanId(route: {
  harnessId: string;
  routeId: string;
  reason: string;
}): string {
  return `interim:${route.harnessId}:${route.routeId}:${route.reason}`;
}

export function resolveCpstTaskOutcome(signals: CpstTerminalSignals): CpstTaskOutcome {
  if (signals.cancelled === true) return 'abandoned';
  if (signals.billingOutcome === 'failed') return 'failure';
  return 'unknown';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function buildCpstUsageFields(
  view: CpstRequestView,
  signals: CpstTerminalSignals,
): CpstUsageFields {
  const fields: CpstUsageFields = {
    taskOutcome: resolveCpstTaskOutcome(signals),
    verifierResult: CPST_VERIFIER_RESULT_NO_SEAM,
  };

  if (typeof view.usedFallback === 'boolean') {
    fields.fallbackUsed = view.usedFallback;
    if (view.usedFallback && isNonEmptyString(view.fallbackReason)) {
      fields.fallbackReason = view.fallbackReason;
    }
  }

  if (typeof view.retries === 'number' && Number.isInteger(view.retries) && view.retries >= 0) {
    fields.retries = view.retries;
  }

  if (isNonEmptyString(view.routePlanId)) {
    fields.routePlanId = view.routePlanId;
  }

  if (isNonEmptyString(view.resolvedTaskType)) {
    fields.taskFamily = view.resolvedTaskType;
    if (
      typeof view.classifierConfidence === 'number' &&
      Number.isFinite(view.classifierConfidence)
    ) {
      fields.taskFamilyConfidence = view.classifierConfidence;
    }
  }

  return fields;
}

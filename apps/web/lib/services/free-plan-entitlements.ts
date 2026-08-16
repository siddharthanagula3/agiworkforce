import 'server-only';

import {
  BILLING_PLAN_PRICING,
  getBillingPlanProductLimits,
  toEnforceableBillingPlanLimit,
} from '@agiworkforce/types';

export function getProjectLimit(planTier: string | null | undefined): number | null {
  return toEnforceableBillingPlanLimit(getBillingPlanProductLimits(planTier)?.projects);
}

export function getCustomRemoteMcpLimit(planTier: string | null | undefined): number | null {
  return toEnforceableBillingPlanLimit(getBillingPlanProductLimits(planTier)?.customMcpServers);
}

export function getKnowledgeStorageLimitBytes(planTier: string | null | undefined): number | null {
  return toEnforceableBillingPlanLimit(
    getBillingPlanProductLimits(planTier)?.knowledgeStorageBytes,
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${Math.round(bytes / 1024 ** 3)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${bytes} bytes`;
}

export function getKnowledgeStorageLimitErrorMessage(
  planTier: string | null | undefined,
  limitBytes: number,
): string {
  const label = planTier ? SAFE_PLAN_LABELS[planTier.toLowerCase()] : undefined;
  if (!label) {
    return 'Your current subscription does not include project knowledge storage. Choose an eligible plan and try again.';
  }
  return `${label} accounts include ${formatBytes(limitBytes)} of project knowledge storage. Remove a file or upgrade to add another.`;
}

const SAFE_PLAN_LABELS: Readonly<Record<string, string>> = Object.freeze({
  free: BILLING_PLAN_PRICING.free.label,
  basic: BILLING_PLAN_PRICING.basic.label,
  pro: BILLING_PLAN_PRICING.pro.label,
  max: BILLING_PLAN_PRICING.max.label,
  max_15x: BILLING_PLAN_PRICING.max_15x.label,
  team: BILLING_PLAN_PRICING.team.label,
  enterprise: BILLING_PLAN_PRICING.enterprise.label,
});

export function getProjectLimitErrorMessage(planTier: string | null | undefined): string {
  const limit = getProjectLimit(planTier);
  const label = planTier ? SAFE_PLAN_LABELS[planTier.toLowerCase()] : undefined;
  if (!label || limit === 0) {
    return 'Your current subscription does not allow Managed Cloud Projects. Choose an eligible plan and try again.';
  }
  if (limit === null) {
    return `${label} accounts have no Project limit from your plan. This request hit an account-level limit; contact support if it persists.`;
  }
  return `${label} accounts can have up to ${limit} ${limit === 1 ? 'Project' : 'Projects'}. Delete a Project or upgrade to add another.`;
}

export function getCustomRemoteMcpLimitErrorMessage(planTier: string | null | undefined): string {
  const limit = getCustomRemoteMcpLimit(planTier);
  const label = planTier ? SAFE_PLAN_LABELS[planTier.toLowerCase()] : undefined;
  if (!label || limit === 0) {
    return 'Your current subscription does not allow custom connectors. Choose an eligible plan and try again.';
  }
  if (limit === null) {
    return `${label} accounts have no custom connector limit from your plan. This request hit an account-level limit; contact support if it persists.`;
  }
  return `${label} accounts can add up to ${limit} custom connector${limit === 1 ? '' : 's'}. Remove one or upgrade to add another.`;
}

export function isUserResourceLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  return (
    record['code'] === 'P0001' &&
    String(record['message'] ?? '').includes('user_resource_limit_reached')
  );
}

import 'server-only';

import { getBillingPlanProductLimits, toEnforceableBillingPlanLimit } from '@agiworkforce/types';

export function getProjectLimit(planTier: string | null | undefined): number | null {
  return toEnforceableBillingPlanLimit(getBillingPlanProductLimits(planTier)?.projects);
}

export function getCustomRemoteMcpLimit(planTier: string | null | undefined): number | null {
  return toEnforceableBillingPlanLimit(getBillingPlanProductLimits(planTier)?.customMcpServers);
}

/**
 * Total bytes of project knowledge files the plan allows across all projects.
 * `null` means uncapped (Max) or negotiated (Enterprise).
 *
 * Only a per-file byte cap and a per-project file COUNT cap existed, so a user
 * could hold unbounded total storage by spreading large files across projects.
 */
export function getKnowledgeStorageLimitBytes(planTier: string | null | undefined): number | null {
  return toEnforceableBillingPlanLimit(
    getBillingPlanProductLimits(planTier)?.knowledgeStorageBytes,
  );
}

/** Human-readable byte size for a limit message. */
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
  free: 'Free',
  basic: 'Basic',
  pro: 'Pro',
  max: 'Max 5x',
  max_15x: 'Max 15x',
  team: 'Team',
  enterprise: 'Enterprise',
});

export function getProjectLimitErrorMessage(planTier: string | null | undefined): string {
  const limit = getProjectLimit(planTier);
  const label = planTier ? SAFE_PLAN_LABELS[planTier.toLowerCase()] : undefined;
  if (!label || limit === 0) {
    return 'Your current subscription does not allow Managed Cloud Projects. Choose an eligible plan and try again.';
  }
  // `null` is uncapped by the product table (Max/Enterprise). Reaching this
  // message means an account-level ceiling fired, not that the plan disallows
  // Projects — saying "does not allow" here would be false.
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

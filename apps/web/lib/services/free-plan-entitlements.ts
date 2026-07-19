import 'server-only';

import { getBillingPlanProductLimits, type BillingPlanLimit } from '@agiworkforce/types';

function toEnforceableLimit(limit: BillingPlanLimit | undefined): number | null {
  if (limit === 'unlimited') return null;
  return typeof limit === 'number' ? limit : 0;
}

export function getProjectLimit(planTier: string | null | undefined): number | null {
  return toEnforceableLimit(getBillingPlanProductLimits(planTier)?.projects);
}

export function getCustomRemoteMcpLimit(planTier: string | null | undefined): number | null {
  return toEnforceableLimit(getBillingPlanProductLimits(planTier)?.customMcpServers);
}

const SAFE_PLAN_LABELS: Readonly<Record<string, string>> = Object.freeze({
  free: 'Free',
  basic: 'Basic',
  pro: 'Pro',
  max: 'Max 5x',
  max_15x: 'Max 15x',
  team: 'Team',
});

export function getProjectLimitErrorMessage(planTier: string | null | undefined): string {
  const limit = getProjectLimit(planTier);
  const label = planTier ? SAFE_PLAN_LABELS[planTier.toLowerCase()] : undefined;
  if (!label || limit === 0 || limit === null) {
    return 'Your current subscription does not allow Managed Cloud Projects. Choose an eligible plan and try again.';
  }
  return `${label} accounts can have up to ${limit} ${limit === 1 ? 'Project' : 'Projects'}. Delete a Project or upgrade to add another.`;
}

export function getCustomRemoteMcpLimitErrorMessage(planTier: string | null | undefined): string {
  const limit = getCustomRemoteMcpLimit(planTier);
  const label = planTier ? SAFE_PLAN_LABELS[planTier.toLowerCase()] : undefined;
  if (!label || limit === 0 || limit === null) {
    return 'Your current subscription does not allow custom connectors. Choose an eligible plan and try again.';
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

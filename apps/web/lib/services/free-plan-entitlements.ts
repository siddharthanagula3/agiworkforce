import 'server-only';

import { isFreePlanTier } from '@/lib/services/free-trial-service';

export const FREE_PROJECT_LIMIT = 5;
export const FREE_CUSTOM_REMOTE_MCP_LIMIT = 1;
export const PAID_CUSTOM_REMOTE_MCP_LIMIT = 10;

export function getProjectLimit(planTier: string | null | undefined): number | null {
  return !planTier || isFreePlanTier(planTier) ? FREE_PROJECT_LIMIT : null;
}

export function getCustomRemoteMcpLimit(planTier: string | null | undefined): number {
  return !planTier || isFreePlanTier(planTier)
    ? FREE_CUSTOM_REMOTE_MCP_LIMIT
    : PAID_CUSTOM_REMOTE_MCP_LIMIT;
}

export function isUserResourceLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  return (
    record['code'] === 'P0001' &&
    String(record['message'] ?? '').includes('user_resource_limit_reached')
  );
}

'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getAuthToken } from '@shared/lib/get-auth-token';

export interface UsageTotals {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}

export interface UsageBreakdownRow {
  key: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}

export interface UsageDayRow {
  day: string;
  requests: number;
  costCents: number;
}

export interface WorkspaceUsage {
  organizationId: string;
  from: string;
  to: string;
  totals: UsageTotals;
  byMember: UsageBreakdownRow[];
  byModel: UsageBreakdownRow[];
  byProvider: UsageBreakdownRow[];
  daily: UsageDayRow[];
}

export interface WorkspaceUsageResult {
  currentUserRole: 'owner' | 'admin' | 'member' | 'viewer';
  usage: WorkspaceUsage;
}

export const WORKSPACE_USAGE_QUERY_KEY = ['workspace', 'usage-analytics'] as const;

/** `null` means the caller is not an owner or admin — a 403, not an error. */
export function useWorkspaceUsage(
  days: number,
): UseQueryResult<WorkspaceUsageResult | null, Error> {
  return useQuery<WorkspaceUsageResult | null, Error>({
    queryKey: [...WORKSPACE_USAGE_QUERY_KEY, days],
    queryFn: async () => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');

      const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const res = await fetch(
        `/api/settings/organization/usage-analytics?from=${encodeURIComponent(from)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.status === 403) return null;
      if (!res.ok) throw new Error(`Failed to load workspace usage (${res.status})`);
      return (await res.json()) as WorkspaceUsageResult;
    },
    staleTime: 60 * 1000,
    meta: { errorMessage: 'Failed to load workspace usage' },
  });
}

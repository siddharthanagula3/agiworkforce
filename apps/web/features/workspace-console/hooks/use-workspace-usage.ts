'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getAuthToken } from '@shared/lib/get-auth-token';
import { httpStatusMessage } from '@/lib/user-error-message';

import type { OrganizationUsageResponse } from '@/app/api/settings/organization/usage-analytics/route';
export type { UsageBreakdownRow, UsageDayRow } from '@/lib/services/organization-usage-service';

type WorkspaceUsageResult = OrganizationUsageResponse;

export const WORKSPACE_USAGE_QUERY_KEY = ['workspace', 'usage-analytics'] as const;

export function useWorkspaceUsage(
  days: number,
): UseQueryResult<WorkspaceUsageResult | null, Error> {
  return useQuery<WorkspaceUsageResult | null, Error>({
    queryKey: [...WORKSPACE_USAGE_QUERY_KEY, days],
    queryFn: async () => {
      const token = await getAuthToken();
      if (!token) throw Object.assign(new Error(httpStatusMessage(401)!), { status: 401 });

      const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const res = await fetch(
        `/api/settings/organization/usage-analytics?from=${encodeURIComponent(from)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.status === 403) return null;
      if (!res.ok) {
        throw Object.assign(
          new Error(
            httpStatusMessage(res.status) ?? 'We could not load workspace usage. Try again.',
          ),
          { status: res.status },
        );
      }
      return (await res.json()) as WorkspaceUsageResult;
    },
    staleTime: 60 * 1000,
    meta: { errorMessage: 'Failed to load workspace usage' },
  });
}

'use client';

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { DomainRetentionPolicy, RetentionDomain } from '@agiworkforce/types';
import { getAuthToken } from '@shared/lib/get-auth-token';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';
import type { RetentionSweepOutcome } from './use-legal-holds';

export interface DomainRetentionSweep {
  id: string;
  domain: RetentionDomain;
  retentionDays: number;
  cutoff: string;
  outcome: RetentionSweepOutcome;
  recordsDeleted: number;
  recordsHeld: number;
  objectsDeleted: number;
  objectsFailed: number;
  activeHolds: number;
  error: string | null;
  createdAt: string;
}

export interface DomainRetentionResult {
  organizationId: string;
  canManageRetention: boolean;
  policies: DomainRetentionPolicy[];
  sweeps: DomainRetentionSweep[];
}

export const DOMAIN_RETENTION_QUERY_KEY = ['workspace', 'domain-retention'] as const;

const ENDPOINT = '/api/settings/organization/retention';

async function readApiError(res: Response): Promise<string> {
  const fallback = `Request failed (${res.status}).`;
  try {
    const body = (await res.json()) as { error?: { message?: string } | string };
    const raw = typeof body.error === 'string' ? body.error : (body.error?.message ?? '');
    if (!raw.trim()) return fallback;
    return toUserMessage(Object.assign(new Error(raw), { status: res.status }), fallback);
  } catch {
    return fallback;
  }
}

export function useDomainRetention(): UseQueryResult<DomainRetentionResult | null, Error> {
  return useQuery<DomainRetentionResult | null, Error>({
    queryKey: DOMAIN_RETENTION_QUERY_KEY,
    queryFn: async () => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');
      const res = await fetch(ENDPOINT, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 403) return null;
      if (!res.ok) throw new Error(await readApiError(res));
      return (await res.json()) as DomainRetentionResult;
    },
    staleTime: 30 * 1000,
    meta: { errorMessage: 'Failed to load data retention' },
  });
}

export function useSaveDomainRetention() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      policies: ReadonlyArray<Pick<DomainRetentionPolicy, 'domain' | 'retentionDays' | 'enforced'>>,
    ) => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');
      const res = await fetch(ENDPOINT, {
        method: 'PUT',
        headers: await addCsrfHeaders({
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ policies }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      return (await res.json()) as DomainRetentionResult;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(DOMAIN_RETENTION_QUERY_KEY, data);
    },
  });
}

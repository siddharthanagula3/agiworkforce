'use client';

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { getAuthToken } from '@shared/lib/get-auth-token';
import { addCsrfHeaders } from '@/lib/client/csrf';

export type LegalHoldScope = 'organization' | 'member';

export interface LegalHold {
  id: string;
  organizationId: string;
  name: string;
  reason: string | null;
  scope: LegalHoldScope;
  subjectUserId: string | null;
  createdByUserId: string;
  releasedAt: string | null;
  releasedByUserId: string | null;
  createdAt: string;
}

export type RetentionSweepOutcome = 'deleted' | 'nothing_due' | 'held' | 'aborted' | 'failed';

export interface RetentionSweepRecord {
  id: string;
  retentionDays: number;
  cutoff: string;
  outcome: RetentionSweepOutcome;
  conversationsDeleted: number;
  conversationsHeld: number;
  activeHolds: number;
  dryRun: boolean;
  error: string | null;
  createdAt: string;
}

export interface LegalHoldsResult {
  organizationId: string;
  currentUserRole: 'owner' | 'admin' | 'member' | 'viewer';
  canManageHolds: boolean;
  holds: LegalHold[];
  sweeps: RetentionSweepRecord[];
}

export const LEGAL_HOLDS_QUERY_KEY = ['workspace', 'legal-holds'] as const;

const ENDPOINT = '/api/settings/organization/legal-holds';

async function readApiError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } | string };
    if (typeof body.error === 'string') return body.error;
    return body.error?.message ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

/** `null` means the caller is not an owner or admin — a 403, not an error. */
export function useLegalHolds(): UseQueryResult<LegalHoldsResult | null, Error> {
  return useQuery<LegalHoldsResult | null, Error>({
    queryKey: LEGAL_HOLDS_QUERY_KEY,
    queryFn: async () => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');

      const res = await fetch(ENDPOINT, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 403) return null;
      if (!res.ok) throw new Error(await readApiError(res));
      return (await res.json()) as LegalHoldsResult;
    },
    staleTime: 30 * 1000,
    meta: { errorMessage: 'Failed to load legal holds' },
  });
}

export function useCreateLegalHold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      reason: string | null;
      scope: LegalHoldScope;
      subjectUserId: string | null;
    }) => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');

      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: await addCsrfHeaders({
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      return (await res.json()) as { hold: LegalHold };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LEGAL_HOLDS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'posture'] });
    },
  });
}

export function useReleaseLegalHold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (holdId: string) => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');

      const res = await fetch(ENDPOINT, {
        method: 'DELETE',
        headers: await addCsrfHeaders({
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ holdId }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      return (await res.json()) as { hold: LegalHold };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LEGAL_HOLDS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'posture'] });
    },
  });
}

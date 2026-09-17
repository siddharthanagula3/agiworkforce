'use client';

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { getAuthToken } from '@shared/lib/get-auth-token';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';

export interface AuditDestination {
  organizationId: string;
  endpointUrl: string;
  secretPrefix: string;
  enabled: boolean;
  lastDeliveredAt: string | null;
  lastAttemptAt: string | null;
  lastStatus: string | null;
  consecutiveFailures: number;
  createdAt: string;
}

export interface AuditDestinationResult {
  organizationId: string;
  destination: AuditDestination | null;
}

export interface SavedAuditDestinationResult extends AuditDestinationResult {
  signingSecret: string;
}

export const AUDIT_DESTINATION_QUERY_KEY = ['workspace', 'audit-destination'] as const;

const ENDPOINT = '/api/settings/organization/audit/destination';

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

async function send<T>(method: string, body?: unknown): Promise<T> {
  const token = await getAuthToken();
  if (!token) throw new Error('User not authenticated');

  const res = await fetch(ENDPOINT, {
    method,
    headers: await addCsrfHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return (await res.json()) as T;
}

export function useAuditDestination(): UseQueryResult<AuditDestinationResult | null, Error> {
  return useQuery<AuditDestinationResult | null, Error>({
    queryKey: AUDIT_DESTINATION_QUERY_KEY,
    queryFn: async () => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');

      const res = await fetch(ENDPOINT, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 403) return null;
      if (!res.ok) throw new Error(await readApiError(res));
      return (await res.json()) as AuditDestinationResult;
    },
    staleTime: 30 * 1000,
    meta: { errorMessage: 'Failed to load the audit destination' },
  });
}

function useDestinationMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: AUDIT_DESTINATION_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'posture'] });
    },
  });
}

export function useSaveAuditDestination() {
  return useDestinationMutation((input: { endpointUrl: string; enabled: boolean }) =>
    send<SavedAuditDestinationResult>('PUT', input),
  );
}

export function useToggleAuditDestination() {
  return useDestinationMutation((enabled: boolean) =>
    send<AuditDestinationResult>('PATCH', { enabled }),
  );
}

export function useDeleteAuditDestination() {
  return useDestinationMutation<void, AuditDestinationResult>(() =>
    send<AuditDestinationResult>('DELETE'),
  );
}

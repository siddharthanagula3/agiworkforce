'use client';

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  CONNECTOR_POLICY_PATH,
  ConnectorPolicyResponseSchema,
  type ConnectorPolicyResponse,
  type UpdateConnectorPolicyRequest,
} from '@agiworkforce/cloud-contracts';
import { getAuthToken } from '@shared/lib/get-auth-token';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';

export type ConnectorPolicyLists = UpdateConnectorPolicyRequest;
export type ConnectorPolicyResult = ConnectorPolicyResponse;

export const CONNECTOR_POLICY_QUERY_KEY = ['workspace', 'connector-policy'] as const;

const UNREADABLE_POLICY = 'The connector policy could not be read. Try again.';

async function readPolicy(res: Response): Promise<ConnectorPolicyResult> {
  const parsed = ConnectorPolicyResponseSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new Error(UNREADABLE_POLICY);
  return parsed.data;
}

async function readApiError(res: Response): Promise<string> {
  const fallback = `Request failed (${res.status}).`;
  try {
    const body = (await res.json()) as { error?: { message?: string } | string };
    const raw = typeof body.error === 'string' ? body.error : (body.error?.message ?? '');
    if (!raw.trim()) return fallback;
    // The server's words reach the screen, so they pass the same filter the
    // rest of the product uses: a sentence somebody wrote survives, a trace id
    // or a stack frame does not.
    return toUserMessage(Object.assign(new Error(raw), { status: res.status }), fallback);
  } catch {
    return fallback;
  }
}

export function useConnectorPolicy(): UseQueryResult<ConnectorPolicyResult | null, Error> {
  return useQuery<ConnectorPolicyResult | null, Error>({
    queryKey: CONNECTOR_POLICY_QUERY_KEY,
    queryFn: async () => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');
      const res = await fetch(CONNECTOR_POLICY_PATH, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) return null;
      if (!res.ok) throw new Error(await readApiError(res));
      return readPolicy(res);
    },
    staleTime: 60 * 1000,
    meta: { errorMessage: 'Failed to load the connector policy' },
  });
}

export function useUpdateConnectorPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (lists: ConnectorPolicyLists) => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');
      const res = await fetch(CONNECTOR_POLICY_PATH, {
        method: 'PUT',
        headers: await addCsrfHeaders({
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(lists),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      return readPolicy(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CONNECTOR_POLICY_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'posture'] });
    },
  });
}

'use client';

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { OrganizationPermission } from '@agiworkforce/types';
import { getAuthToken } from '@shared/lib/get-auth-token';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';

export interface WorkspaceApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: OrganizationPermission[];
  createdBy: string | null;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface WorkspaceApiKeysResult {
  organizationId: string;
  canManageKeys: boolean;
  grantableScopes: OrganizationPermission[];
  keys: WorkspaceApiKey[];
}

export const ADMIN_API_KEYS_QUERY_KEY = ['workspace', 'admin-api-keys'] as const;

const ENDPOINT = '/api/settings/organization/admin-api-keys';

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

async function send(method: 'POST' | 'DELETE', body: unknown): Promise<Response> {
  const token = await getAuthToken();
  if (!token) throw new Error('User not authenticated');
  const res = await fetch(ENDPOINT, {
    method,
    headers: await addCsrfHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return res;
}

export function useWorkspaceApiKeys(): UseQueryResult<WorkspaceApiKeysResult | null, Error> {
  return useQuery<WorkspaceApiKeysResult | null, Error>({
    queryKey: ADMIN_API_KEYS_QUERY_KEY,
    queryFn: async () => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');
      const res = await fetch(ENDPOINT, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 403) return null;
      if (!res.ok) throw new Error(await readApiError(res));
      return (await res.json()) as WorkspaceApiKeysResult;
    },
    staleTime: 30 * 1000,
    meta: { errorMessage: 'Failed to load workspace API keys' },
  });
}

export function useCreateWorkspaceApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      scopes: OrganizationPermission[];
      expiresInDays: number | null;
    }) => (await (await send('POST', input)).json()) as { key: string; record: WorkspaceApiKey },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_API_KEYS_QUERY_KEY });
    },
  });
}

export function useRevokeWorkspaceApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (keyId: string) =>
      (await (await send('DELETE', { keyId })).json()) as { record: WorkspaceApiKey },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_API_KEYS_QUERY_KEY });
    },
  });
}

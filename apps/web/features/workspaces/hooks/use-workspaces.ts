'use client';

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { PERSONAL_WORKSPACE_SELECTOR, type WorkspaceSummary } from '@agiworkforce/types';
import { getAuthToken } from '@shared/lib/get-auth-token';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';
import { finalizeWorkspaceSwitch } from '@/features/workspaces/lib/workspace-cache-scope';

export const WORKSPACES_QUERY_KEY = ['workspaces'] as const;

export interface AccountWorkspaces {
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
  activeOrganizationId: string | null;
  scope: 'personal' | 'organization';
}

async function readApiError(res: Response, fallback: string): Promise<Error> {
  let raw = '';
  try {
    const body = (await res.json()) as { error?: { message?: unknown } | string } | null;
    const message = typeof body?.error === 'string' ? body.error : body?.error?.message;
    if (typeof message === 'string') raw = message;
  } catch {
    raw = '';
  }
  const error = Object.assign(new Error(raw), { status: res.status });
  error.message = toUserMessage(error, fallback);
  return error;
}

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await getAuthToken();
  if (!token) {
    throw Object.assign(new Error('Your session has expired. Sign in again to continue.'), {
      status: 401,
    });
  }
  const method = init.method ?? 'GET';
  const baseHeaders: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (init.body) baseHeaders['Content-Type'] = 'application/json';
  const headers = method === 'GET' ? baseHeaders : await addCsrfHeaders(baseHeaders);
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    throw await readApiError(
      res,
      method === 'GET'
        ? 'We could not load your workspaces. Try again.'
        : 'We could not switch workspaces. Try again.',
    );
  }
  return (await res.json()) as T;
}

// Every surface reads this one endpoint, so the set a person can switch
// between is the same everywhere they sign in.
export function useAccountWorkspaces(): UseQueryResult<AccountWorkspaces, Error> {
  return useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: () => requestJson<AccountWorkspaces>('/api/settings/workspaces'),
    staleTime: 60 * 1000,
    meta: { errorMessage: 'Failed to load workspaces' },
  });
}

export function useSelectWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workspaceId: string | null) =>
      requestJson<{ activeOrganizationId: string | null }>('/api/settings/workspaces', {
        method: 'PUT',
        body: JSON.stringify({ workspaceId: workspaceId ?? PERSONAL_WORKSPACE_SELECTOR }),
      }),
    onSuccess: async ({ activeOrganizationId }) => {
      await finalizeWorkspaceSwitch(queryClient, activeOrganizationId);
    },
  });
}

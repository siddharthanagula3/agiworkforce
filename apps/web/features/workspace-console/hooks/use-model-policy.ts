'use client';

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { getAuthToken } from '@shared/lib/get-auth-token';
import { addCsrfHeaders } from '@/lib/client/csrf';

export interface CatalogModel {
  id: string;
  name: string;
  provider: string;
  live: boolean;
}

export interface ModelPolicyLists {
  allowedProviders: string[];
  blockedProviders: string[];
  allowedModels: string[];
  blockedModels: string[];
}

export interface ModelPolicyResult {
  organizationId: string;
  configured: boolean;
  canManagePolicy: boolean;
  currentUserRole: 'owner' | 'admin' | 'member' | 'viewer';
  policy: ModelPolicyLists & { updatedAt: string | null };
  catalog: { models: CatalogModel[]; providers: string[] };
}

export const MODEL_POLICY_QUERY_KEY = ['workspace', 'model-policy'] as const;

const ENDPOINT = '/api/settings/organization/model-policy';

async function readApiError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } | string };
    if (typeof body.error === 'string') return body.error;
    return body.error?.message ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

/** `null` means the caller is not entitled or not a member — a 403, not an error. */
export function useModelPolicy(): UseQueryResult<ModelPolicyResult | null, Error> {
  return useQuery<ModelPolicyResult | null, Error>({
    queryKey: MODEL_POLICY_QUERY_KEY,
    queryFn: async () => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');

      const res = await fetch(ENDPOINT, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 403) return null;
      if (!res.ok) throw new Error(await readApiError(res));
      return (await res.json()) as ModelPolicyResult;
    },
    staleTime: 60 * 1000,
    meta: { errorMessage: 'Failed to load the model policy' },
  });
}

export function useUpdateModelPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (lists: ModelPolicyLists) => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');

      const res = await fetch(ENDPOINT, {
        method: 'PUT',
        headers: await addCsrfHeaders({
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(lists),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      return (await res.json()) as ModelPolicyResult;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MODEL_POLICY_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'posture'] });
    },
  });
}

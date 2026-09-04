'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getAuthToken } from '@shared/lib/get-auth-token';

export type PostureEnforcement = 'enforced' | 'stated' | 'unconfigured';
export type PostureState = 'ok' | 'attention' | 'off';

export interface PostureSignal {
  id: string;
  label: string;
  value: string;
  state: PostureState;
  enforcement: PostureEnforcement;
  detail: string;
  href?: string;
}

export interface PostureGroup {
  id: string;
  title: string;
  signals: PostureSignal[];
}

export interface PostureRecommendation {
  id: string;
  title: string;
  body: string;
  href: string;
  cta: string;
}

export interface WorkspacePosture {
  organizationId: string;
  organizationName: string | null;
  generatedAt: string;
  groups: PostureGroup[];
  recommendations: PostureRecommendation[];
}

export interface WorkspacePostureResult {
  currentUserRole: 'owner' | 'admin' | 'member' | 'viewer';
  posture: WorkspacePosture;
}

export const WORKSPACE_POSTURE_QUERY_KEY = ['workspace', 'posture'] as const;

/**
 * `null` means the caller is not an owner or admin of an entitled workspace.
 * a 403, which is a legitimate state for a personal account or a plain member,
 * not an error worth a red banner.
 */
export function useWorkspacePosture(): UseQueryResult<WorkspacePostureResult | null, Error> {
  return useQuery<WorkspacePostureResult | null, Error>({
    queryKey: WORKSPACE_POSTURE_QUERY_KEY,
    queryFn: async (): Promise<WorkspacePostureResult | null> => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');

      const res = await fetch('/api/settings/organization/posture', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 403) return null;
      if (!res.ok) {
        throw new Error(`Failed to load the workspace posture (${res.status})`);
      }

      return (await res.json()) as WorkspacePostureResult;
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    meta: { errorMessage: 'Failed to load the workspace posture' },
  });
}

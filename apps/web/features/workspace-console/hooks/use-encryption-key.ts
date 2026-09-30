'use client';

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { sendAuthorizedJson } from '@/features/auth/step-up-fetch';
import { useStepUp } from '@/features/settings/hooks/use-step-up';
import { getAuthToken } from '@shared/lib/get-auth-token';
import { toUserMessage } from '@/lib/user-error-message';
import type { KeyRewrapState } from '@agiworkforce/types/encryption-key';

const KEYS_PATH = '/api/settings/organization/keys';
const REWRAP_PATH = '/api/settings/organization/keys/rewrap';

export const ENCRYPTION_KEY_QUERY_KEY = ['workspace', 'encryption-key'] as const;

export type KeyProviderId = 'aws_kms' | 'gcp_kms' | 'azure_key_vault';

export interface KeyDescriptor {
  provider: KeyProviderId | 'local';
  keyUri: string;
  region: string;
}

export type KeyAvailability =
  | { state: 'platform_derived'; keyId: string }
  | { state: 'platform_unconfigured' }
  | { state: 'customer_managed'; descriptor: KeyDescriptor; keyVersion: string }
  | { state: 'revoked' }
  | { state: 'unavailable'; descriptor: KeyDescriptor; reason: string };

export interface KeyRewrapRun {
  fromVersion: string;
  toVersion: string;
  state: KeyRewrapState;
  scanned: number;
  resealed: number;
  remaining: number;
  failureCount: number;
  lastError: string | null;
  completedAt: string | null;
}

export interface WorkspaceEncryptionKey {
  organizationId: string;
  status: {
    availability: KeyAvailability;
    lastRotatedAt: string | null;
    revokedAt: string | null;
  };
  activeVersion: string | null;
  retiredVersions: string[];
  rewrapRuns: KeyRewrapRun[];
  canRevoke: boolean;
}

export type EncryptionKeyLookup =
  { kind: 'ready'; key: WorkspaceEncryptionKey } | { kind: 'refused'; message: string };

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } | string };
    const raw = typeof body.error === 'string' ? body.error : (body.error?.message ?? '');
    if (!raw.trim()) return fallback;
    return toUserMessage(Object.assign(new Error(raw), { status: response.status }), fallback);
  } catch {
    return fallback;
  }
}

export function useWorkspaceEncryptionKey(): UseQueryResult<EncryptionKeyLookup, Error> {
  return useQuery({
    queryKey: ENCRYPTION_KEY_QUERY_KEY,
    queryFn: async (): Promise<EncryptionKeyLookup> => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');
      const response = await fetch(KEYS_PATH, { headers: { Authorization: `Bearer ${token}` } });
      if (response.status === 403) {
        return {
          kind: 'refused',
          message: await readApiError(response, 'This workspace cannot manage its own key.'),
        };
      }
      if (!response.ok) {
        throw new Error(await readApiError(response, 'The encryption key could not be loaded.'));
      }
      return { kind: 'ready', key: (await response.json()) as WorkspaceEncryptionKey };
    },
    staleTime: 30 * 1000,
    meta: { errorMessage: 'Failed to load the workspace encryption key' },
  });
}

export type EncryptionKeyChange =
  | { kind: 'connect'; descriptor: KeyDescriptor }
  | { kind: 'rotate'; activeVersion: string }
  | { kind: 'replace'; activeVersion: string; descriptor: KeyDescriptor }
  | { kind: 'rewrap'; fromVersion: string }
  | { kind: 'retire'; fromVersion: string; reason: string }
  | { kind: 'revoke'; organizationId: string; reason: string };

function requestFor(change: EncryptionKeyChange): {
  url: string;
  method: string;
  body: unknown;
  resourceId: string | null;
} {
  switch (change.kind) {
    case 'connect':
      return { url: KEYS_PATH, method: 'POST', body: change.descriptor, resourceId: null };
    case 'rotate':
      return {
        url: KEYS_PATH,
        method: 'PUT',
        body: { action: 'rotate' },
        resourceId: change.activeVersion,
      };
    case 'replace':
      return {
        url: KEYS_PATH,
        method: 'PUT',
        body: { action: 'replace', ...change.descriptor },
        resourceId: change.activeVersion,
      };
    case 'rewrap':
      return {
        url: REWRAP_PATH,
        method: 'POST',
        body: { fromVersion: change.fromVersion },
        resourceId: null,
      };
    case 'retire':
      return {
        url: REWRAP_PATH,
        method: 'POST',
        body: { fromVersion: change.fromVersion, retire: true, reason: change.reason },
        resourceId: change.fromVersion,
      };
    case 'revoke':
      return {
        url: KEYS_PATH,
        method: 'DELETE',
        body: { reason: change.reason },
        resourceId: change.organizationId,
      };
  }
}

export function useChangeEncryptionKey() {
  const queryClient = useQueryClient();
  const { withStepUp, dialog } = useStepUp();

  const mutation = useMutation<void, Error, EncryptionKeyChange>({
    mutationFn: async (change) => {
      const { url, method, body, resourceId } = requestFor(change);
      const response = await withStepUp(
        (headers) => sendAuthorizedJson(url, { method, body }, headers),
        resourceId,
      );
      if (!response.ok) {
        throw new Error(await readApiError(response, 'The encryption key was not changed.'));
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ENCRYPTION_KEY_QUERY_KEY }),
  });

  return { ...mutation, stepUpDialog: dialog };
}

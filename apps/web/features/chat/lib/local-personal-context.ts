'use client';

import { useEffect } from 'react';
import {
  managedMemoryLocalContextUrl,
  parseManagedMemoryLocalContextResponse,
  type ManagedMemoryLocalContextResponse,
} from '@agiworkforce/types';
import { useLocalModelSelection } from '@features/desktop-host';
import { queryClient } from '@shared/stores/query-client';

const LOCAL_PERSONAL_CONTEXT_STALE_MS = 60_000;

function localPersonalContextKey(projectId: string | null) {
  return ['memory', 'local-context', projectId ?? 'account'] as const;
}

async function fetchLocalPersonalContext(
  projectId: string | null,
  signal: AbortSignal,
): Promise<ManagedMemoryLocalContextResponse> {
  const response = await fetch(managedMemoryLocalContextUrl(projectId), {
    signal,
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Your instructions and memory could not be loaded (${response.status})`);
  }
  const context = parseManagedMemoryLocalContextResponse(await response.json());
  if (!context) throw new Error('Your instructions and memory came back in an unexpected shape');
  return context;
}

export function useLocalPersonalContextPrefetch(projectId: string | null): void {
  const localModelSelected = useLocalModelSelection((state) => state.selected !== null);
  useEffect(() => {
    if (!localModelSelected) return;
    const refresh = () => {
      void queryClient.prefetchQuery({
        queryKey: localPersonalContextKey(projectId),
        queryFn: ({ signal }) => fetchLocalPersonalContext(projectId, signal),
        staleTime: LOCAL_PERSONAL_CONTEXT_STALE_MS,
        gcTime: Infinity,
        meta: { silent: true },
      });
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [localModelSelected, projectId]);
}

export function readLocalPersonalContext(
  projectId: string | null,
): ManagedMemoryLocalContextResponse | null {
  return (
    queryClient.getQueryData<ManagedMemoryLocalContextResponse>(
      localPersonalContextKey(projectId),
    ) ?? null
  );
}

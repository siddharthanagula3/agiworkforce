import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach } from 'vitest';
import { ManagedCloudAccountWorkspacesSchema } from '@agiworkforce/cloud-contracts';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import {
  admitWorkspace,
  observeWorkspaceOwner,
  workspaceQueryKey,
} from '@/features/workspaces/lib/workspace-admission';
import { cloudMemoryScopeKey } from '@/features/memory/cloud-memory-controller';

export function createWebChatWorkspaceFixture() {
  const data = ManagedCloudAccountWorkspacesSchema.parse({
    scope: 'personal',
    activeWorkspaceId: 'personal',
    activeOrganizationId: null,
    workspaces: [],
  });
  const scopeKey = cloudMemoryScopeKey(data);
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    });
  });

  afterEach(() => {
    observeWorkspaceOwner(null);
    client.clear();
  });

  function Wrapper({ children }: { children: ReactNode }) {
    const capture = useSessionSnapshot();
    const owner = observeWorkspaceOwner(capture());
    if (owner?.phase === 'resolving' && owner.scopeKey === null) {
      admitWorkspace(owner, owner.epoch, scopeKey);
    }
    if (owner?.phase === 'admitted' && owner.scopeKey === scopeKey) {
      const key = workspaceQueryKey(owner);
      if (client.getQueryData(key) === undefined) client.setQueryData(key, data);
    }
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  return { wrapper: Wrapper };
}

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ManagedCloudAccountWorkspacesSchema,
  type ManagedCloudAccountWorkspaces,
} from '@agiworkforce/cloud-contracts';
import type { SessionAuthority } from '@/lib/identity/request-authority';
import {
  admitWorkspace,
  observeWorkspaceOwner,
  workspaceQueryKey,
} from '@/features/workspaces/lib/workspace-admission';
import { cloudMemoryScopeKey } from '../cloud-memory-controller';

let active: SessionAuthority | null = null;
let sequence = 0;
export const getCloudMemoryFixtureSession = () => active;

export function createCloudMemoryFixture(
  options: { data?: ManagedCloudAccountWorkspaces; admitted?: boolean } = {},
) {
  const data = ManagedCloudAccountWorkspacesSchema.parse(
    options.data ?? {
      scope: 'personal',
      activeWorkspaceId: 'personal',
      activeOrganizationId: null,
      workspaces: [],
    },
  );
  let current = true;
  const session: SessionAuthority = {
    userId: `cloud-memory-view-${++sequence}`,
    sessionId: `cloud-memory-session-${sequence}`,
    isCurrent: () => current && active === session,
    getToken: async () => (current && active === session ? `fixture-token-${sequence}` : null),
  };
  active = session;
  const owner = observeWorkspaceOwner(session)!;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  if (options.admitted !== false) {
    admitWorkspace(owner, owner.epoch, cloudMemoryScopeKey(data));
    queryClient.setQueryData(workspaceQueryKey(owner), data);
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const retire = () => {
    current = false;
    if (active === session) {
      active = null;
      observeWorkspaceOwner(null);
    }
    queryClient.clear();
  };
  return { session, owner, data, queryClient, wrapper, retire };
}

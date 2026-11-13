'use client';

import { useEffect } from 'react';
import {
  managedMemoryLocalContextUrl,
  parseManagedMemoryLocalContextResponse,
  type ManagedMemoryLocalContextResponse,
} from '@agiworkforce/types';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';
import { useLocalModelSelection } from '@features/desktop-host';
import {
  createRequestAuthority,
  type RequestAuthority,
  type SessionAuthority,
} from '@/lib/identity/request-authority';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import { useAccountWorkspaces } from '@/features/workspaces/hooks/use-workspaces';
import {
  observeWorkspaceOwner,
  subscribeWorkspaceAdmission,
  workspaceOwnerIsCurrent,
  type WorkspaceOwner,
} from '@/features/workspaces/lib/workspace-admission';

const LOCAL_PERSONAL_CONTEXT_STALE_MS = 60_000;
interface Entry {
  data: ManagedMemoryLocalContextResponse | null;
  refreshedAt: number | null;
  pending: Promise<void> | null;
  request: RequestAuthority | null;
}
interface ContextOwner {
  owner: WorkspaceOwner;
  epoch: number;
  scopeKey: string;
  organization: string;
  entries: Map<string | null, Entry>;
}
let cached: ContextOwner | null = null;

function isCurrent(candidate: ContextOwner): boolean {
  return (
    cached === candidate &&
    candidate.owner.phase === 'admitted' &&
    candidate.owner.scopeKey === candidate.scopeKey &&
    workspaceOwnerIsCurrent(candidate.owner, candidate.epoch)
  );
}
function retire(candidate: ContextOwner): void {
  for (const entry of candidate.entries.values()) entry.request?.retire();
  candidate.entries.clear();
  if (cached === candidate) cached = null;
}
subscribeWorkspaceAdmission(() => {
  if (cached && !isCurrent(cached)) retire(cached);
});

async function refresh(candidate: ContextOwner, projectId: string | null): Promise<void> {
  if (!isCurrent(candidate)) return;
  let entry = candidate.entries.get(projectId);
  if (!entry) {
    entry = { data: null, refreshedAt: null, pending: null, request: null };
    candidate.entries.set(projectId, entry);
  }
  if (entry.pending) return entry.pending;
  if (
    entry.refreshedAt !== null &&
    Date.now() - entry.refreshedAt < LOCAL_PERSONAL_CONTEXT_STALE_MS
  )
    return;
  const captured = entry;
  const authority = createRequestAuthority(
    candidate.owner.session,
    () => isCurrent(candidate) && candidate.entries.get(projectId) === captured,
  );
  captured.request = authority;
  captured.pending = (async () => {
    try {
      const response = await authority.fetch(managedMemoryLocalContextUrl(projectId), {
        cache: 'no-store',
        headers: { [MANAGED_CLOUD_ORGANIZATION_HEADER]: candidate.organization },
      });
      authority.assertCurrent();
      // Rejection revokes only this captured entry, even if the body is malformed.
      if (response.status === 401 || response.status === 403) {
        captured.data = null;
        captured.refreshedAt = null;
      }
      if (!response.ok) return;
      const parsed = parseManagedMemoryLocalContextResponse(await response.json());
      authority.assertCurrent();
      if (parsed) {
        captured.data = parsed;
        captured.refreshedAt = Date.now();
      }
    } catch {
      // An offline refresh must not expire still-owned personal context.
    } finally {
      authority.retire();
      captured.request = null;
      captured.pending = null;
    }
  })();
  return captured.pending;
}

function resolveLocalContextCache(
  owner: WorkspaceOwner | null,
  epoch: number | undefined,
  scopeKey: string | null,
  organizationId: string | null | undefined,
): ContextOwner | null {
  if (cached && !isCurrent(cached)) retire(cached);
  if (
    owner &&
    owner.phase === 'admitted' &&
    scopeKey !== null &&
    scopeKey === owner.scopeKey &&
    epoch !== undefined &&
    workspaceOwnerIsCurrent(owner, epoch) &&
    !cached
  ) {
    cached = {
      owner,
      epoch,
      scopeKey,
      organization: organizationId ?? MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
      entries: new Map(),
    };
  }
  return cached;
}

export function useLocalPersonalContextPrefetch(projectId: string | null): void {
  const localModelSelected = useLocalModelSelection((state) => state.selected !== null);
  const workspace = useAccountWorkspaces();
  const capture = useSessionSnapshot();
  const owner = observeWorkspaceOwner(capture());
  const data = workspace.data;
  const scopeKey = data
    ? JSON.stringify([data.scope, data.activeWorkspaceId, data.activeOrganizationId])
    : null;
  const candidate = resolveLocalContextCache(
    owner,
    owner?.epoch,
    scopeKey,
    data?.activeOrganizationId,
  );
  useEffect(() => {
    if (!localModelSelected || !candidate) return;
    const onFocus = () => {
      void refresh(candidate, projectId);
    };
    onFocus();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [localModelSelected, candidate, projectId]);
}

export function readLocalPersonalContext(
  projectId: string | null,
  session: SessionAuthority | null,
): ManagedMemoryLocalContextResponse | null {
  const candidate = cached;
  // A turn only reads the canonical owner; a stale turn must never replace it.
  if (
    !candidate ||
    !session?.isCurrent() ||
    !isCurrent(candidate) ||
    candidate.owner.session.userId !== session.userId ||
    candidate.owner.session.sessionId !== session.sessionId
  )
    return null;
  return candidate.entries.get(projectId)?.data ?? null;
}

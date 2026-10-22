import { storage } from '@/lib/mmkv';
import type { ProjectSharingOverview } from '@/src/features/projects/projectSharing';

const keyFor = (accountId: string) => `shared-with-you:hidden-sharers:v1:${accountId}`;

export interface HiddenSharer {
  id: string;
  name: string;
}

export function hiddenSharers(accountId: string): HiddenSharer[] {
  try {
    const parsed: unknown = JSON.parse(storage.getString(keyFor(accountId)) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry: unknown): HiddenSharer[] => {
      if (typeof entry === 'string') return [{ id: entry, name: 'Someone' }];
      if (
        entry &&
        typeof entry === 'object' &&
        typeof (entry as HiddenSharer).id === 'string' &&
        typeof (entry as HiddenSharer).name === 'string'
      ) {
        return [{ id: (entry as HiddenSharer).id, name: (entry as HiddenSharer).name }];
      }
      return [];
    });
  } catch {
    return [];
  }
}

export function hiddenSharerIds(accountId: string): ReadonlySet<string> {
  return new Set(hiddenSharers(accountId).map((entry) => entry.id));
}

function writeHiddenSharers(accountId: string, entries: readonly HiddenSharer[]): void {
  storage.set(keyFor(accountId), JSON.stringify(entries));
}

export function hideSharer(accountId: string, sharerId: string, name: string): void {
  const rest = hiddenSharers(accountId).filter((entry) => entry.id !== sharerId);
  writeHiddenSharers(accountId, [...rest, { id: sharerId, name }]);
}

export function unhideSharer(accountId: string, sharerId: string): void {
  writeHiddenSharers(
    accountId,
    hiddenSharers(accountId).filter((entry) => entry.id !== sharerId),
  );
}

export function withoutHiddenSharers(overview: ProjectSharingOverview): ProjectSharingOverview {
  const hidden = hiddenSharerIds(overview.currentUserId);
  if (hidden.size === 0) return overview;
  const visible = (entry: { ownerUserId: string }) => !hidden.has(entry.ownerUserId);
  return {
    ...overview,
    sharedProjects: overview.sharedProjects.filter(visible),
    sharedConversations: overview.sharedConversations.filter(visible),
    sharedArtifacts: overview.sharedArtifacts.filter(visible),
    sharedConnectors: overview.sharedConnectors.filter(visible),
  };
}

export function withoutHiddenAgentSharers<
  T extends { isOwner: boolean; ownerUserId?: string | null },
>(hidden: ReadonlySet<string>, agents: readonly T[]): T[] {
  if (hidden.size === 0) return [...agents];
  return agents.filter(
    (agent) => agent.isOwner || !agent.ownerUserId || !hidden.has(agent.ownerUserId),
  );
}

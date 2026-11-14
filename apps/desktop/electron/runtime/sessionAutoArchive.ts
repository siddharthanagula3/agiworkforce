import type {
  DeveloperSessionGroup,
  DeveloperSessionList,
  LocalDeveloperSession,
} from '@agiworkforce/local-runtime-contract';

const DAY_MS = 86_400_000;
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_PER_SWEEP = 50;
const SETTLED_STATUSES: ReadonlySet<string> = new Set(['idle', 'failed']);

export function idleSessionsToArchive(
  groups: readonly DeveloperSessionGroup[],
  days: number,
  now: number,
): LocalDeveloperSession[] {
  if (days <= 0) return [];
  const cutoff = now - days * DAY_MS;
  const due: LocalDeveloperSession[] = [];
  for (const group of groups) {
    for (const session of group.sessions) {
      if (session.archivedAt !== undefined || session.pinned === true) continue;
      if (session.location === 'cloud' || session.environment === 'ssh') continue;
      if (!SETTLED_STATUSES.has(session.status)) continue;
      const updated = Date.parse(session.updatedAt);
      if (!Number.isFinite(updated) || updated >= cutoff) continue;
      due.push(session);
      if (due.length >= MAX_PER_SWEEP) return due;
    }
  }
  return due;
}

export interface AutoArchiveOptions {
  days: number;
  now: number;
  includeArchived: boolean;
  archive: (session: LocalDeveloperSession) => Promise<unknown>;
}

const lastSweepAt = new Map<string, number>();

export function resetAutoArchiveSweep(): void {
  lastSweepAt.clear();
}

/**
 * A folder whose sessions were not read, because the person has not allowed
 * commands there since the app started or its CLI is unavailable, has nothing
 * to sweep yet. Its interval starts only once its sessions are listed, or the
 * first list after every launch would use up the sweep.
 */
function dueForSweep(group: DeveloperSessionGroup, now: number): boolean {
  if (group.sessionsWithheld === true || group.unavailable !== undefined) return false;
  return now - (lastSweepAt.get(group.rootId) ?? Number.NEGATIVE_INFINITY) >= SWEEP_INTERVAL_MS;
}

/**
 * Archives sessions nobody has touched for the chosen number of days, using
 * the list the page already asked for so no folder's CLI is started just for
 * this. A session that is running, waiting, pinned, in the cloud or over SSH is
 * never archived, and archiving keeps everything: it can be restored.
 */
export async function archiveIdleSessions(
  list: DeveloperSessionList,
  options: AutoArchiveOptions,
): Promise<DeveloperSessionList> {
  if (options.days <= 0) return list;
  const due = list.groups.filter((group) => dueForSweep(group, options.now));
  if (due.length === 0) return list;
  for (const group of due) lastSweepAt.set(group.rootId, options.now);
  const archived = new Map<string, number>();
  for (const session of idleSessionsToArchive(due, options.days, options.now)) {
    try {
      await options.archive(session);
      archived.set(session.id, options.now);
    } catch {
      continue;
    }
  }
  if (archived.size === 0) return list;
  return {
    ...list,
    groups: list.groups.map((group) => ({
      ...group,
      sessions: options.includeArchived
        ? group.sessions.map((session) =>
            archived.has(session.id)
              ? { ...session, archivedAt: archived.get(session.id) as number }
              : session,
          )
        : group.sessions.filter((session) => !archived.has(session.id)),
    })),
  };
}

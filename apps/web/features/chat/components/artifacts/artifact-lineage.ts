import { UNTITLED_ARTIFACT_TITLE } from './artifact-labels';

export interface LineageCandidate {
  id: string;
  type: string;
  title?: string | null | undefined;
  createdAt?: Date | string | number | null | undefined;
}

function lineageKey(artifact: LineageCandidate): string | null {
  const title = artifact.title?.trim().toLowerCase();
  if (!title || title === UNTITLED_ARTIFACT_TITLE.toLowerCase()) return null;
  return `${artifact.type}:${title}`;
}

function createdAtMs(artifact: LineageCandidate): number {
  const value = artifact.createdAt;
  if (value === null || value === undefined) return Number.POSITIVE_INFINITY;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

/**
 * The artifacts in one conversation that are versions of the same thing: the
 * same kind under the same title, oldest first. A "Request edits" reply keeps
 * its artifact's title, which is what places it after the one it revised.
 */
export function artifactLineage<T extends LineageCandidate>(
  conversationArtifacts: readonly T[],
  current: T,
): T[] {
  const key = lineageKey(current);
  if (!key) return [current];
  const members = conversationArtifacts
    .map((artifact, index) => ({ artifact, index }))
    .filter(({ artifact }) => lineageKey(artifact) === key);
  if (!members.some(({ artifact }) => artifact.id === current.id)) {
    members.push({ artifact: current, index: members.length });
  }
  return members
    .sort(
      (left, right) =>
        createdAtMs(left.artifact) - createdAtMs(right.artifact) || left.index - right.index,
    )
    .map(({ artifact }) => artifact);
}

export interface VersionStep {
  artifactId: string;
  versionIndex: number | null;
}

export interface VersionTimeline {
  position: number;
  total: number;
  previous: VersionStep | null;
  next: VersionStep | null;
}

/**
 * One version sequence across a lineage: every stored version of the first
 * artifact, then of the next, and so on. Stepping back from an artifact's
 * first version lands on the previous artifact's latest; stepping forward
 * from its latest lands on the next artifact's first version.
 */
export function buildVersionTimeline(
  members: ReadonlyArray<{ id: string; versionCount: number }>,
  currentId: string,
  shownVersionIndex: number,
): VersionTimeline {
  const counts = members.map((member) => Math.max(1, member.versionCount));
  const currentIndex = Math.max(
    0,
    members.findIndex((member) => member.id === currentId),
  );
  const currentCount = counts[currentIndex] ?? 1;
  const shown = Math.min(Math.max(0, shownVersionIndex), currentCount - 1);
  const before = counts.slice(0, currentIndex).reduce((sum, count) => sum + count, 0);
  const total = counts.reduce((sum, count) => sum + count, 0);

  const previousMember = members[currentIndex - 1];
  const nextMember = members[currentIndex + 1];
  const previous: VersionStep | null =
    shown > 0
      ? { artifactId: currentId, versionIndex: shown - 1 }
      : previousMember
        ? { artifactId: previousMember.id, versionIndex: null }
        : null;
  const next: VersionStep | null =
    shown < currentCount - 1
      ? { artifactId: currentId, versionIndex: shown + 1 === currentCount - 1 ? null : shown + 1 }
      : nextMember
        ? {
            artifactId: nextMember.id,
            versionIndex: Math.max(1, nextMember.versionCount) > 1 ? 0 : null,
          }
        : null;

  return { position: before + shown + 1, total, previous, next };
}

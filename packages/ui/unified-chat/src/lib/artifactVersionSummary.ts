import { translateUiPlural } from '@agiworkforce/ui';

export interface VersionedContent {
  content: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ArtifactVersionSummary {
  index: number;
  when: string | null;
  change: string;
}

function countLines(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of text.split('\n')) counts.set(line, (counts.get(line) ?? 0) + 1);
  return counts;
}

export function artifactLineChange(
  previous: string,
  next: string,
): { added: number; removed: number } {
  const before = countLines(previous);
  const after = countLines(next);
  let added = 0;
  let removed = 0;
  for (const [line, count] of after) added += Math.max(0, count - (before.get(line) ?? 0));
  for (const [line, count] of before) removed += Math.max(0, count - (after.get(line) ?? 0));
  return { added, removed };
}

export function describeArtifactVersionChange(
  versions: readonly VersionedContent[],
  index: number,
): string {
  const version = versions[index];
  if (!version) return '';
  if (index === 0)
    return translateUiPlural(
      'chat',
      'counts.artifactCreatedLines',
      version.content.split('\n').length,
      {
        one: 'Created, {{count}} line',
        other: 'Created, {{count}} lines',
      },
    );
  const match = versions.findIndex(
    (candidate, candidateIndex) =>
      candidateIndex < index - 1 && candidate.content === version.content,
  );
  if (match >= 0) return `Same as version ${match + 1}`;
  const previous = versions[index - 1];
  const { added, removed } = artifactLineChange(previous?.content ?? '', version.content);
  if (added === 0 && removed === 0) return 'Line order changed';
  return translateUiPlural(
    'chat',
    'counts.artifactLinesChanged',
    added,
    {
      one: '{{count}} line added, {{removed}} removed',
      other: '{{count}} lines added, {{removed}} removed',
    },
    { removed },
  );
}

export function formatArtifactVersionTime(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function summarizeArtifactVersions(
  versions: readonly VersionedContent[],
): ArtifactVersionSummary[] {
  return versions
    .map((version, index) => ({
      index,
      when: formatArtifactVersionTime(version.updatedAt ?? version.createdAt),
      change: describeArtifactVersionChange(versions, index),
    }))
    .reverse();
}

export function formatVersionCount(count: number): string {
  return translateUiPlural('chat', 'counts.artifactVersions', count, {
    one: '{{count}} version',
    other: '{{count}} versions',
  });
}

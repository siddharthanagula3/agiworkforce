import { useEffect, useMemo, useRef } from 'react';
import { X } from 'lucide-react';
import type { SharedArtifact } from '@agiworkforce/types';
import { translateUiPlural } from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';

export interface ArtifactVersionHistoryProps {
  id: string;
  versions: SharedArtifact[];
  shownIndex: number;
  onOpen: (index: number) => void;
  onRestore: (index: number) => void;
  onClose: () => void;
}

interface VersionSummary {
  index: number;
  when: string | null;
  change: string;
}

function countLines(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of text.split('\n')) counts.set(line, (counts.get(line) ?? 0) + 1);
  return counts;
}

function lineChange(previous: string, next: string): { added: number; removed: number } {
  const before = countLines(previous);
  const after = countLines(next);
  let added = 0;
  let removed = 0;
  for (const [line, count] of after) added += Math.max(0, count - (before.get(line) ?? 0));
  for (const [line, count] of before) removed += Math.max(0, count - (after.get(line) ?? 0));
  return { added, removed };
}

function describeChange(versions: SharedArtifact[], index: number): string {
  const version = versions[index]!;
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
  const { added, removed } = lineChange(versions[index - 1]!.content, version.content);
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

function formatWhen(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function ArtifactVersionHistory({
  id,
  versions,
  shownIndex,
  onOpen,
  onRestore,
  onClose,
}: ArtifactVersionHistoryProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const latestIndex = versions.length - 1;

  const summaries = useMemo<VersionSummary[]>(
    () =>
      versions
        .map((version, index) => ({
          index,
          when: formatWhen(version.updatedAt ?? version.createdAt),
          change: describeChange(versions, index),
        }))
        .reverse(),
    [versions],
  );

  const openedAtIndexRef = useRef(shownIndex);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLButtonElement>(`[data-version-index="${openedAtIndexRef.current}"]`)
      ?.focus();
  }, []);

  return (
    <section
      id={id}
      aria-label="Version history"
      className="flex max-h-72 shrink-0 flex-col border-b border-border/30 bg-card"
      data-testid="artifact-version-history"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <div className="flex items-center justify-between px-4 py-2">
        <h3 className="text-xs font-medium text-muted-foreground">
          {translateUiPlural('chat', 'counts.artifactVersions', versions.length, {
            one: '{{count}} version',
            other: '{{count}} versions',
          })}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-compact text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Close version history"
          title="Close version history"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <ol ref={listRef} className="flex flex-col overflow-y-auto px-2 pb-2">
        {summaries.map((summary) => {
          const isShown = summary.index === shownIndex;
          const isLatest = summary.index === latestIndex;
          return (
            <li
              key={summary.index}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5',
                isShown ? 'bg-muted' : 'hover:bg-muted/60',
              )}
              data-testid="artifact-version-row"
            >
              <button
                type="button"
                data-version-index={summary.index}
                onClick={() => onOpen(summary.index)}
                aria-current={isShown ? 'true' : undefined}
                className="flex min-w-0 flex-1 flex-col items-start rounded-compact text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="text-sm font-medium text-foreground">
                  Version {summary.index + 1}
                  {isLatest ? (
                    <span className="font-normal text-muted-foreground"> · Latest</span>
                  ) : null}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {summary.when ? `${summary.when} · ${summary.change}` : summary.change}
                </span>
              </button>
              {!isLatest && (
                <button
                  type="button"
                  onClick={() => onRestore(summary.index)}
                  className="flex h-7 shrink-0 items-center rounded-compact px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Restore version ${summary.index + 1}`}
                  data-testid="artifact-version-history-restore"
                >
                  Restore
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

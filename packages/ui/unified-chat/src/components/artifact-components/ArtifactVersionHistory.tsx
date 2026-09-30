import { useEffect, useMemo, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Artifact } from '../../lib/types';
import { formatVersionCount, summarizeArtifactVersions } from '../../lib/artifactVersionSummary';

export interface ArtifactVersionHistoryProps {
  id: string;
  versions: Artifact[];
  shownIndex: number;
  onOpen: (index: number) => void;
  onRestore?: (index: number) => void;
  onClose: () => void;
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
  const latestContent = versions[latestIndex]?.content;
  const summaries = useMemo(() => summarizeArtifactVersions(versions), [versions]);

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
      className="flex max-h-72 shrink-0 flex-col border-b border-[var(--chat-border)] bg-[var(--chat-surface-elevated)]"
      data-testid="artifact-version-history"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <h3 className="text-xs font-medium text-[var(--chat-text-muted)]">
          {formatVersionCount(versions.length)}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-compact text-[var(--chat-text-muted)] transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
          aria-label="Close version history"
          title="Close version history"
        >
          <X size={13} aria-hidden="true" />
        </button>
      </div>
      <ol ref={listRef} className="flex flex-col overflow-y-auto px-1.5 pb-2">
        {summaries.map((summary) => {
          const isShown = summary.index === shownIndex;
          const isLatest = summary.index === latestIndex;
          const canRestore =
            onRestore !== undefined &&
            !isLatest &&
            versions[summary.index]?.content !== latestContent;
          return (
            <li
              key={summary.index}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5',
                isShown ? 'bg-[var(--chat-surface-hover)]' : 'hover:bg-[var(--chat-surface-hover)]',
              )}
              data-testid="artifact-version-row"
            >
              <button
                type="button"
                data-version-index={summary.index}
                onClick={() => onOpen(summary.index)}
                aria-current={isShown ? 'true' : undefined}
                className="flex min-w-0 flex-1 flex-col items-start rounded-compact text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
              >
                <span className="text-sm font-medium text-[var(--chat-text-primary)]">
                  Version {summary.index + 1}
                  {isLatest ? (
                    <span className="font-normal text-[var(--chat-text-muted)]"> · Latest</span>
                  ) : null}
                </span>
                <span className="w-full truncate text-xs text-[var(--chat-text-muted)]">
                  {summary.when ? `${summary.when} · ${summary.change}` : summary.change}
                </span>
              </button>
              {canRestore ? (
                <button
                  type="button"
                  onClick={() => onRestore?.(summary.index)}
                  className="flex h-7 shrink-0 items-center rounded-compact px-2 text-xs font-medium text-[var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-surface-base)] hover:text-[var(--chat-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
                  aria-label={`Restore version ${summary.index + 1}`}
                  data-testid="artifact-version-history-restore"
                >
                  Restore
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

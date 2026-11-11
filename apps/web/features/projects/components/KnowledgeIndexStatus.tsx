'use client';

import { Spinner } from '@agiworkforce/ui';
import type { ProjectKnowledgeFile, ProjectKnowledgeIndexState } from '@agiworkforce/types';

export const INDEX_POLL_INTERVAL_MS = 5_000;
export const MAX_INDEX_POLLS = 60;

const IN_PROGRESS_INDEX_STATUSES: ReadonlySet<ProjectKnowledgeIndexState['status']> = new Set([
  'pending',
  'indexing',
  'stale',
]);

export function isIndexInProgress(file: ProjectKnowledgeFile): boolean {
  return file.indexing ? IN_PROGRESS_INDEX_STATUSES.has(file.indexing.status) : false;
}

export function KnowledgeIndexStatus({
  indexing,
  retrying,
  canRetry = true,
  onRetry,
}: {
  indexing: ProjectKnowledgeIndexState | null;
  retrying: boolean;
  canRetry?: boolean;
  onRetry: () => void;
}) {
  if (!indexing) return null;
  const inProgress = IN_PROGRESS_INDEX_STATUSES.has(indexing.status) || retrying;
  if (!inProgress && indexing.status === 'indexed') return null;

  const label = inProgress
    ? 'Indexing for search'
    : indexing.chunkCount > 0
      ? 'Keyword search only'
      : 'Not indexed';

  return (
    <span
      data-testid="knowledge-files-index-status"
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 'var(--space-2)',
        fontSize: 12,
        color: !inProgress && indexing.chunkCount === 0 ? 'var(--agi-error)' : 'var(--agi-ink-2)',
      }}
    >
      {inProgress ? <Spinner size="sm" aria-label="Indexing" /> : null}
      <span>{inProgress ? label : (indexing.error ?? label)}</span>
      {canRetry && !inProgress && indexing.status === 'failed' ? (
        <button
          type="button"
          data-testid="knowledge-files-retry-index"
          onClick={(event) => {
            event.stopPropagation();
            onRetry();
          }}
          onKeyDown={(event) => event.stopPropagation()}
          style={{
            background: 'transparent',
            border: 0,
            padding: 0,
            minHeight: 24,
            color: 'var(--agi-ink)',
            fontSize: 12,
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          Retry indexing
        </button>
      ) : null}
    </span>
  );
}

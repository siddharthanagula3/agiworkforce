'use client';

import { Spinner } from '@agiworkforce/ui';
import { detectArtifactType, extractArtifactTitle } from '@agiworkforce/artifacts';
import type { ArtifactData } from './ArtifactPreview';
import { ARTIFACT_KIND_LABEL, artifactTypeLabel } from './artifact-labels';

const CREATING_VERB = 'Creating';

export function creatingArtifactLabel(language: string, content: string): string {
  const title = extractArtifactTitle(content);
  if (title) return `${CREATING_VERB} ${title}`;
  const type = detectArtifactType(language, content) as ArtifactData['type'];
  return `${CREATING_VERB} ${artifactTypeLabel(type)} ${ARTIFACT_KIND_LABEL.toLowerCase()}`;
}

function lineCountLabel(content: string): string {
  const count = content.length === 0 ? 0 : content.split('\n').length;
  return `${count} ${count === 1 ? 'line' : 'lines'}`;
}

export function ArtifactCreatingRow({
  language,
  content,
  onShow,
}: {
  language: string;
  content: string;
  onShow: () => void;
}) {
  const label = creatingArtifactLabel(language, content);
  return (
    <button
      type="button"
      onClick={onShow}
      className="mt-2 flex w-full max-w-full items-center gap-2.5 rounded-xl border border-[var(--chat-border)] px-3 py-2.5 text-start transition-colors hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:w-fit"
      aria-label={`${label}. Show the code being written`}
      data-testid="artifact-creating-row"
    >
      <Spinner size="sm" className="text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 truncate text-sm text-foreground">{label}</span>
      <span className="ms-auto shrink-0 text-xs tabular-nums text-muted-foreground sm:ms-2">
        {lineCountLabel(content)}
      </span>
    </button>
  );
}

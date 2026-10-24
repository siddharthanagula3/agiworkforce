'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronRight, FilePlus2 } from 'lucide-react';
import { Spinner } from '@agiworkforce/ui';
import { detectArtifactType, extractArtifactTitle } from '@agiworkforce/artifacts';
import type { ArtifactData } from './ArtifactPreview';
import { artifactFileName } from './ArtifactLabels';

const CREATING_VERB = 'Creating';
const CREATED_ONE_FILE = 'Created a file';
const ELAPSED_TICK_MS = 1_000;
const DETAIL_SEPARATOR = ' · ';

function lineCount(content: string): number {
  return content.length === 0 ? 0 : content.split('\n').length;
}

function lineCountLabel(content: string): string {
  const count = lineCount(content);
  return `${count} ${count === 1 ? 'line' : 'lines'}`;
}

export function streamingArtifactFileName(language: string, content: string): string {
  const type = detectArtifactType(language, content) as ArtifactData['type'];
  return artifactFileName({ title: extractArtifactTitle(content), type, language });
}

export function creatingArtifactLabel(language: string, content: string): string {
  return `${CREATING_VERB} ${streamingArtifactFileName(language, content)}`;
}

function createdFilesLabel(count: number): string {
  return count === 1 ? CREATED_ONE_FILE : `Created ${count} files`;
}

function useElapsedSeconds(): number {
  const startedAt = useRef(Date.now());
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setSeconds(Math.round((Date.now() - startedAt.current) / ELAPSED_TICK_MS)),
      ELAPSED_TICK_MS,
    );
    return () => clearInterval(id);
  }, []);
  return seconds;
}

/**
 * The activity row while an artifact is being written: its file name, the
 * lines so far and the time spent, never the raw code. It opens the panel,
 * where the code is visible as it streams.
 */
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
  const seconds = useElapsedSeconds();
  return (
    <button
      type="button"
      onClick={onShow}
      className="mt-2 flex min-h-11 w-full max-w-full items-center gap-2.5 rounded-lg py-1.5 text-start text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:min-h-8 sm:w-fit"
      aria-label={`${label}. Show the code being written`}
      data-testid="artifact-creating-row"
    >
      <Spinner size="sm" aria-hidden="true" />
      <span className="min-w-0 truncate text-sm text-foreground">{label}</span>
      <span className="shrink-0 text-xs tabular-nums">
        {lineCountLabel(content)}
        {seconds > 0 ? `${DETAIL_SEPARATOR}${seconds}s` : ''}
      </span>
    </button>
  );
}

/**
 * The same row once the reply is done: one collapsed line that names what
 * was made, as Claude's activity summary does, expanding to the file list.
 */
export function ArtifactCreatedRow({ artifacts }: { artifacts: readonly ArtifactData[] }) {
  if (artifacts.length === 0) return null;
  return (
    <details
      className="group mt-2 text-sm text-muted-foreground"
      data-testid="artifact-created-row"
    >
      <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-lg py-1.5 transition-colors marker:hidden hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8 [&::-webkit-details-marker]:hidden">
        <FilePlus2 className="h-4 w-4" aria-hidden="true" />
        <span>{createdFilesLabel(artifacts.length)}</span>
        <ChevronRight
          className="h-3.5 w-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </summary>
      <ul className="mb-1 ms-6 space-y-1">
        {artifacts.map((artifact) => (
          <li key={artifact.id} className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate text-foreground">{`Created ${artifactFileName(artifact)}`}</span>
            <span className="shrink-0 text-xs tabular-nums">
              {lineCountLabel(artifact.content)}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

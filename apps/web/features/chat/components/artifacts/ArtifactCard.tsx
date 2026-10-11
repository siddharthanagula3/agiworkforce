'use client';

import { useCallback, useId } from 'react';
import { Download, Globe2 } from 'lucide-react';
import { toast } from 'sonner';
import { summarizeGeneratedFileBundle } from '@agiworkforce/types';
import { cn } from '@shared/lib/utils';
import { toUserMessage } from '@/lib/user-error-message';
import { SITE_VISIBILITY_LABELS } from '@features/sites/lib/site-format';
import { usePublishedSite } from '@features/sites/stores/published-sites-store';
import { downloadArtifactFile } from '../../utils/downloadArtifacts';
import { ACTION_BUTTON_SIZE, ACTION_BUTTON_TONE } from '../messages/messageActionRow';
import type { ArtifactData } from './ArtifactPreview';
import { canRenderLivePreview } from './artifact-render';
import {
  ARTIFACT_KIND_LABEL,
  TypeIcon,
  artifactExtensionLabel,
  artifactKindLabel,
  artifactTitle,
} from './artifact-labels';

export const OPEN_ARTIFACT_LABEL = 'Open artifact';
export const HIDE_ARTIFACT_LABEL = 'Hide artifact';
export const ARTIFACT_OPEN_ACTION = 'Open';
export const ARTIFACT_HIDE_ACTION = 'Hide';
export const ARTIFACT_DOWNLOAD_ACTION = 'Download';
export const PUBLISHED_LABEL = 'Published';
const OPEN_SITE_LABEL = 'Open the published site for';
const DETAIL_SEPARATOR = ' · ';

export const ARTIFACT_ICON_BUTTON_CLASS = cn(
  ACTION_BUTTON_SIZE,
  ACTION_BUTTON_TONE,
  'inline-flex shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[var(--chat-surface-hover)]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
);

export function useArtifactDownload(artifact: ArtifactData): () => Promise<void> {
  return useCallback(async () => {
    try {
      await downloadArtifactFile({
        title: artifactTitle(artifact),
        content: artifact.content,
        language: artifact.language ?? null,
        type: artifact.type,
        generatedFile: artifact.generatedFile
          ? {
              uri: artifact.generatedFile.uri,
              fileName: artifact.generatedFile.fileName,
              mimeType: artifact.generatedFile.mimeType ?? null,
            }
          : null,
      });
    } catch (error) {
      toast.error(toUserMessage(error, 'Could not download this artifact'));
    }
  }, [artifact]);
}

function typeLine(artifact: ArtifactData): string {
  const runsAsArtifact =
    !artifact.generatedFile && (canRenderLivePreview(artifact.type) || artifact.type === 'mermaid');
  if (runsAsArtifact) return ARTIFACT_KIND_LABEL;
  const summary =
    artifact.computeSession || artifact.generatedFile || artifact.artifactManifest
      ? summarizeGeneratedFileBundle({
          computeSession: artifact.computeSession,
          generatedFile: artifact.generatedFile,
          artifactManifest: artifact.artifactManifest,
          fallbackFileName: artifact.title,
          fallbackKind: artifact.generatedFile?.kind ?? artifact.language ?? artifact.type,
          fallbackMimeType: artifact.generatedFile?.mimeType,
          fallbackUri: artifact.generatedFile?.uri,
          fallbackStatus: artifact.computeSession?.status,
        })
      : null;
  return [
    `${artifactKindLabel(artifact.type)}${DETAIL_SEPARATOR}${artifactExtensionLabel(artifact)}`,
    summary?.privacyShortLabel,
  ]
    .filter(Boolean)
    .join(DETAIL_SEPARATOR);
}

/**
 * Claude's artifact card: what the reply made, named once, with Open (or Hide
 * when it is the one in the panel) and a download. The artifact itself runs
 * only in the panel.
 */
export function ArtifactCard({
  artifact,
  shownInPanel,
  onToggle,
}: {
  artifact: ArtifactData;
  shownInPanel: boolean;
  onToggle: () => void;
}) {
  const title = artifactTitle(artifact);
  const subtitleId = useId();
  const download = useArtifactDownload(artifact);
  const published = usePublishedSite(artifact.id);
  const subtitle = [
    typeLine(artifact),
    published
      ? `${PUBLISHED_LABEL}${DETAIL_SEPARATOR}${SITE_VISIBILITY_LABELS[published.visibility]}`
      : null,
  ]
    .filter(Boolean)
    .join(DETAIL_SEPARATOR);

  return (
    <div
      className={cn(
        'flex w-full min-w-0 items-center gap-3 rounded-xl border bg-[var(--chat-surface-elevated)] py-2 pe-2 ps-3 sm:max-w-md',
        shownInPanel ? 'border-[var(--chat-text-muted)]' : 'border-[var(--chat-border-strong)]',
      )}
      data-testid="artifact-card"
      data-in-panel={shownInPanel ? 'true' : undefined}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--chat-surface-hover)]"
        aria-hidden="true"
      >
        <TypeIcon type={artifact.type} className="h-5 w-5 text-muted-foreground" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium leading-5 text-foreground" title={title}>
          {title}
        </span>
        <span id={subtitleId} className="truncate text-xs leading-4 text-muted-foreground">
          {subtitle}
        </span>
      </span>
      {published && (
        <a
          href={published.sitePath}
          className={ARTIFACT_ICON_BUTTON_CLASS}
          aria-label={`${OPEN_SITE_LABEL} ${title}`}
          title={`${PUBLISHED_LABEL}${DETAIL_SEPARATOR}${SITE_VISIBILITY_LABELS[published.visibility]}`}
        >
          <Globe2 className="h-4 w-4" aria-hidden="true" />
        </a>
      )}
      <button
        type="button"
        onClick={() => void download()}
        className={ARTIFACT_ICON_BUTTON_CLASS}
        aria-label={`${ARTIFACT_DOWNLOAD_ACTION} ${title}`}
        title={ARTIFACT_DOWNLOAD_ACTION}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-[var(--chat-border-strong)] px-3 text-sm font-medium text-foreground transition-colors hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:min-h-8"
        aria-label={`${shownInPanel ? HIDE_ARTIFACT_LABEL : OPEN_ARTIFACT_LABEL}: ${title}`}
        aria-describedby={subtitleId}
        aria-expanded={shownInPanel}
      >
        {shownInPanel ? ARTIFACT_HIDE_ACTION : ARTIFACT_OPEN_ACTION}
      </button>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, Copy, Download, PanelRightOpen } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@shared/lib/utils';
import { safeClipboard } from '@shared/utils/browser-utils';
import { toUserMessage } from '@/lib/user-error-message';
import { downloadArtifactFile } from '../../utils/downloadArtifacts';
import {
  ACTION_BUTTON_SIZE,
  ACTION_BUTTON_TONE,
  ACTION_ICON_SIZE,
} from '../messages/messageActionRow';
import type { ArtifactData } from './ArtifactPreview';
import { TypeIcon, artifactTitle } from './artifact-labels';

export const ARTIFACT_OPEN_ACTION = 'Open in panel';
export const OPEN_ARTIFACT_LABEL = 'Open artifact';
export const ARTIFACT_COPY_ACTION = 'Copy';
export const ARTIFACT_DOWNLOAD_ACTION = 'Download';
const COPIED_RESET_MS = 2_000;

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

interface ArtifactCardHeaderProps {
  artifact: ArtifactData;
  subtitle: string;
  onOpen: () => void;
  canCopy?: boolean;
  shownInPanel?: boolean;
}

export function ArtifactCardHeader({
  artifact,
  subtitle,
  onOpen,
  canCopy = true,
  shownInPanel = false,
}: ArtifactCardHeaderProps) {
  const title = artifactTitle(artifact);
  const subtitleId = useId();
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const copy = useCallback(async () => {
    if (!(await safeClipboard.writeText(artifact.content))) {
      toast.error('Could not copy to clipboard');
      return;
    }
    setCopied(true);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
  }, [artifact.content]);

  const download = useArtifactDownload(artifact);

  return (
    <div className="flex min-h-14 items-center gap-1 py-1.5 pe-1.5 ps-3 sm:min-h-12">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title={ARTIFACT_OPEN_ACTION}
        aria-label={`${OPEN_ARTIFACT_LABEL}: ${title}`}
        aria-describedby={subtitleId}
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--chat-surface-hover)]"
          aria-hidden="true"
        >
          <TypeIcon type={artifact.type} className="h-4 w-4 text-muted-foreground" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium leading-5 text-foreground">{title}</span>
          <span id={subtitleId} className="truncate text-xs leading-4 text-muted-foreground">
            {subtitle}
          </span>
        </span>
      </button>
      {canCopy && (
        <button
          type="button"
          onClick={() => void copy()}
          className={ARTIFACT_ICON_BUTTON_CLASS}
          aria-label={`${ARTIFACT_COPY_ACTION} ${title}`}
          title={ARTIFACT_COPY_ACTION}
        >
          {copied ? (
            <Check className={ACTION_ICON_SIZE} aria-hidden="true" />
          ) : (
            <Copy className={ACTION_ICON_SIZE} aria-hidden="true" />
          )}
        </button>
      )}
      <button
        type="button"
        onClick={() => void download()}
        className={ARTIFACT_ICON_BUTTON_CLASS}
        aria-label={`${ARTIFACT_DOWNLOAD_ACTION} ${title}`}
        title={ARTIFACT_DOWNLOAD_ACTION}
      >
        <Download className={ACTION_ICON_SIZE} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onOpen}
        className={cn(ARTIFACT_ICON_BUTTON_CLASS, shownInPanel && 'text-[var(--chat-text-primary)]')}
        aria-label={`${ARTIFACT_OPEN_ACTION}: ${title}`}
        aria-pressed={shownInPanel}
        title={ARTIFACT_OPEN_ACTION}
      >
        <PanelRightOpen className={ACTION_ICON_SIZE} aria-hidden="true" />
      </button>
    </div>
  );
}

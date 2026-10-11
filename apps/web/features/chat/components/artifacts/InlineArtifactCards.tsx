'use client';

import { useCallback, useId } from 'react';
import { Download, FolderDown } from 'lucide-react';
import { toast } from 'sonner';
import { summarizeGeneratedFileBundle } from '@agiworkforce/types';
import { MermaidDiagram } from '@agiworkforce/unified-chat';
import { cn } from '@shared/lib/utils';
import { useMounted } from '@shared/hooks/useMounted';
import { toUserMessage } from '@/lib/user-error-message';
import { useArtifactsStore } from '../../stores/artifacts-store';
import { downloadAllArtifacts } from '../../utils/downloadArtifacts';
import type { ArtifactData } from './ArtifactPreview';
import {
  ArtifactCardHeader,
  ARTIFACT_DOWNLOAD_ACTION,
  ARTIFACT_ICON_BUTTON_CLASS,
  OPEN_ARTIFACT_LABEL,
  useArtifactDownload,
} from './ArtifactCardHeader';
import { InlineArtifactPreview } from './InlineArtifactPreview';
import { canRenderLivePreview } from './artifact-render';
import {
  ARTIFACT_KIND_LABEL,
  TypeIcon,
  artifactExtensionLabel,
  artifactKindLabel,
  artifactTitle,
  artifactTypeLabel,
} from './artifact-labels';


const DETAIL_SEPARATOR = ' · ';
const DOWNLOAD_ALL_ACTION = 'Download all';
const MAX_VISIBLE = 3;

interface InlineArtifactCardsProps {
  artifacts: ArtifactData[];
  onOpen?: (artifactId: string) => void;
  className?: string;
}

function liveSubtitle(artifact: ArtifactData): string {
  return `${artifactTypeLabel(artifact.type)}${DETAIL_SEPARATOR}${ARTIFACT_KIND_LABEL}`;
}

function fileSubtitle(artifact: ArtifactData): string {
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
 * A document, a file or a stopped artifact: ChatGPT's compact file card. It
 * names the file and opens the panel's document view; nothing runs here.
 */
export function ArtifactFileCard({
  artifact,
  onOpen,
}: {
  artifact: ArtifactData;
  onOpen: () => void;
}) {
  const title = artifactTitle(artifact);
  const subtitle = fileSubtitle(artifact);
  const subtitleId = useId();
  const download = useArtifactDownload(artifact);
  return (
    <div className="relative w-full sm:max-w-md" data-testid="artifact-file-card">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'flex w-full min-w-0 items-center gap-3 rounded-xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)] py-2.5 pe-14 ps-3 text-start sm:pe-12',
          'transition-colors hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
        )}
        title={title}
        aria-label={`${OPEN_ARTIFACT_LABEL}: ${title}`}
        aria-describedby={subtitleId}
      >
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--chat-surface-hover)]"
          aria-hidden="true"
        >
          <TypeIcon type={artifact.type} className="h-5 w-5 text-muted-foreground" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium leading-5 text-foreground">{title}</span>
          <span id={subtitleId} className="truncate text-xs leading-4 text-muted-foreground">
            {subtitle}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => void download()}
        className={cn(ARTIFACT_ICON_BUTTON_CLASS, 'absolute end-1.5 top-1/2 -translate-y-1/2')}
        aria-label={`${ARTIFACT_DOWNLOAD_ACTION} ${title}`}
        title={ARTIFACT_DOWNLOAD_ACTION}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function InlineMermaidArtifact({
  artifact,
  onOpen,
  shownInPanel,
}: {
  artifact: ArtifactData;
  onOpen: () => void;
  shownInPanel: boolean;
}) {
  return (
    <section
      className="w-full overflow-hidden rounded-xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)]"
      aria-label={`${artifactTitle(artifact)}, ${artifactTypeLabel(artifact.type)}`}
      data-testid="inline-artifact-diagram"
    >
      <ArtifactCardHeader
        artifact={artifact}
        subtitle={liveSubtitle(artifact)}
        onOpen={onOpen}
        shownInPanel={shownInPanel}
      />
      {!shownInPanel && (
        <div className="max-h-[70vh] overflow-auto border-t border-[var(--chat-border)] bg-background px-4 py-4">
          <MermaidDiagram source={artifact.content} interactive={false} className="mermaid-block" />
        </div>
      )}
    </section>
  );
}

function InlineArtifact({
  artifact,
  onOpen,
  shownInPanel,
}: {
  artifact: ArtifactData;
  onOpen: () => void;
  shownInPanel: boolean;
}) {
  const mounted = useMounted();
  if (artifact.interrupted || artifact.generatedFile) {
    return <ArtifactFileCard artifact={artifact} onOpen={onOpen} />;
  }
  if (mounted && artifact.type === 'mermaid') {
    return <InlineMermaidArtifact artifact={artifact} onOpen={onOpen} shownInPanel={shownInPanel} />;
  }
  if (canRenderLivePreview(artifact.type)) {
    return <InlineArtifactPreview artifact={artifact} onOpen={onOpen} shownInPanel={shownInPanel} />;
  }
  return <ArtifactFileCard artifact={artifact} onOpen={onOpen} />;
}

export function InlineArtifactCards({ artifacts, onOpen, className }: InlineArtifactCardsProps) {
  const selectArtifact = useArtifactsStore((state) => state.selectArtifact);
  const setPanelOpen = useArtifactsStore((state) => state.setPanelOpen);
  const panelOpen = useArtifactsStore((state) => state.panelOpen);
  const selectedArtifactId = useArtifactsStore((state) => state.selectedArtifactId);

  const openArtifact = useCallback(
    (id: string) => {
      selectArtifact(id);
      setPanelOpen(true);
      onOpen?.(id);
    },
    [selectArtifact, setPanelOpen, onOpen],
  );

  if (artifacts.length === 0) return null;

  const visible = artifacts.slice(0, MAX_VISIBLE);
  const overflow = artifacts.length - visible.length;
  const firstHidden = artifacts[MAX_VISIBLE];

  return (
    <div className={cn('mt-3 flex flex-col gap-3', className)} role="list" aria-label="Artifacts">
      {visible.map((artifact) => (
        <div key={artifact.id} role="listitem">
          <InlineArtifact
            artifact={artifact}
            onOpen={() => openArtifact(artifact.id)}
            shownInPanel={panelOpen && selectedArtifactId === artifact.id}
          />
        </div>
      ))}
      {overflow > 0 && firstHidden && (
        <div role="listitem">
          <button
            type="button"
            onClick={() => openArtifact(firstHidden.id)}
            className="flex w-full items-center justify-center rounded-xl border border-[var(--chat-border)] py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`View ${overflow} more artifacts`}
          >
            +{overflow} more
          </button>
        </div>
      )}
      {artifacts.length > 1 && (
        <button
          type="button"
          onClick={() => {
            toast.promise(downloadAllArtifacts(artifacts), {
              loading: 'Preparing artifact download…',
              success: 'Artifact download ready',
              error: (error) => toUserMessage(error, 'Could not download artifacts'),
            });
          }}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-[var(--chat-border-strong)] px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <FolderDown className="h-3.5 w-3.5" aria-hidden="true" />
          {DOWNLOAD_ALL_ACTION}
        </button>
      )}
    </div>
  );
}

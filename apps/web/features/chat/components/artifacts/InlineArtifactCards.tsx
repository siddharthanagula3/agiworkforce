'use client';

import { useCallback } from 'react';
import { FolderDown } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@shared/lib/utils';
import { toUserMessage } from '@/lib/user-error-message';
import { useArtifactsStore } from '../../stores/artifacts-store';
import { downloadAllArtifacts } from '../../utils/downloadArtifacts';
import type { ArtifactData } from './ArtifactPreview';
import { ArtifactCard } from './ArtifactCard';

const DOWNLOAD_ALL_ACTION = 'Download all';
const MAX_VISIBLE = 3;

interface InlineArtifactCardsProps {
  artifacts: ArtifactData[];
  onOpen?: (artifactId: string) => void;
  className?: string;
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
    <div className={cn('mt-3 flex flex-col gap-2', className)} role="list" aria-label="Artifacts">
      {visible.map((artifact) => (
        <div key={artifact.id} role="listitem">
          <ArtifactCard
            artifact={artifact}
            shownInPanel={panelOpen && selectedArtifactId === artifact.id}
            onToggle={() =>
              panelOpen && selectedArtifactId === artifact.id
                ? setPanelOpen(false)
                : openArtifact(artifact.id)
            }
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

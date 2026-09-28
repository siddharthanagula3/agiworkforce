'use client';

import { FolderOpen, X } from 'lucide-react';
import { Button } from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';
import { useOverlayLayout } from '@features/chat/hooks/use-overlay-dialog';
import {
  SidePanelResizeHandle,
  useSidePanelWidth,
} from '@features/chat/components/SidePanelResizeHandle';
import { SourcesPanel } from './SourcesPanel';

export interface ProjectSourcesPanelProps {
  projectId: string;
  projectName: string;
  readOnly: boolean;
  onClose: () => void;
}

export function ProjectSourcesPanel({
  projectId,
  projectName,
  readOnly,
  onClose,
}: ProjectSourcesPanelProps) {
  const layout = useOverlayLayout();
  const panelWidth = useSidePanelWidth();
  const isModalOverlay = layout === 'mobile';

  return (
    <>
      <div
        className="fixed inset-0 z-[var(--z-panel-backdrop)] bg-black/50 backdrop-blur-sm sm:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={cn(
          'flex flex-col border-l border-border/30 bg-card/95 backdrop-blur-xl',
          'fixed inset-y-0 right-0 z-[var(--z-panel)] w-full',
          'sm:relative sm:inset-auto sm:z-auto sm:w-[360px] sm:min-w-[280px] sm:shrink',
          'animate-in slide-in-from-right duration-moved',
        )}
        style={layout === 'desktop' ? { width: panelWidth } : undefined}
        aria-label={`${projectName} sources`}
        data-testid="project-sources-panel"
        {...(isModalOverlay ? { role: 'dialog' as const, 'aria-modal': true, tabIndex: -1 } : {})}
      >
        {layout === 'desktop' && <SidePanelResizeHandle label="Resize project sources panel" />}
        <div className="flex items-center justify-between border-b border-border/30 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate text-sm font-semibold text-foreground">
              {projectName} sources
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
            aria-label="Close project sources"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <SourcesPanel projectId={projectId} readOnly={readOnly} />
        </div>
      </div>
    </>
  );
}

export function ProjectSourcesToggleButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
        open
          ? 'bg-primary/15 text-primary'
          : 'bg-card/60 text-muted-foreground shadow-e1 backdrop-blur-sm hover:bg-muted/60 hover:text-foreground',
      )}
      aria-label={open ? 'Close project sources' : 'Open project sources'}
      aria-pressed={open}
      title="Project sources"
    >
      <FolderOpen className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

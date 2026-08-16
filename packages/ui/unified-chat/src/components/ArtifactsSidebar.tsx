
import { ChevronRight, Code2, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { tokens } from '../lib/tokens';
import { useArtifactStore, selectActiveArtifact } from '../stores/artifactStore';
import { ArtifactRenderer } from './ArtifactRenderer';
import type { ArtifactRendererProps } from './ArtifactRenderer';

export interface ArtifactsSidebarProps {
  isOpen: boolean;
  onClose?: () => void;
  isDark?: boolean;
  className?: string;
  onApplyCode?: ArtifactRendererProps['onApplyCode'];
  onExportNative?: ArtifactRendererProps['onExportNative'];
}

export function ArtifactsSidebar({
  isOpen,
  onClose,
  isDark = false,
  className,
  onApplyCode,
  onExportNative,
}: ArtifactsSidebarProps) {
  const activeArtifact = useArtifactStore(selectActiveArtifact);

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'flex flex-col h-full border-l border-border bg-card shrink-0 overflow-hidden',
        className,
      )}
      style={{ width: tokens.spacing.artifactPanelWidth }}
      data-testid="artifacts-sidebar"
      aria-label="Artifact viewer"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50 shrink-0">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">
            {activeArtifact?.title ?? 'Artifact'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close artifact panel"
              className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-3">
        {activeArtifact ? (
          <ArtifactRenderer
            artifact={activeArtifact}
            isDark={isDark}
            onApplyCode={onApplyCode}
            onExportNative={onExportNative}
            className="h-full border-none shadow-none"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-sm text-muted-foreground gap-2">
            <ChevronRight className="h-8 w-8 opacity-20" />
            <span>No artifact selected</span>
          </div>
        )}
      </div>
    </div>
  );
}

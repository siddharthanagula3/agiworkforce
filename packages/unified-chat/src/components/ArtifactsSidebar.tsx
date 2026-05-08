/**
 * ArtifactsSidebar — 420px right-sidebar artifact viewer.
 *
 * Phase A Slice 4 / Task #16.
 *
 * Self-contained layout component the host mounts to the right of MessageList.
 * Reads from useArtifactStore and renders the correct ArtifactRenderer based on
 * the active artifact's kind. Width: 420px expanded, hideable via onClose prop.
 *
 * The host controls visibility — pass isOpen=false to unmount or hide.
 */

import { ChevronRight, Code2, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { tokens } from '../lib/tokens';
import { useArtifactStore, selectActiveArtifact } from '../stores/artifactStore';
import { ArtifactRenderer } from './ArtifactRenderer';
import type { ArtifactRendererProps } from './ArtifactRenderer';

export interface ArtifactsSidebarProps {
  /** Controls sidebar visibility. When false the sidebar is not rendered. */
  isOpen: boolean;
  /** Called when the user closes the sidebar via the X button. */
  onClose?: () => void;
  /** Optional dark-mode flag forwarded to ArtifactRenderer. */
  isDark?: boolean;
  /** Optional className override on the root container. */
  className?: string;
  /** Optional prop forwarded to ArtifactRenderer — desktop file-write callback. */
  onApplyCode?: ArtifactRendererProps['onApplyCode'];
  /** Optional native export callback forwarded to ArtifactRenderer. */
  onExportNative?: ArtifactRendererProps['onExportNative'];
}

/**
 * Right-hand sidebar that displays the currently active artifact.
 *
 * The sidebar width is locked to `tokens.spacing.artifactPanelWidth` (420px).
 * The host app is responsible for adjusting the adjacent MessageList layout
 * (e.g. by passing `style={{ marginRight: isOpen ? 420 : 0 }}` or using a
 * CSS grid/flex split).
 */
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

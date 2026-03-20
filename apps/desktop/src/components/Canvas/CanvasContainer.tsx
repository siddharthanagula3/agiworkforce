/**
 * CanvasContainer
 *
 * Full canvas workspace: ArtifactList on the left + CanvasPanel on the right.
 * Renders as a fixed right-side panel (slide-in from right).
 * Used in AppLayout like the AgentTaskPanel.
 */

import { Code2, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useCanvasStore } from '../../stores/canvasStore';
import { ArtifactList } from './ArtifactList';
import { CanvasPanel } from './CanvasPanel';

interface CanvasContainerProps {
  onClose: () => void;
  onFixBug?: (artifactId: string, errorMessage: string) => void;
}

export function CanvasContainer({ onClose, onFixBug }: CanvasContainerProps) {
  const { artifacts, activeArtifactId, isPanelOpen } = useCanvasStore(
    useShallow((s) => ({
      artifacts: s.artifacts,
      activeArtifactId: s.activeArtifactId,
      isPanelOpen: s.isPanelOpen,
    })),
  );

  const activeArtifact =
    activeArtifactId != null ? artifacts.find((a) => a.id === activeArtifactId) : undefined;

  // Decide layout: list only, or list + panel
  const showPanel = isPanelOpen && activeArtifact != null;

  return (
    <div className="fixed inset-y-0 right-0 z-30 flex h-full border-l border-white/10 bg-[#0b0c14] shadow-2xl">
      {/* Artifact List sidebar — always shown */}
      <div
        className="flex flex-col border-r border-white/10"
        style={{ width: showPanel ? 220 : 320 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-teal-400" />
            <h2 className="text-sm font-semibold text-white">Canvas</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Close canvas"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ArtifactList className="flex-1 overflow-hidden" />
      </div>

      {/* Canvas Panel — shown when an artifact is active */}
      {showPanel && (
        <div className="flex flex-col" style={{ width: 600 }}>
          <CanvasPanel
            artifact={activeArtifact}
            onClose={() => useCanvasStore.getState().closePanel()}
            onFixBug={onFixBug}
          />
        </div>
      )}
    </div>
  );
}

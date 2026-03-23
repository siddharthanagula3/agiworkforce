import { useState, useMemo, useCallback } from 'react';
import { useUIStore } from '../stores/uiStore';
import type { Artifact } from '../lib/types';

export function useArtifact() {
  const activeRightPanel = useUIStore((s) => s.activeRightPanel);
  const openArtifactPanel = useUIStore((s) => s.openArtifactPanel);
  const closeArtifactPanel = useUIStore((s) => s.closeArtifactPanel);
  const artifactPanelWidth = useUIStore((s) => s.artifactPanelWidth);
  const setArtifactPanelWidth = useUIStore((s) => s.setArtifactPanelWidth);

  const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null);
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');

  const openArtifact = useCallback(
    (artifact: Artifact) => {
      setActiveArtifact(artifact);
      setViewMode(artifact.type === 'html' || artifact.type === 'react' ? 'preview' : 'code');
      openArtifactPanel();
    },
    [openArtifactPanel],
  );

  const closeArtifact = useCallback(() => {
    setActiveArtifact(null);
    closeArtifactPanel();
  }, [closeArtifactPanel]);

  const isOpen = activeRightPanel === 'artifact';

  return useMemo(
    () => ({
      isOpen,
      activeArtifact,
      viewMode,
      panelWidth: artifactPanelWidth,
      openArtifact,
      closeArtifact,
      setViewMode,
      setPanelWidth: setArtifactPanelWidth,
    }),
    [
      isOpen,
      activeArtifact,
      viewMode,
      artifactPanelWidth,
      openArtifact,
      closeArtifact,
      setArtifactPanelWidth,
    ],
  );
}

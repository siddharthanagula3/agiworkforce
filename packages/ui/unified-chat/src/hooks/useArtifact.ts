import { useCallback, useMemo } from 'react';
import type { Artifact } from '../lib/types';
import { useArtifactStore, type ArtifactViewMode } from '../stores/artifactStore';
import { useUIStore } from '../stores/uiStore';

const PREVIEWABLE_TYPES = ['html', 'react', 'svg', 'markdown', 'document', 'image', 'chart'];

export function useArtifact() {
  const isOpen = useUIStore((state) => state.activeRightPanel === 'artifact');
  const panelWidth = useUIStore((state) => state.artifactPanelWidth);
  const openPanel = useUIStore((state) => state.openArtifactPanel);
  const closePanel = useUIStore((state) => state.closeArtifactPanel);
  const setPanelWidth = useUIStore((state) => state.setArtifactPanelWidth);

  const activeArtifact = useArtifactStore((state) => state.activeArtifact);
  const viewMode = useArtifactStore((state) => state.viewMode);
  const setViewModeInternal = useArtifactStore((state) => state.setViewMode);
  const openArtifactInternal = useArtifactStore((state) => state.openArtifact);
  const closeArtifactInternal = useArtifactStore((state) => state.closeArtifact);

  const canPreview = useMemo(() => {
    if (!activeArtifact) {
      return false;
    }

    return PREVIEWABLE_TYPES.includes(activeArtifact.type);
  }, [activeArtifact]);

  const openArtifact = useCallback(
    (artifact: Artifact, preferredViewMode: ArtifactViewMode = 'preview') => {
      const nextViewMode =
        preferredViewMode === 'preview' && !PREVIEWABLE_TYPES.includes(artifact.type)
          ? 'code'
          : preferredViewMode;
      openArtifactInternal(artifact, nextViewMode);
      openPanel();
    },
    [openArtifactInternal, openPanel],
  );

  const closeArtifact = useCallback(() => {
    closeArtifactInternal();
    closePanel();
  }, [closeArtifactInternal, closePanel]);

  const setViewMode = useCallback(
    (mode: ArtifactViewMode) => {
      if (mode === 'preview' && !canPreview) {
        setViewModeInternal('code');
        return;
      }
      setViewModeInternal(mode);
    },
    [canPreview, setViewModeInternal],
  );

  return {
    isOpen,
    panelWidth,
    activeArtifact,
    viewMode,
    canPreview,
    openArtifact,
    closeArtifact,
    setViewMode,
    setPanelWidth,
  };
}

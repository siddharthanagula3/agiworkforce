import { useState, useCallback } from 'react';
import { useUnifiedChatStore, type SidecarMode } from '../../../stores/unifiedChatStore';

export interface UseChatSidebarReturn {
  artifactsPanelOpen: boolean;
  setArtifactsPanelOpen: (open: boolean) => void;
  councilOpen: boolean;
  setCouncilOpen: (open: boolean) => void;
  openSidecar: (panel: SidecarMode, payload?: Record<string, unknown>) => void;
}

export function useChatSidebar(): UseChatSidebarReturn {
  const openSidecarStore = useUnifiedChatStore((s) => s.openSidecar);

  const [artifactsPanelOpen, setArtifactsPanelOpen] = useState(false);
  const [councilOpen, setCouncilOpen] = useState(false);

  const openSidecar = useCallback(
    (panel: SidecarMode, payload?: Record<string, unknown>) => {
      openSidecarStore(panel, payload?.['contextId'] as string | undefined, payload);
    },
    [openSidecarStore],
  );

  return { artifactsPanelOpen, setArtifactsPanelOpen, councilOpen, setCouncilOpen, openSidecar };
}

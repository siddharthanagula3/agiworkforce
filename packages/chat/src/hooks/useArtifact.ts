import { useState } from 'react';

/**
 * Manages artifact panel state (Phase 3 placeholder).
 */
export function useArtifact() {
  const [isOpen] = useState(false);
  const [panelWidth] = useState(420);

  return { isOpen, panelWidth };
}

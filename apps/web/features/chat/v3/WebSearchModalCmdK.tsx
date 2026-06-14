/**
 * WebSearchModalCmdK · alias for GlobalSearchDialog.
 *
 * GlobalSearchDialog is the canonical search surface (Fix 37). This shim
 * keeps existing imports in WebShellV3 working while routing everything
 * through the richer dialog.
 */

'use client';

import { GlobalSearchDialog } from '../components/dialogs/GlobalSearchDialog';

export interface WebSearchModalCmdKProps {
  onClose: () => void;
  /** Kept for API compatibility; navigation is handled inside GlobalSearchDialog. */
  onNavigate?: (
    dest: string,
    item: { kind: string; id: string; title: string; sub?: string },
  ) => void;
}

export function WebSearchModalCmdK({ onClose }: WebSearchModalCmdKProps) {
  return (
    <GlobalSearchDialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    />
  );
}

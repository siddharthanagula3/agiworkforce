// AUDIT-FIX: pre-existing reorg stub — placeholder until the real ModeSwitchModal
// is reinstated. Exposes the same surface (AppMode type + visible-controllable modal)
// so importers compile; the rendered tree is a no-op overlay.

import type { ReactElement } from 'react';

export type AppMode = 'chat' | 'agent' | 'voice' | 'cloud' | 'local';

export interface ModeSwitchModalProps {
  visible: boolean;
  fromMode?: AppMode;
  toMode?: AppMode;
  currentMode?: AppMode;
  onConfirm?: () => void;
  onCancel?: () => void;
  onSelectMode?: (mode: AppMode) => void;
  onClose?: () => void;
}

export function ModeSwitchModal(_props: ModeSwitchModalProps): ReactElement | null {
  return null;
}

export default ModeSwitchModal;

// AUDIT-FIX: pre-existing reorg stub — placeholder for the chat mode toggle.
// Real implementation tracked as a follow-up.

import type { ReactElement } from 'react';
import type { AppMode } from './ModeSwitchModal';

export interface ModeToggleProps {
  mode?: AppMode;
  cloudJoined?: boolean;
  waitlistRank?: number | undefined;
  onChange?: (mode: AppMode) => void;
  onTapCloud?: () => void;
}

export function ModeToggle(_props: ModeToggleProps): ReactElement | null {
  return null;
}

export default ModeToggle;

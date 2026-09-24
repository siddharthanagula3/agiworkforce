import type { ShellLayout, ShellSidebarMode } from '@shared/components/layout/app-shell-layout';

export type SecondaryPanel = 'work' | 'research' | 'artifacts';

export interface SecondaryPanelFlags {
  work: boolean;
  research: boolean;
  artifacts: boolean;
}

export const CLOSED_SECONDARY_PANELS: SecondaryPanelFlags = {
  work: false,
  research: false,
  artifacts: false,
};

export function resolveSecondaryPanel(
  active: SecondaryPanel | null,
  previous: SecondaryPanelFlags,
  current: SecondaryPanelFlags,
): SecondaryPanel | null {
  if (current.artifacts && !previous.artifacts) return 'artifacts';
  if (current.research && !previous.research) return 'research';
  if (current.work && !previous.work && active === null) return 'work';
  if (active && current[active]) return active;
  if (current.artifacts) return 'artifacts';
  if (current.research) return 'research';
  if (current.work) return 'work';
  return null;
}

export function resolveChatSidebarMode(
  layout: ShellLayout,
  secondaryPanelOpen: boolean,
): ShellSidebarMode {
  if (layout.sidebarMode === 'drawer') return 'drawer';
  if (layout.tier === 'tablet' && secondaryPanelOpen) return 'rail';
  return layout.sidebarMode;
}

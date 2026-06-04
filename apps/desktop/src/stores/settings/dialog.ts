import { create } from 'zustand';

export type SettingsTab =
  | 'general'
  | 'account'
  | 'appearance'
  | 'privacy'
  | 'models-keys'
  | 'agents'
  | 'skills'
  | 'connectors'
  | 'plugins'
  | 'notifications'
  | 'voice'
  | 'capabilities'
  | 'memory'
  | 'team'
  | 'personalization'
  | 'features'
  | 'oauth-credentials'
  | 'api-keys'
  | 'task-routing'
  | 'agent-execution'
  | 'mcp'
  | 'mcp-server'
  | 'extensions'
  | 'analytics'
  | 'tools'
  | 'research'
  | 'keybindings'
  | 'themes'
  | 'apps-integrations'
  | 'customize'
  | 'billing';

export const LEGACY_TAB_MAP: Partial<Record<SettingsTab, SettingsTab>> = {
  team: 'account',
  personalization: 'appearance',
  features: 'agents',
  'oauth-credentials': 'connectors',
  'api-keys': 'models-keys',
  'task-routing': 'models-keys',
  'agent-execution': 'agents',
  capabilities: 'agents',
  mcp: 'connectors',
  'mcp-server': 'connectors',
  extensions: 'connectors',
  analytics: 'privacy',
  tools: 'connectors',
  research: 'connectors',
  keybindings: 'general',
  themes: 'appearance',
  'apps-integrations': 'connectors',
  customize: 'skills',
  billing: 'account',
};

interface SettingsDialogState {
  settingsOpen: boolean;
  settingsInitialTab: SettingsTab;
  shortcutsOpen: boolean;
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
  openShortcuts: () => void;
  closeShortcuts: () => void;
}

export const useSettingsDialogStore = create<SettingsDialogState>((set) => ({
  settingsOpen: false,
  settingsInitialTab: 'general',
  shortcutsOpen: false,
  openSettings: (tab = 'general') => set({ settingsOpen: true, settingsInitialTab: tab }),
  closeSettings: () => set({ settingsOpen: false }),
  openShortcuts: () => set({ shortcutsOpen: true }),
  closeShortcuts: () => set({ shortcutsOpen: false }),
}));

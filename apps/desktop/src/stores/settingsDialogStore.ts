import { create } from 'zustand';

/**
 * New canonical tab IDs (10 tabs).
 * Legacy IDs (old tabs that got merged) are kept so external callers
 * that pass them to openSettings() still work — they are silently
 * redirected to their parent tab inside SettingsPanel.
 */
export type SettingsTab =
  // ── New canonical tabs ──────────────────────────────────────────────
  | 'general' // General + Keybindings
  | 'account' // Account & Billing + Team & Devices
  | 'appearance' // Personalization + Themes
  | 'privacy' // Privacy & Data + Analytics + Governance
  | 'models-keys' // API Keys + Custom Models + Task Routing
  | 'agents' // Agent Execution + Features
  | 'mcp-skills' // MCP & Skills + MCP Server + Tools + Research
  | 'connectors' // Connectors + OAuth + Extensions
  | 'notifications' // Notifications (unchanged)
  | 'voice' // Voice Settings
  | 'capabilities' // Memory + Tool access + Visuals
  // ── Legacy aliases — kept for backward-compat, map to parent tab ───
  | 'team' // → account
  | 'personalization' // → appearance
  | 'features' // → agents
  | 'oauth-credentials' // → connectors
  | 'api-keys' // → models-keys
  | 'task-routing' // → models-keys
  | 'agent-execution' // → agents
  | 'mcp' // → mcp-skills
  | 'mcp-server' // → mcp-skills
  | 'extensions' // → connectors
  | 'analytics' // → privacy
  | 'tools' // → mcp-skills
  | 'research' // → mcp-skills
  | 'keybindings' // → general
  | 'themes' // → appearance
  | 'apps-integrations' // → connectors
  | 'customize' // → mcp-skills
  | 'billing'; // → account

/** Map legacy/alias tab IDs to their new canonical parent tab. */
export const LEGACY_TAB_MAP: Partial<Record<SettingsTab, SettingsTab>> = {
  team: 'account',
  personalization: 'appearance',
  features: 'agents',
  'oauth-credentials': 'connectors',
  'api-keys': 'models-keys',
  'task-routing': 'models-keys',
  'agent-execution': 'agents',
  mcp: 'mcp-skills',
  'mcp-server': 'mcp-skills',
  extensions: 'connectors',
  analytics: 'privacy',
  tools: 'mcp-skills',
  research: 'mcp-skills',
  keybindings: 'general',
  themes: 'appearance',
  'apps-integrations': 'connectors',
  customize: 'mcp-skills',
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

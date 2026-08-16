
export type SettingsCategory = 'account' | 'interface' | 'ai' | 'extensions';

export const SETTINGS_CATEGORY_LABEL: Readonly<Record<SettingsCategory, string>> = Object.freeze({
  account: 'Account',
  interface: 'Interface',
  ai: 'AI',
  extensions: 'Extensions',
});

export const SETTINGS_CATEGORY_DESCRIPTION: Readonly<Record<SettingsCategory, string>> =
  Object.freeze({
    account: 'Profile, billing, sessions, privacy',
    interface: 'Theme, appearance, notifications, keyboard',
    ai: 'Models, providers, effort, agent mode',
    extensions: 'Connectors, MCP servers, skills, plugins',
  });

export interface SettingsSection {
  id: string;
  category: SettingsCategory;
  label: string;
  description?: string;
  surfaceOnly?: 'desktop' | 'web' | 'mobile' | 'cli' | 'extension' | 'extension-vscode';
}

export const SETTINGS_SECTIONS: ReadonlyArray<SettingsSection> = Object.freeze([
  { id: 'profile', category: 'account', label: 'Profile' },
  { id: 'billing', category: 'account', label: 'Billing & subscription' },
  { id: 'sessions', category: 'account', label: 'Active sessions' },
  { id: 'privacy', category: 'account', label: 'Privacy & data' },
  { id: 'theme', category: 'interface', label: 'Theme & appearance' },
  { id: 'notifications', category: 'interface', label: 'Notifications' },
  { id: 'keyboard', category: 'interface', label: 'Keyboard shortcuts' },
  { id: 'models', category: 'ai', label: 'Models & API keys' },
  { id: 'agent-mode', category: 'ai', label: 'Agent mode & permissions' },
  { id: 'effort', category: 'ai', label: 'Default effort' },
  { id: 'memory', category: 'ai', label: 'Memory & personalization' },
  { id: 'connectors', category: 'extensions', label: 'Connectors' },
  { id: 'mcp', category: 'extensions', label: 'MCP servers' },
  { id: 'skills', category: 'extensions', label: 'Skills library' },
  { id: 'plugins', category: 'extensions', label: 'Plugins' },
  { id: 'sandbox', category: 'ai', label: 'Sandbox', surfaceOnly: 'cli' },
  { id: 'desktop-app', category: 'interface', label: 'Desktop app', surfaceOnly: 'desktop' },
]);

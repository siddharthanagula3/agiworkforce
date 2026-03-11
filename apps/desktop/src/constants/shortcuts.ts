/**
 * Keyboard shortcut definitions for AGI Workforce desktop app.
 *
 * Each definition carries a stable ID, the default key binding, a human-readable
 * description, the settings category it belongs to, and an action string that is
 * dispatched by useShortcutActions.
 */

export interface ShortcutModifiers {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

export interface ShortcutDefinition {
  id: string;
  key: string;
  modifiers: ShortcutModifiers;
  description: string;
  category: 'chat' | 'navigation' | 'model' | 'agent' | 'tools' | 'window';
  action: string;
}

export const DEFAULT_SHORTCUTS: ShortcutDefinition[] = [
  // Chat
  {
    id: 'new-chat',
    key: 'n',
    modifiers: { meta: true },
    description: 'New chat',
    category: 'chat',
    action: 'chat.new',
  },
  {
    id: 'clear',
    key: 'l',
    modifiers: { meta: true },
    description: 'Clear chat',
    category: 'chat',
    action: 'chat.clear',
  },
  {
    id: 'focus-input',
    key: 'i',
    modifiers: { meta: true },
    description: 'Focus input',
    category: 'chat',
    action: 'chat.focusInput',
  },
  {
    id: 'copy-last',
    key: 'c',
    modifiers: { meta: true, shift: true },
    description: 'Copy last response',
    category: 'chat',
    action: 'chat.copyLast',
  },
  {
    id: 'voice-input',
    key: 'v',
    modifiers: { meta: true, shift: true },
    description: 'Voice input',
    category: 'chat',
    action: 'chat.voiceInput',
  },

  // Navigation
  {
    id: 'settings',
    key: ',',
    modifiers: { meta: true },
    description: 'Open settings',
    category: 'navigation',
    action: 'app.settings',
  },
  {
    id: 'search',
    key: 'f',
    modifiers: { meta: true, shift: true },
    description: 'Focus search',
    category: 'navigation',
    action: 'app.search',
  },

  // Model
  {
    id: 'model-select',
    key: '.',
    modifiers: { meta: true },
    description: 'Model selector',
    category: 'model',
    action: 'model.select',
  },
  {
    id: 'cycle-model',
    key: 'm',
    modifiers: { meta: true, shift: true },
    description: 'Cycle model',
    category: 'model',
    action: 'model.cycle',
  },
  {
    id: 'toggle-think',
    key: 'e',
    modifiers: { meta: true },
    description: 'Toggle thinking',
    category: 'model',
    action: 'model.toggleThinking',
  },

  // Agent
  {
    id: 'cycle-agent',
    key: 'a',
    modifiers: { meta: true, shift: true },
    description: 'Cycle agent mode',
    category: 'agent',
    action: 'agent.cycle',
  },
  {
    id: 'plan-mode',
    key: 'p',
    modifiers: { meta: true, shift: true },
    description: 'Plan mode',
    category: 'agent',
    action: 'agent.planMode',
  },
  {
    id: 'build-mode',
    key: 'b',
    modifiers: { meta: true, shift: true },
    description: 'Build mode',
    category: 'agent',
    action: 'agent.buildMode',
  },

  {
    id: 'cycle-variant',
    key: 'r',
    modifiers: { meta: true, shift: true },
    description: 'Toggle thinking/reasoning model variant',
    category: 'model',
    action: 'model.cycleVariant',
  },

  // Tools
  {
    id: 'tool-timeline',
    key: 't',
    modifiers: { meta: true, shift: true },
    description: 'Toggle tool timeline',
    category: 'tools',
    action: 'tools.timeline',
  },

  // Window
  {
    id: 'toggle-sidebar',
    key: 's',
    modifiers: { meta: true },
    description: 'Toggle sidebar',
    category: 'window',
    action: 'window.toggleSidebar',
  },
  {
    id: 'minimize',
    key: 'h',
    modifiers: { meta: true },
    description: 'Minimize window',
    category: 'window',
    action: 'window.minimize',
  },
  {
    id: 'fullscreen',
    key: 'f',
    modifiers: { meta: true, ctrl: true },
    description: 'Toggle fullscreen',
    category: 'window',
    action: 'window.fullscreen',
  },
  {
    id: 'zoom-in',
    key: '=',
    modifiers: { meta: true },
    description: 'Zoom in',
    category: 'window',
    action: 'window.zoomIn',
  },
  {
    id: 'zoom-out',
    key: '-',
    modifiers: { meta: true },
    description: 'Zoom out',
    category: 'window',
    action: 'window.zoomOut',
  },
  {
    id: 'zoom-reset',
    key: '0',
    modifiers: { meta: true },
    description: 'Reset zoom',
    category: 'window',
    action: 'window.zoomReset',
  },
];

export const SHORTCUT_CATEGORY_LABELS: Record<ShortcutDefinition['category'], string> = {
  chat: 'Chat',
  navigation: 'Navigation',
  model: 'Model',
  agent: 'Agent',
  tools: 'Tools',
  window: 'Window',
};

/**
 * Serializes a key+modifiers pair into a canonical string like "meta+shift+m".
 * Used as the value stored in customKeybindings.
 */
export function serializeCombo(key: string, modifiers: ShortcutModifiers): string {
  const parts: string[] = [];
  if (modifiers.ctrl) parts.push('ctrl');
  if (modifiers.alt) parts.push('alt');
  if (modifiers.shift) parts.push('shift');
  if (modifiers.meta) parts.push('meta');
  parts.push(key.toLowerCase());
  return parts.join('+');
}

/**
 * Parses a canonical combo string back to key + modifiers.
 * Returns null if the string is malformed.
 */
export function parseCombo(combo: string): { key: string; modifiers: ShortcutModifiers } | null {
  const parts = combo.split('+');
  if (parts.length === 0) return null;

  const modifiers: ShortcutModifiers = {};
  const modifierKeys = new Set(['ctrl', 'alt', 'shift', 'meta']);
  const keyParts: string[] = [];

  for (const part of parts) {
    if (modifierKeys.has(part)) {
      modifiers[part as keyof ShortcutModifiers] = true;
    } else {
      keyParts.push(part);
    }
  }

  if (keyParts.length !== 1 || keyParts[0] === undefined) return null;
  return { key: keyParts[0], modifiers };
}

/**
 * Formats a combo for human-readable display (e.g., "Cmd+Shift+M").
 */
export function formatComboDisplay(key: string, modifiers: ShortcutModifiers): string {
  const isMac =
    typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const parts: string[] = [];

  if (modifiers.ctrl) parts.push('Ctrl');
  if (modifiers.alt) parts.push(isMac ? 'Opt' : 'Alt');
  if (modifiers.shift) parts.push('Shift');
  if (modifiers.meta) parts.push(isMac ? 'Cmd' : 'Win');

  const keyDisplay = key.length === 1 ? key.toUpperCase() : key;
  parts.push(keyDisplay);

  return parts.join('+');
}

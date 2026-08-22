export interface ShortcutModifiers {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

export type RendererShortcutAction =
  | 'app.search'
  | 'app.commandPalette'
  | 'model.select'
  | 'edit.undoLast'
  | 'window.toggleSidebar'
  | 'window.minimize';

interface ShortcutBase {
  id: string;
  key: string;
  modifiers: ShortcutModifiers;
  description: string;
  category: 'navigation' | 'model' | 'editing' | 'window';
}

export interface RendererShortcutDefinition extends ShortcutBase {
  action: RendererShortcutAction;
  backendId?: never;
}

export interface GlobalShortcutDefinition extends ShortcutBase {
  action?: never;
  backendId: string;
}

export type ShortcutDefinition = RendererShortcutDefinition | GlobalShortcutDefinition;

export const RENDERER_SHORTCUTS: RendererShortcutDefinition[] = [
  {
    id: 'search',
    key: 'k',
    modifiers: { meta: true },
    description: 'Search',
    category: 'navigation',
    action: 'app.search',
  },
  {
    id: 'command-palette',
    key: 'k',
    modifiers: { meta: true, shift: true },
    description: 'Command palette',
    category: 'navigation',
    action: 'app.commandPalette',
  },

  {
    id: 'model-select',
    key: '.',
    modifiers: { meta: true },
    description: 'Model selector',
    category: 'model',
    action: 'model.select',
  },

  {
    id: 'undo-last',
    key: 'z',
    modifiers: { meta: true, alt: true },
    description: 'Undo last agent change',
    category: 'editing',
    action: 'edit.undoLast',
  },

  {
    id: 'toggle-sidebar',
    key: 'u',
    modifiers: { meta: true, shift: true },
    description: 'Toggle sidebar',
    category: 'window',
    action: 'window.toggleSidebar',
  },
  {
    id: 'minimize',
    key: 'm',
    modifiers: { meta: true },
    description: 'Minimize window',
    category: 'window',
    action: 'window.minimize',
  },
];

function isWindowsPlatform(): boolean {
  return typeof navigator !== 'undefined' && navigator.platform.toUpperCase().startsWith('WIN');
}

function quickSummonDefault(): { key: string; modifiers: ShortcutModifiers } {
  return isWindowsPlatform()
    ? { key: 'space', modifiers: { ctrl: true, alt: true } }
    : { key: 'space', modifiers: { alt: true } };
}

export const GLOBAL_SHORTCUTS: GlobalShortcutDefinition[] = [
  {
    id: 'quick-summon',
    ...quickSummonDefault(),
    description: 'Show or hide the app from anywhere',
    category: 'window',
    backendId: 'quick_summon',
  },
  {
    id: 'quick-capture',
    key: 's',
    modifiers: { meta: true, shift: true },
    description: 'Quick screen capture',
    category: 'window',
    backendId: 'quick_capture',
  },
  {
    id: 'floating-window',
    key: 'f',
    modifiers: { meta: true, shift: true },
    description: 'Toggle floating window',
    category: 'window',
    backendId: 'floating_window',
  },
];

export const DEFAULT_SHORTCUTS: ShortcutDefinition[] = [...RENDERER_SHORTCUTS, ...GLOBAL_SHORTCUTS];

export const SHORTCUT_CATEGORY_LABELS: Record<ShortcutDefinition['category'], string> = {
  navigation: 'Navigation',
  model: 'Model',
  editing: 'Editing',
  window: 'Window',
};

export function serializeCombo(key: string, modifiers: ShortcutModifiers): string {
  const parts: string[] = [];
  if (modifiers.ctrl) parts.push('ctrl');
  if (modifiers.alt) parts.push('alt');
  if (modifiers.shift) parts.push('shift');
  if (modifiers.meta) parts.push('meta');
  parts.push(key.toLowerCase());
  return parts.join('+');
}

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

export function resolveBinding(
  shortcut: ShortcutDefinition,
  customKeybindings: Record<string, string>,
): { key: string; modifiers: ShortcutModifiers } {
  const custom = customKeybindings[shortcut.id];
  if (custom) {
    const parsed = parseCombo(custom);
    if (parsed) return parsed;
  }
  return { key: shortcut.key, modifiers: shortcut.modifiers };
}

const isMacPlatform = (): boolean =>
  typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

interface ModifierEvent {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export function matchesBinding(
  event: ModifierEvent,
  binding: { key: string; modifiers: ShortcutModifiers },
): boolean {
  if (!event.key) return false;
  if (event.key.toLowerCase() !== binding.key.toLowerCase()) return false;

  const onMac = isMacPlatform();
  const wantsPrimary = onMac
    ? Boolean(binding.modifiers.meta)
    : Boolean(binding.modifiers.meta || binding.modifiers.ctrl);
  const primaryHeld = onMac ? event.metaKey : event.ctrlKey;

  if (wantsPrimary !== primaryHeld) return false;
  if (onMac && Boolean(binding.modifiers.ctrl) !== event.ctrlKey) return false;
  if (!onMac && event.metaKey) return false;
  if (Boolean(binding.modifiers.alt) !== event.altKey) return false;
  if (Boolean(binding.modifiers.shift) !== event.shiftKey) return false;

  return true;
}

export function toBackendAccelerator(combo: string): string {
  return combo
    .split('+')
    .map((part) => (part === 'meta' ? 'CommandOrControl' : part))
    .join('+');
}

export function formatComboDisplay(key: string, modifiers: ShortcutModifiers): string {
  const isMac = isMacPlatform();
  const parts: string[] = [];

  if (modifiers.ctrl) parts.push('Ctrl');
  if (modifiers.alt) parts.push(isMac ? 'Opt' : 'Alt');
  if (modifiers.shift) parts.push('Shift');
  if (modifiers.meta && (isMac || !modifiers.ctrl)) parts.push(isMac ? 'Cmd' : 'Ctrl');

  const keyDisplay =
    key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);
  parts.push(keyDisplay);

  return parts.join('+');
}

/**
 * Keyboard shortcut definitions for AGI Workforce desktop app.
 *
 * Two kinds of shortcut live here, and every entry must be one of them:
 *
 * - Renderer shortcuts carry an `action` that the App shell keydown router
 *   (`App.tsx`) dispatches. The router types its handler map as
 *   `Record<RendererShortcutAction, ...>`, so a renderer entry cannot be added
 *   without a handler — the build fails first.
 * - Global shortcuts carry a `backendId`: the id of the OS-level hotkey the
 *   Rust registry owns (`src-tauri/src/sys/commands/shortcuts.rs`). Rebinding
 *   one goes through `shortcuts_update` under that id.
 *
 * Nothing else belongs in the list. A row with neither is a control that
 * rebinds a key nothing listens for, which is what this list used to be.
 *
 * There is a third owner of keys that this list deliberately does NOT cover:
 * the native window menu (`src-tauri/src/ui/window_menu.rs`). Menu key
 * equivalents are consumed by the OS before the webview ever sees a keydown,
 * so a row defaulting to CmdOrCtrl+N / +W / +F / +R / +Plus / +Minus / +0 /
 * +`,` or the predefined Fullscreen/Hide equivalents can never reach the
 * router, and rebinding it would leave the menu key working anyway. Those
 * actions are displayed and (only) rebindable in the native menu; do not add
 * rows for them here.
 */

export interface ShortcutModifiers {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

/**
 * Actions dispatched by the App shell keydown router. Adding a member here
 * without adding a handler in `App.tsx` is a type error.
 */
export type RendererShortcutAction =
  | 'app.search'
  | 'app.commandPalette'
  | 'model.select'
  | 'window.toggleSidebar'
  | 'window.minimize';

interface ShortcutBase {
  id: string;
  key: string;
  modifiers: ShortcutModifiers;
  description: string;
  category: 'navigation' | 'model' | 'window';
}

export interface RendererShortcutDefinition extends ShortcutBase {
  action: RendererShortcutAction;
  backendId?: never;
}

export interface GlobalShortcutDefinition extends ShortcutBase {
  action?: never;
  /** Must match a `ShortcutsState::with_defaults()` id in `shortcuts.rs`. */
  backendId: string;
}

export type ShortcutDefinition = RendererShortcutDefinition | GlobalShortcutDefinition;

export const RENDERER_SHORTCUTS: RendererShortcutDefinition[] = [
  // Navigation
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

  // Model
  {
    id: 'model-select',
    key: '.',
    modifiers: { meta: true },
    description: 'Model selector',
    category: 'model',
    action: 'model.select',
  },

  // Window
  {
    id: 'toggle-sidebar',
    key: 'u',
    modifiers: { meta: true, shift: true },
    description: 'Toggle sidebar',
    category: 'window',
    action: 'window.toggleSidebar',
  },
  {
    // Not Cmd+H: on macOS the app menu's predefined Hide item owns that
    // equivalent, so the keydown never reaches the renderer.
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

/**
 * OS-level hotkeys. These fire while the app is in the background, so the Rust
 * registry — not the renderer — owns them.
 *
 * Quick Query (`toggle_window`) is deliberately absent: it already has its own
 * enable/combo control in the settings panel (`globalHotkeyPreferences`), and a
 * second editor for the same hotkey would let the two disagree.
 */
export const GLOBAL_SHORTCUTS: GlobalShortcutDefinition[] = [
  {
    id: 'quick-summon',
    // Mirrors `platform_default_quick_summon_combo()` in shortcuts.rs, which
    // ships Control+Alt+Space on Windows (Alt+Space is the Windows system
    // menu) and Alt+Space elsewhere. If this row disagrees, the page shows a
    // key the registry never held and "reset to default" pushes it back in.
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
 * The binding actually in force for a shortcut: the user's override when it
 * parses, the shipped default otherwise.
 */
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

/**
 * True when a keydown event is exactly this binding.
 *
 * `meta` means "the platform's primary modifier": Command on macOS, Control
 * elsewhere. Every other modifier has to match exactly, so Cmd+Shift+K can no
 * longer fire Cmd+K's action on the way past.
 */
export function matchesBinding(
  event: ModifierEvent,
  binding: { key: string; modifiers: ShortcutModifiers },
): boolean {
  if (!event.key) return false;
  if (event.key.toLowerCase() !== binding.key.toLowerCase()) return false;

  const onMac = isMacPlatform();
  // Off macOS there is no separate Command key, so `meta` and `ctrl` both land
  // on Control and the Windows/Super key is never part of a binding.
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

/**
 * Rewrites a stored combo into a Tauri accelerator for the Rust registry.
 *
 * `meta` is this app's primary modifier, which Rust spells `CommandOrControl`;
 * sending the literal "meta" would register the Windows/Super key instead of
 * Control on Windows and Linux.
 */
export function toBackendAccelerator(combo: string): string {
  return combo
    .split('+')
    .map((part) => (part === 'meta' ? 'CommandOrControl' : part))
    .join('+');
}

/**
 * Formats a combo for human-readable display (e.g., "Cmd+Shift+M").
 */
export function formatComboDisplay(key: string, modifiers: ShortcutModifiers): string {
  const isMac = isMacPlatform();
  const parts: string[] = [];

  if (modifiers.ctrl) parts.push('Ctrl');
  if (modifiers.alt) parts.push(isMac ? 'Opt' : 'Alt');
  if (modifiers.shift) parts.push('Shift');
  // Off macOS `meta` is the same physical key as Control (see matchesBinding),
  // so a combo carrying both must still print one "Ctrl", not "Ctrl+Ctrl".
  if (modifiers.meta && (isMac || !modifiers.ctrl)) parts.push(isMac ? 'Cmd' : 'Ctrl');

  const keyDisplay =
    key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);
  parts.push(keyDisplay);

  return parts.join('+');
}

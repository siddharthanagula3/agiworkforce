import { useCallback, useEffect, useRef } from 'react';

/**
 * Platform detection for keyboard shortcuts
 */
const isMac =
  typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

/**
 * Modifier keys for keyboard shortcuts
 */
export interface Modifiers {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean; // Command key on Mac
}

/**
 * Keyboard shortcut definition
 */
export interface KeyboardShortcut {
  key: string; // e.g., 'k', 'Enter', 'ArrowDown'
  modifiers?: Modifiers;
  action: (event: KeyboardEvent) => void | Promise<void>;
  preventDefault?: boolean;
  stopPropagation?: boolean;
  description?: string;
  enabled?: boolean;
  scope?: string; // For scoped shortcuts
}

/**
 * Options for useKeyboardShortcuts hook
 */
export interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
  enableOnFormElements?: boolean; // Allow shortcuts on input/textarea/select
  scope?: string; // Scope for these shortcuts
  debug?: boolean;
}

/**
 * Check if modifiers match
 */
function modifiersMatch(event: KeyboardEvent, modifiers: Modifiers = {}): boolean {
  const ctrl = modifiers.ctrl ?? false;
  const alt = modifiers.alt ?? false;
  const shift = modifiers.shift ?? false;
  const meta = modifiers.meta ?? false;

  return (
    event.ctrlKey === ctrl &&
    event.altKey === alt &&
    event.shiftKey === shift &&
    event.metaKey === meta
  );
}

/**
 * Check if target element is a form element
 */
function isFormElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target.isContentEditable
  );
}

/**
 * Normalize key names for cross-browser compatibility
 */
function normalizeKey(key: string): string {
  // Handle special cases
  const keyMap: Record<string, string> = {
    Esc: 'Escape',
    ' ': 'Space',
    Left: 'ArrowLeft',
    Right: 'ArrowRight',
    Up: 'ArrowUp',
    Down: 'ArrowDown',
  };

  return keyMap[key] || key;
}

/**
 * Custom hook for managing keyboard shortcuts
 *
 * @example
 * ```tsx
 * useKeyboardShortcuts([
 *   {
 *     key: 'k',
 *     modifiers: { ctrl: true, meta: true }, // Ctrl+K on Windows, Cmd+K on Mac
 *     action: () => openCommandPalette(),
 *     description: 'Open command palette'
 *   },
 *   {
 *     key: 'Escape',
 *     action: () => closeDialog(),
 *     enabled: isDialogOpen
 *   }
 * ], { enableOnFormElements: false });
 * ```
 */
export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  options: UseKeyboardShortcutsOptions = {},
): void {
  const { enabled = true, enableOnFormElements = false, scope } = options;

  // Use ref to avoid recreating listener on every render
  const shortcutsRef = useRef<KeyboardShortcut[]>(shortcuts);
  shortcutsRef.current = shortcuts;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Check if shortcuts are globally disabled
      if (!enabled) {
        return;
      }

      // Skip if typing in form elements (unless explicitly enabled)
      if (!enableOnFormElements && isFormElement(event.target)) {
        return;
      }

      const normalizedKey = normalizeKey(event.key);

      // Find matching shortcuts
      for (const shortcut of shortcutsRef.current) {
        // Skip if shortcut is disabled
        if (shortcut.enabled === false) {
          continue;
        }

        // Skip if scope doesn't match
        if (scope && shortcut.scope && scope !== shortcut.scope) {
          continue;
        }

        // Check if key matches
        if (normalizedKey !== normalizeKey(shortcut.key)) {
          continue;
        }

        // Check if modifiers match
        if (!modifiersMatch(event, shortcut.modifiers)) {
          continue;
        }

        // Match found!

        // Prevent default behavior if requested
        if (shortcut.preventDefault !== false) {
          event.preventDefault();
        }

        // Stop propagation if requested
        if (shortcut.stopPropagation) {
          event.stopPropagation();
        }

        // Execute action
        Promise.resolve(shortcut.action(event)).catch((error) => {
          console.error('[Keyboard Shortcut] Action failed:', error);
        });

        // Only execute first matching shortcut
        break;
      }
    },
    [enabled, enableOnFormElements, scope],
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, handleKeyDown]);
}

/**
 * Hook for single keyboard shortcut (simpler API)
 */
export function useKeyboardShortcut(
  key: string,
  action: (event: KeyboardEvent) => void | Promise<void>,
  modifiers?: Modifiers,
  options?: UseKeyboardShortcutsOptions,
): void {
  useKeyboardShortcuts(
    [
      {
        key,
        modifiers,
        action,
      },
    ],
    options,
  );
}

/**
 * Helper to create platform-aware shortcuts (Cmd on Mac, Ctrl on Windows)
 */
export function platformModifiers(options: { shift?: boolean; alt?: boolean }): Modifiers {
  if (isMac) {
    return {
      meta: true,
      shift: options.shift,
      alt: options.alt,
    };
  } else {
    return {
      ctrl: true,
      shift: options.shift,
      alt: options.alt,
    };
  }
}

/**
 * Format shortcut for display (e.g., "Ctrl+K" or "Cmd+K")
 */
export function formatShortcut(shortcut: { key: string; modifiers?: Modifiers }): string {
  const parts: string[] = [];

  if (shortcut.modifiers) {
    if (shortcut.modifiers.ctrl) parts.push(isMac ? 'Ctrl' : 'Ctrl');
    if (shortcut.modifiers.alt) parts.push(isMac ? 'Opt' : 'Alt');
    if (shortcut.modifiers.shift) parts.push('Shift');
    if (shortcut.modifiers.meta) parts.push(isMac ? 'Cmd' : 'Win');
  }

  // Format key name for display
  const keyDisplay = shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key;
  parts.push(keyDisplay);

  return parts.join('+');
}

/**
 * Global shortcut registry for debugging and documentation
 */
const globalShortcutRegistry = new Map<string, KeyboardShortcut>();

export function registerGlobalShortcut(id: string, shortcut: KeyboardShortcut): void {
  globalShortcutRegistry.set(id, shortcut);
}

export function unregisterGlobalShortcut(id: string): void {
  globalShortcutRegistry.delete(id);
}

export function getAllGlobalShortcuts(): Array<{ id: string; shortcut: KeyboardShortcut }> {
  return Array.from(globalShortcutRegistry.entries()).map(([id, shortcut]) => ({
    id,
    shortcut,
  }));
}

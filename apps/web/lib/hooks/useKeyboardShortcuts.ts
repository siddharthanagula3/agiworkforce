'use client';

import { useCallback, useEffect, useRef } from 'react';

function getIsMac(): boolean {
  return typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
}

export interface Modifiers {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

export interface KeyboardShortcut {
  key: string;
  modifiers?: Modifiers;
  action: (event: KeyboardEvent) => void | Promise<void>;
  preventDefault?: boolean;
  stopPropagation?: boolean;
  description?: string;
  enabled?: boolean;
  scope?: string;
}

export interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
  enableOnFormElements?: boolean;
  scope?: string;
  debug?: boolean;
}

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

function normalizeKey(key: string): string {
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

export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  options: UseKeyboardShortcutsOptions = {},
): void {
  const { enabled = true, enableOnFormElements = false, scope } = options;

  const shortcutsRef = useRef<KeyboardShortcut[]>(shortcuts);
  shortcutsRef.current = shortcuts;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) {
        return;
      }

      if (!enableOnFormElements && isFormElement(event.target)) {
        return;
      }

      const normalizedKey = normalizeKey(event.key);

      for (const shortcut of shortcutsRef.current) {
        if (shortcut.enabled === false) {
          continue;
        }

        // Shortcuts WITH a scope only fire when the active scope matches.
        // Shortcuts WITHOUT a scope are global and fire in every scope.
        if (shortcut.scope && scope !== shortcut.scope) {
          continue;
        }

        if (normalizedKey !== normalizeKey(shortcut.key)) {
          continue;
        }

        if (!modifiersMatch(event, shortcut.modifiers)) {
          continue;
        }

        if (shortcut.preventDefault === true) {
          event.preventDefault();
        }

        if (shortcut.stopPropagation) {
          event.stopPropagation();
        }

        Promise.resolve(shortcut.action(event)).catch((error) => {
          console.error('[Keyboard Shortcut] Action failed:', error);
        });

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

export function platformModifiers(options: { shift?: boolean; alt?: boolean }): Modifiers {
  if (getIsMac()) {
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

export function formatShortcut(shortcut: { key: string; modifiers?: Modifiers }): string {
  const parts: string[] = [];
  const isMac = getIsMac();

  if (shortcut.modifiers) {
    if (shortcut.modifiers.ctrl) parts.push(isMac ? '⌃' : 'Ctrl');
    if (shortcut.modifiers.alt) parts.push(isMac ? 'Opt' : 'Alt');
    if (shortcut.modifiers.shift) parts.push('Shift');
    if (shortcut.modifiers.meta) parts.push(isMac ? 'Cmd' : 'Win');
  }

  const keyDisplay = shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key;
  parts.push(keyDisplay);

  return parts.join('+');
}

// Read-only lookup registry for UI (e.g., a shortcuts help menu).
// This registry does NOT dispatch shortcuts — it is only used to enumerate
// registered shortcuts for display purposes. Actual dispatch is handled by
// the useKeyboardShortcuts hook which listens for keydown events directly.
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

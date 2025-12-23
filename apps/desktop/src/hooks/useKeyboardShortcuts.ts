import { useCallback, useEffect, useRef } from 'react';

const isMac =
  typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

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

        if (scope && shortcut.scope && scope !== shortcut.scope) {
          continue;
        }

        if (normalizedKey !== normalizeKey(shortcut.key)) {
          continue;
        }

        if (!modifiersMatch(event, shortcut.modifiers)) {
          continue;
        }

        if (shortcut.preventDefault !== false) {
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

export function formatShortcut(shortcut: { key: string; modifiers?: Modifiers }): string {
  const parts: string[] = [];

  if (shortcut.modifiers) {
    if (shortcut.modifiers.ctrl) parts.push(isMac ? 'Ctrl' : 'Ctrl');
    if (shortcut.modifiers.alt) parts.push(isMac ? 'Opt' : 'Alt');
    if (shortcut.modifiers.shift) parts.push('Shift');
    if (shortcut.modifiers.meta) parts.push(isMac ? 'Cmd' : 'Win');
  }

  const keyDisplay = shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key;
  parts.push(keyDisplay);

  return parts.join('+');
}

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

import { describe, expect, it } from 'vitest';
import {
  CHAT_SHORTCUTS,
  findShortcutConflicts,
  formatShortcutKeys,
  matchesShortcut,
  type ShortcutDefinition,
} from '../shortcutRegistry';

function keyEvent(
  key: string,
  modifiers: { meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean } = {},
) {
  return {
    key,
    metaKey: modifiers.meta ?? false,
    ctrlKey: modifiers.ctrl ?? false,
    shiftKey: modifiers.shift ?? false,
    altKey: modifiers.alt ?? false,
  };
}

const appBinding = (overrides: Partial<ShortcutDefinition>): ShortcutDefinition => ({
  id: 'planted',
  key: 'K',
  ctrl: true,
  meta: true,
  description: 'Planted',
  category: 'ui',
  scope: 'app',
  ...overrides,
});

describe('CHAT_SHORTCUTS', () => {
  it('has no two bindings that can receive the same keystroke', () => {
    expect(findShortcutConflicts(CHAT_SHORTCUTS)).toEqual([]);
  });

  it('never takes Shift+Tab, which moves focus backwards out of a text field', () => {
    expect(
      CHAT_SHORTCUTS.filter((shortcut) =>
        matchesShortcut(keyEvent('Tab', { shift: true }), shortcut, false),
      ),
    ).toEqual([]);
  });

  it('gives every binding an id of its own', () => {
    const ids = CHAT_SHORTCUTS.map((shortcut) => shortcut.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('findShortcutConflicts', () => {
  it('reports two app bindings on one chord', () => {
    const conflicts = findShortcutConflicts([
      appBinding({ id: 'first', key: 'B' }),
      appBinding({ id: 'second', key: 'b' }),
    ]);
    expect(conflicts).toEqual([{ chord: 'mod+++b', ids: ['first', 'second'] }]);
  });

  it('lets an unmodified app key share a composer key, since it never fires while typing', () => {
    expect(
      findShortcutConflicts([
        appBinding({ id: 'focus', key: 'Escape', ctrl: false, meta: false }),
        appBinding({ id: 'stop', key: 'Escape', ctrl: false, meta: false, scope: 'composer' }),
      ]),
    ).toEqual([]);
  });

  it('reports a modified app chord that would also fire inside the composer', () => {
    const conflicts = findShortcutConflicts([
      appBinding({ id: 'app-enter', key: 'Enter', shift: true }),
      appBinding({ id: 'composer-enter', key: 'Enter', shift: true, scope: 'composer' }),
    ]);
    expect(conflicts.map((conflict) => conflict.ids)).toEqual([['app-enter', 'composer-enter']]);
  });

  it('reports a binding on a chord something outside the page already claims', () => {
    const conflicts = findShortcutConflicts(
      [appBinding({ id: 'palette-clash' })],
      [{ id: 'command-palette', key: 'k', ctrl: true, meta: true }],
    );
    expect(conflicts.map((conflict) => conflict.ids)).toEqual([
      ['palette-clash', 'command-palette'],
    ]);
  });

  it('reports a repeated id', () => {
    const conflicts = findShortcutConflicts([
      appBinding({ id: 'twice', key: 'B' }),
      appBinding({ id: 'twice', key: 'J' }),
    ]);
    expect(conflicts).toContainEqual({ chord: 'id', ids: ['twice', 'twice'] });
  });
});

describe('matchesShortcut', () => {
  const invert = CHAT_SHORTCUTS.find((shortcut) => shortcut.id === 'composer-follow-up-invert')!;

  it('uses Cmd on macOS and Ctrl elsewhere', () => {
    expect(matchesShortcut(keyEvent('Enter', { meta: true, shift: true }), invert, true)).toBe(
      true,
    );
    expect(matchesShortcut(keyEvent('Enter', { ctrl: true, shift: true }), invert, false)).toBe(
      true,
    );
    expect(matchesShortcut(keyEvent('Enter', { ctrl: true, shift: true }), invert, true)).toBe(
      false,
    );
  });

  it('does not take a plain or Shift-only Enter for the invert chord', () => {
    expect(matchesShortcut(keyEvent('Enter'), invert, false)).toBe(false);
    expect(matchesShortcut(keyEvent('Enter', { shift: true }), invert, false)).toBe(false);
  });

  it('compares letters unshifted', () => {
    const copy = CHAT_SHORTCUTS.find((shortcut) => shortcut.id === 'copy-last-message')!;
    expect(matchesShortcut(keyEvent('C', { meta: true, shift: true }), copy, true)).toBe(true);
  });
});

describe('formatShortcutKeys', () => {
  it('names the modifiers per platform', () => {
    const invert = CHAT_SHORTCUTS.find((shortcut) => shortcut.id === 'composer-follow-up-invert')!;
    expect(formatShortcutKeys(invert, true)).toEqual(['⌘', '⇧', 'Enter']);
    expect(formatShortcutKeys(invert, false)).toEqual(['Ctrl', 'Shift', 'Enter']);
  });
});

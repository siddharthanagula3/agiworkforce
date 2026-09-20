import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SHORTCUTS,
  RENDERER_SHORTCUTS,
  formatComboDisplay,
  matchesBinding,
  resolveBinding,
  serializeCombo,
  toBackendAccelerator,
} from '../shortcuts';

function onPlatform(platform: string): void {
  vi.stubGlobal('navigator', { platform });
}

function keydown(overrides: Partial<Record<string, unknown>>) {
  return {
    key: 'n',
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...overrides,
  } as { key: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean };
}

describe('DEFAULT_SHORTCUTS', () => {
  it('has a unique key combo per shortcut', () => {
    const comboToIds = new Map<string, string[]>();
    for (const shortcut of DEFAULT_SHORTCUTS) {
      const combo = serializeCombo(shortcut.key, shortcut.modifiers);
      const ids = comboToIds.get(combo) ?? [];
      ids.push(shortcut.id);
      comboToIds.set(combo, ids);
    }

    const duplicates = [...comboToIds.entries()].filter(([, ids]) => ids.length > 1);
    expect(duplicates, `duplicate key combos: ${JSON.stringify(duplicates)}`).toHaveLength(0);
  });

  it('has a unique id per shortcut', () => {
    const ids = DEFAULT_SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Starting a new chat is the binding a user arrives already knowing, so it
  // takes the key every comparable app uses rather than whatever was free.
  it('starts a new chat on the key every desktop app uses for it', () => {
    const newChat = RENDERER_SHORTCUTS.find((shortcut) => shortcut.action === 'chat.new');

    expect(newChat).toBeDefined();
    expect(serializeCombo(newChat!.key, newChat!.modifiers)).toBe(
      serializeCombo('n', { meta: true }),
    );
  });
});

describe('one binding, two platforms', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the primary modifier as Command on macOS and Control elsewhere', () => {
    const newChat = RENDERER_SHORTCUTS.find((shortcut) => shortcut.action === 'chat.new')!;
    const binding = resolveBinding(newChat, {});

    onPlatform('MacIntel');
    expect(matchesBinding(keydown({ metaKey: true }), binding)).toBe(true);
    expect(matchesBinding(keydown({ ctrlKey: true }), binding)).toBe(false);

    onPlatform('Win32');
    expect(matchesBinding(keydown({ ctrlKey: true }), binding)).toBe(true);
    expect(matchesBinding(keydown({ metaKey: true }), binding)).toBe(false);
  });

  it('labels the same chord for the platform the reader is on', () => {
    onPlatform('MacIntel');
    expect(formatComboDisplay('n', { meta: true })).toBe('Cmd+N');
    expect(formatComboDisplay('z', { meta: true, alt: true })).toBe('Opt+Cmd+Z');

    onPlatform('Win32');
    expect(formatComboDisplay('n', { meta: true })).toBe('Ctrl+N');
    expect(formatComboDisplay('z', { meta: true, alt: true })).toBe('Alt+Ctrl+Z');
  });

  it('hands the shell a chord that names both platforms at once', () => {
    expect(toBackendAccelerator(serializeCombo('s', { meta: true, shift: true }))).toBe(
      'shift+CommandOrControl+s',
    );
  });

  it('gives every shortcut a label on both platforms', () => {
    for (const platform of ['MacIntel', 'Win32']) {
      onPlatform(platform);
      for (const shortcut of DEFAULT_SHORTCUTS) {
        const binding = resolveBinding(shortcut, {});
        expect(formatComboDisplay(binding.key, binding.modifiers).length).toBeGreaterThan(0);
      }
    }
  });

  it('takes a remapped chord over the default one', () => {
    const newChat = RENDERER_SHORTCUTS.find((shortcut) => shortcut.action === 'chat.new')!;
    expect(resolveBinding(newChat, { [newChat.id]: 'meta+shift+o' })).toEqual({
      key: 'o',
      modifiers: { meta: true, shift: true },
    });
    expect(resolveBinding(newChat, { [newChat.id]: 'not a combo' })).toEqual({
      key: newChat.key,
      modifiers: newChat.modifiers,
    });
  });
});

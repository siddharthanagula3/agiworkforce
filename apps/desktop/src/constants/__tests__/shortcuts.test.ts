import { describe, expect, it } from 'vitest';
import { DEFAULT_SHORTCUTS, RENDERER_SHORTCUTS, serializeCombo } from '../shortcuts';

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

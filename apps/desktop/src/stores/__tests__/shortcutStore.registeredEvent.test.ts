import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = vi.hoisted(() => new Map<string, (event: { payload: unknown }) => void>());
const invoke = vi.hoisted(() => vi.fn());

vi.mock('../../lib/tauri-mock', async (importOriginal) => ({
  ...(await importOriginal<TauriMockModule>()),
  invoke,
  listen: vi.fn(async (event: string, handler: (event: { payload: unknown }) => void) => {
    handlers.set(event, handler);
    return () => handlers.delete(event);
  }),
}));

import { selectGlobalShortcuts, useShortcutStore } from '../shortcutStore';

type TauriMockModule = typeof import('../../lib/tauri-mock');

// The record `shortcuts_register` emits (sys/commands/shortcuts.rs, snake_case).
const SUMMON = {
  id: 'quick_summon',
  key: 'CommandOrControl+Shift+Space',
  description: 'Summon the app',
  action: 'quick_summon',
  enabled: true,
  is_global: true,
};

describe('shortcutStore registered event', () => {
  beforeEach(async () => {
    handlers.clear();
    invoke.mockReset();
    invoke.mockResolvedValue([]);
    useShortcutStore.setState({ shortcuts: [], defaults: [] });
    await useShortcutStore.getState().init();
  });

  it('adds the registered shortcut record and knows it is global', () => {
    handlers.get('shortcut_registered')?.({ payload: SUMMON });

    const state = useShortcutStore.getState();
    expect(state.shortcuts).toEqual([SUMMON]);
    expect(selectGlobalShortcuts(state)).toEqual([SUMMON]);
  });

  it('replaces the record when the same shortcut is registered again', () => {
    handlers.get('shortcut_registered')?.({ payload: SUMMON });
    handlers.get('shortcut_registered')?.({ payload: { ...SUMMON, key: 'Alt+Space' } });

    expect(useShortcutStore.getState().shortcuts).toEqual([{ ...SUMMON, key: 'Alt+Space' }]);
  });
});

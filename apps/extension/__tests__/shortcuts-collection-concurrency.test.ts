import { setImmediate as nextTurn } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedShortcut } from '../src/types';
import { ORIGIN_EXTENSION_PAGE } from '../src/background/policy';

type ShortcutApi = typeof import('../src/features/background/shortcuts');
let api: ShortcutApi;

beforeEach(async () => {
  vi.resetModules();
  api = await import('../src/features/background/shortcuts');
});
afterEach(() => vi.unstubAllGlobals());

function shortcut(id: string): SavedShortcut {
  return {
    id,
    name: id,
    prompt: `Original ${id}`,
    actions: [],
    createdAt: 1,
    createdByOrigin: ORIGIN_EXTENSION_PAGE,
  };
}

function storage(initial: SavedShortcut[], failure?: 'read' | 'write') {
  let rows = structuredClone(initial);
  let hold = true;
  let fail = failure;
  const pending: Array<() => void> = [];
  const runtime: { lastError: { message: string } | undefined } = { lastError: undefined };
  const local = {
    get: vi.fn((key: string, callback: (items: Record<string, SavedShortcut[]>) => void) => {
      expect(key).toBe(api.SHORTCUTS_STORAGE_KEY);
      const snapshot = structuredClone(rows);
      const rejectRead = fail === 'read';
      if (rejectRead) fail = undefined;
      const complete = () => {
        runtime.lastError = rejectRead ? { message: 'Fixture read refused' } : undefined;
        try {
          callback({ [key]: snapshot });
        } finally {
          runtime.lastError = undefined;
        }
      };
      if (hold) pending.push(complete);
      else queueMicrotask(complete);
    }),
    set: vi.fn(async (items: Record<string, SavedShortcut[]>) => {
      if (fail === 'write') {
        fail = undefined;
        throw new Error('Fixture write refused');
      }
      const next = items[api.SHORTCUTS_STORAGE_KEY];
      if (!next) throw new Error('Unexpected shortcut storage key');
      rows = structuredClone(next);
    }),
  };
  vi.stubGlobal('chrome', { storage: { local }, runtime });
  return {
    read: () => structuredClone(rows),
    release: () => {
      hold = false;
      for (const complete of pending.splice(0)) complete();
    },
  };
}

const deletion = () => api.handleDeleteShortcut({ type: 'DELETE_SHORTCUT', shortcutId: 'a' });
const update = () =>
  api.handleUpdateShortcut({
    type: 'UPDATE_SHORTCUT',
    shortcutId: 'b',
    name: 'Edited B',
    prompt: 'Updated B',
  });

describe('saved shortcut collection mutation ownership', () => {
  it('preserves an acknowledged deletion and an independent concurrent edit', async () => {
    const store = storage([shortcut('a'), shortcut('b')]);
    const removed = deletion();
    const edited = update();
    await nextTurn();
    store.release();
    const results = await Promise.all([removed, edited]);
    expect(results.every((result) => result.success)).toBe(true);
    expect(store.read()).toEqual([{ ...shortcut('b'), name: 'Edited B', prompt: 'Updated B' }]);
  });

  it('retains both independently acknowledged concurrent creates', async () => {
    const store = storage([]);
    const first = api.handleSaveShortcut({
      type: 'SAVE_SHORTCUT',
      name: 'First',
      prompt: 'First prompt',
      actions: [],
    });
    const second = api.handleSaveShortcut({
      type: 'SAVE_SHORTCUT',
      name: 'Second',
      prompt: 'Second prompt',
      actions: [],
    });
    await nextTurn();
    store.release();
    const results = await Promise.all([first, second]);
    expect(results.every((result) => result.success)).toBe(true);
    expect(
      store
        .read()
        .map((row) => row.name)
        .sort(),
    ).toEqual(['First', 'Second']);
    expect(new Set(store.read().map((row) => row.id)).size).toBe(2);
  });

  it.each(['read', 'write'] as const)(
    'reports a %s failure and admits the next independent mutation',
    async (failure) => {
      const store = storage([shortcut('a'), shortcut('b')], failure);
      const rejected = expect(deletion()).rejects.toThrow(`Fixture ${failure} refused`);
      const edited = update();
      await nextTurn();
      store.release();
      await Promise.all([rejected, edited.then((result) => expect(result.success).toBe(true))]);
      expect(store.read()).toEqual([
        shortcut('a'),
        { ...shortcut('b'), name: 'Edited B', prompt: 'Updated B' },
      ]);
    },
  );
});

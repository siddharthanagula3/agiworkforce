import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedShortcut } from '../src/types';
import { ORIGIN_EXTENSION_PAGE } from '../src/background/policy';

type ShortcutApi = typeof import('../src/features/background/shortcuts');
let api: ShortcutApi;
let rows: SavedShortcut[];

function saved(
  id: string,
  ownerAccountId: string | null | undefined,
  recorded = true,
): SavedShortcut {
  return {
    id,
    name: id,
    actions: recorded ? [{ id: `${id}-1`, type: 'input', selector: '#name', value: 'typed' }] : [],
    ...(recorded ? {} : { prompt: `Prompt ${id}` }),
    createdAt: 1,
    createdByOrigin: ORIGIN_EXTENSION_PAGE,
    ...(ownerAccountId === undefined ? {} : { ownerAccountId }),
  };
}

beforeEach(async () => {
  vi.resetModules();
  api = await import('../src/features/background/shortcuts');
  rows = [];
  vi.stubGlobal('chrome', {
    runtime: { lastError: undefined },
    storage: {
      local: {
        get: vi.fn((key: string, callback: (items: Record<string, SavedShortcut[]>) => void) =>
          queueMicrotask(() => callback({ [key]: structuredClone(rows) })),
        ),
        set: vi.fn(async (items: Record<string, SavedShortcut[]>) => {
          rows = structuredClone(items[api.SHORTCUTS_STORAGE_KEY] ?? []);
        }),
      },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('recordings belong to the account that made them', () => {
  it('stamps a new recording with the signed-in account', async () => {
    await api.handleSaveShortcut(
      {
        type: 'SAVE_SHORTCUT',
        name: 'Fill',
        actions: [{ id: 'a', type: 'input', selector: '#name', value: 'typed' }],
        startUrl: 'https://site.example',
      },
      'acct_a',
    );

    expect(rows[0]?.ownerAccountId).toBe('acct_a');
  });

  it('filters another account’s recordings without deleting them and keeps prompts visible', async () => {
    rows = [saved('mine', 'acct_a'), saved('theirs', 'acct_b'), saved('prompt', undefined, false)];

    expect((await api.loadShortcuts('acct_a')).map((row) => row.id)).toEqual(['mine', 'prompt']);
    expect((await api.loadShortcuts('acct_b')).map((row) => row.id)).toEqual(['theirs', 'prompt']);
    expect(rows.map((row) => row.id)).toEqual(['mine', 'theirs', 'prompt']);
  });

  it('hides bound recordings signed out and restores them to the same account on sign-in', async () => {
    rows = [saved('mine', 'acct_a'), saved('signed-out', null)];

    expect((await api.loadShortcuts(null)).map((row) => row.id)).toEqual(['signed-out']);
    expect(await api.loadShortcuts(undefined)).toEqual([]);
    await api.claimUnownedRecordings('acct_a');
    expect((await api.loadShortcuts('acct_a')).map((row) => row.id)).toEqual([
      'mine',
      'signed-out',
    ]);
  });

  it('gives a recording made while signed out to the first account seen', async () => {
    rows = [saved('signed-out', null), saved('legacy', undefined)];

    await api.claimUnownedRecordings('acct_a');
    await api.claimUnownedRecordings('acct_b');

    expect(await api.loadShortcuts('acct_b')).toEqual([]);
    expect(rows.map((row) => row.ownerAccountId)).toEqual(['acct_a', 'acct_a']);
  });

  it('does not reveal a different account’s recordings in mutations or allow deleting a hidden recording', async () => {
    rows = [saved('theirs', 'acct_b'), saved('prompt', undefined, false)];
    await expect(
      api.handleDeleteShortcut({ type: 'DELETE_SHORTCUT', shortcutId: 'theirs' }, 'acct_a'),
    ).resolves.toMatchObject({ success: false });
    const response = await api.handleSaveShortcut(
      { type: 'SAVE_SHORTCUT', name: 'My prompt', actions: [], prompt: 'Summarize' },
      'acct_a',
    );
    expect(response).toMatchObject({
      success: true,
      shortcuts: [
        expect.objectContaining({ id: 'prompt' }),
        expect.objectContaining({ name: 'My prompt' }),
      ],
    });
    expect(rows.find((row) => row.id === 'theirs')).toBeTruthy();
  });
});

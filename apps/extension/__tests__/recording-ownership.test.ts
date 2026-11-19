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

  it('removes another account recordings on a switch and keeps prompts', async () => {
    rows = [saved('mine', 'acct_a'), saved('theirs', 'acct_b'), saved('prompt', undefined, false)];

    await api.releaseRecordingsOfOtherAccounts('acct_a');

    expect(rows.map((row) => row.id)).toEqual(['mine', 'prompt']);
  });

  it('removes every bound recording on a sign-out', async () => {
    rows = [saved('mine', 'acct_a'), saved('signed-out', null)];

    await api.releaseRecordingsOfOtherAccounts(null);

    expect(rows.map((row) => row.id)).toEqual(['signed-out']);
  });

  it('gives a recording made while signed out to the first account seen', async () => {
    rows = [saved('signed-out', null), saved('legacy', undefined)];

    await api.releaseRecordingsOfOtherAccounts('acct_a');
    await api.releaseRecordingsOfOtherAccounts('acct_b');

    expect(rows).toEqual([]);
  });
});

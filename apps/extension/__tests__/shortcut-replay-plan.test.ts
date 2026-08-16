import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleSaveShortcut,
  loadShortcuts,
  planShortcutReplay,
} from '../src/features/background/shortcuts';
import type { RunPageAction } from '../src/types';

const action: RunPageAction = { id: 'a1', type: 'CLICK', selector: '#go' };

const chromeMock = {
  runtime: { lastError: undefined as chrome.runtime.LastError | undefined },
  storage: {
    local: {
      get: vi.fn((_key: string, callback: (result: Record<string, unknown>) => void) =>
        callback({ agi_saved_shortcuts: [] }),
      ),
      set: vi.fn(async () => undefined),
    },
  },
};

(globalThis as unknown as { chrome: typeof chromeMock }).chrome = chromeMock;

beforeEach(() => {
  chromeMock.runtime.lastError = undefined;
  vi.clearAllMocks();
});

describe('planShortcutReplay', () => {
  it('replays a recorded page-action shortcut via the actions path', () => {
    expect(planShortcutReplay({ actions: [action], prompt: undefined })).toEqual({
      kind: 'actions',
    });
  });

  it('routes a prompt shortcut (empty actions + prompt) through the chat path', () => {
    expect(planShortcutReplay({ actions: [], prompt: 'summarize this page' })).toEqual({
      kind: 'prompt',
      prompt: 'summarize this page',
    });
  });

  it('trims the prompt and still routes to chat', () => {
    expect(planShortcutReplay({ actions: [], prompt: '  do the thing  ' })).toEqual({
      kind: 'prompt',
      prompt: 'do the thing',
    });
  });

  it('reports empty when there are neither actions nor a prompt (no fake success)', () => {
    expect(planShortcutReplay({ actions: [], prompt: undefined })).toEqual({ kind: 'empty' });
    expect(planShortcutReplay({ actions: [], prompt: '   ' })).toEqual({ kind: 'empty' });
  });

  it('prefers recorded actions when a shortcut somehow carries both', () => {
    expect(planShortcutReplay({ actions: [action], prompt: 'ignored' })).toEqual({
      kind: 'actions',
    });
  });
});

describe('shortcut storage authority', () => {
  it('treats a storage failure as unknown state instead of an authoritative empty list', async () => {
    chromeMock.runtime.lastError = { message: 'shortcut storage unavailable' };

    await expect(loadShortcuts()).rejects.toThrow('shortcut storage unavailable');
  });
});

describe('recorded shortcut save binding', () => {
  it('refuses to persist page actions without a valid web origin', async () => {
    const result = await handleSaveShortcut({
      type: 'SAVE_SHORTCUT',
      name: 'Unsafe legacy recording',
      actions: [action],
    });

    expect(result.success).toBe(false);
    expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
  });

  it('persists only the canonical origin for a recorded page workflow', async () => {
    const result = await handleSaveShortcut({
      type: 'SAVE_SHORTCUT',
      name: 'Bound recording',
      actions: [action],
      startUrl: 'https://app.example.test/private/path?token=secret#step',
    });

    expect(result.success).toBe(true);
    const stored = chromeMock.storage.local.set.mock.calls[0]?.[0] as {
      agi_saved_shortcuts?: Array<{ startUrl?: string }>;
    };
    expect(stored.agi_saved_shortcuts?.[0]?.startUrl).toBe('https://app.example.test');
  });
});

/**
 * @vitest-environment jsdom
 *
 * The extension injects a content script into every page, holds the debugger and
 * cookies permissions, and mirrors Managed Cloud chats to the account. This file
 * proves the user is told all four things inside the extension's own UI, and that
 * declining the mirror actually stops the network copy.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const _store: Record<string, unknown> = {};

function selectedValues(
  key: string | string[] | Record<string, unknown> | null,
): Record<string, unknown> {
  if (key === null) return { ..._store };
  if (typeof key === 'object' && !Array.isArray(key)) {
    return Object.fromEntries(
      Object.entries(key).map(([name, fallback]) => [
        name,
        name in _store ? _store[name] : fallback,
      ]),
    );
  }
  const keys = Array.isArray(key) ? key : [key];
  return Object.fromEntries(keys.map((entry) => [entry, _store[entry]]));
}

type StorageChangeListener = (
  changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
  area: string,
) => void;

const changeListeners: StorageChangeListener[] = [];

const chromeMock = {
  storage: {
    local: {
      get: vi.fn(
        (
          key: string | string[] | Record<string, unknown> | null,
          cb?: (res: Record<string, unknown>) => void,
        ) => (cb ? cb(selectedValues(key)) : Promise.resolve(selectedValues(key))),
      ),
      set: vi.fn((items: Record<string, unknown>, cb?: () => void) => {
        const changes: Record<string, { newValue?: unknown; oldValue?: unknown }> = {};
        for (const [k, v] of Object.entries(items)) {
          changes[k] = { oldValue: _store[k], newValue: v };
          _store[k] = v;
        }
        for (const listener of changeListeners) listener(changes, 'local');
        if (cb) {
          cb();
          return undefined;
        }
        return Promise.resolve();
      }),
      remove: vi.fn((keys: string | string[]) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete _store[key];
        return Promise.resolve();
      }),
    },
    onChanged: {
      addListener: (listener: StorageChangeListener) => {
        changeListeners.push(listener);
      },
    },
  },
  runtime: { lastError: undefined as chrome.runtime.LastError | undefined },
};
(globalThis as unknown as Record<string, unknown>).chrome = chromeMock;

vi.mock('../src/features/cloud-bridge/freeTrialClient', () => ({
  FREE_TRIAL_GATEWAY: 'https://agiworkforce.com',
  getManagedCloudAuthContext: vi.fn(async () => ({
    token: 'test-bearer',
    owner: { accountId: 'account-a', authIncarnation: 'session-a' },
  })),
}));

import { flushConversation } from '../src/features/cloud-bridge/conversationSync';
import {
  getConversation,
  isCloudPersistenceEligible,
  upsertConversation,
  type HistoryMessage,
} from '../src/features/background/conversation-history';
import {
  CLOUD_MIRRORING_STORAGE_KEY,
  cloudMirroringEnabledSnapshot,
  readCloudMirroringEnabled,
  watchCloudMirroringEnabled,
} from '../src/features/privacy/cloudMirroring';
import { DATA_HANDLING_DISCLOSURES } from '../src/features/privacy/dataHandling';
import { createDataHandlingSection } from '../src/features/options/data-handling-section';
import type { ManagedCloudOwner } from '../src/features/cloud-bridge/managedCloudAuthority';

const OWNER: ManagedCloudOwner = { accountId: 'account-a', authIncarnation: 'session-a' };

watchCloudMirroringEnabled();

const here = dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath: string): string =>
  readFileSync(resolve(here, '..', relativePath), 'utf8');

function cloudMessages(at: number): HistoryMessage[] {
  return [
    { role: 'user', content: 'ask', timestamp: at, runtime: 'managed-cloud' },
    { role: 'assistant', content: 'answer', timestamp: at + 1, runtime: 'managed-cloud' },
  ];
}

const fetchMock = vi.fn(
  async () =>
    new Response(JSON.stringify({ conversation: { id: 'x' }, message: { id: 'y' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
);

beforeEach(async () => {
  for (const key of Object.keys(_store)) delete _store[key];
  chromeMock.runtime.lastError = undefined;
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  await readCloudMirroringEnabled();
});

describe('cloud mirroring opt-out', () => {
  it('mirrors Managed Cloud chats when the user has not declined', async () => {
    await upsertConversation(OWNER, 'conv-default', cloudMessages(2_000));

    await flushConversation(OWNER, 'conv-default');

    expect(fetchMock).toHaveBeenCalled();
  });

  it('sends nothing to the account once the user turns the mirror off', async () => {
    _store[CLOUD_MIRRORING_STORAGE_KEY] = false;
    await readCloudMirroringEnabled();
    await upsertConversation(OWNER, 'conv-declined', cloudMessages(3_000));

    await flushConversation(OWNER, 'conv-declined');

    expect(fetchMock).not.toHaveBeenCalled();
    expect((await getConversation(OWNER, 'conv-declined'))?.cloudSync?.conversationId).toBe(
      undefined,
    );
  });

  it('makes a declined conversation ineligible for cloud persistence', async () => {
    await upsertConversation(OWNER, 'conv-eligibility', cloudMessages(4_000));
    const entry = (await getConversation(OWNER, 'conv-eligibility'))!;
    expect(isCloudPersistenceEligible(entry)).toBe(true);

    _store[CLOUD_MIRRORING_STORAGE_KEY] = false;
    await readCloudMirroringEnabled();

    expect(cloudMirroringEnabledSnapshot()).toBe(false);
    expect(isCloudPersistenceEligible(entry)).toBe(false);
  });
});

describe('options data-handling disclosure', () => {
  it('names the all-URLs script, debugger, cookies and cloud mirroring', () => {
    const section = createDataHandlingSection({
      get: (key) => chromeMock.storage.local.get(key) as Promise<Record<string, unknown>>,
      set: (items) => chromeMock.storage.local.set(items) as Promise<void>,
    });
    const text = section.element.textContent ?? '';

    expect(DATA_HANDLING_DISCLOSURES.map((entry) => entry.id)).toEqual([
      'page-injection',
      'debugger',
      'cookies',
      'cloud-mirroring',
    ]);
    expect(text).toContain('every http and https page');
    expect(text).toContain('Chrome debugger permission');
    expect(text).toContain('cookies permission');
    expect(text).toContain('copied to your AGI account');
  });

  it('stores the decline the sync gate reads', async () => {
    const section = createDataHandlingSection({
      get: (key) => chromeMock.storage.local.get(key) as Promise<Record<string, unknown>>,
      set: (items) => chromeMock.storage.local.set(items) as Promise<void>,
    });
    await section.loaded;
    expect(section.toggle.checked).toBe(true);

    section.toggle.checked = false;
    section.toggle.dispatchEvent(new Event('change'));
    await Promise.resolve();
    await Promise.resolve();

    expect(_store[CLOUD_MIRRORING_STORAGE_KEY]).toBe(false);
    expect(cloudMirroringEnabledSnapshot()).toBe(false);
  });

  it('is mounted on the options page', () => {
    expect(readSource('src/options.ts')).toContain('createDataHandlingSection');
  });
});

describe('first-run disclosure', () => {
  it('tells the user about page injection and the account mirror before first use', () => {
    const sidePanel = readSource('src/side_panel.ts');
    expect(sidePanel).toContain('DATA_HANDLING_DISCLOSURES');
    expect(sidePanel).toMatch(/sp-ob-privacy-row/);
  });
});

import { describe, expect, it } from 'vitest';
import {
  initializeSyncedPreferences,
  SYNCED_PREFERENCE_KEYS,
  type SyncedPreferenceStorage,
} from '../src/features/background/synced-preferences';

class MemoryStorageArea {
  readonly values: Record<string, unknown>;

  constructor(initial: Record<string, unknown> = {}) {
    this.values = { ...initial };
  }

  async get(keys: string[]): Promise<Record<string, unknown>> {
    return Object.fromEntries(
      keys
        .filter((key) => Object.prototype.hasOwnProperty.call(this.values, key))
        .map((key) => [key, this.values[key]]),
    );
  }

  async set(items: Record<string, unknown>): Promise<void> {
    Object.assign(this.values, items);
  }

  async remove(keys: string[]): Promise<void> {
    for (const key of keys) delete this.values[key];
  }
}

function storageFixture(
  local: Record<string, unknown> = {},
  sync: Record<string, unknown> = {},
): {
  storage: SyncedPreferenceStorage;
  local: MemoryStorageArea;
  sync: MemoryStorageArea;
  emit(changes: Record<string, { newValue?: unknown }>, area: string): void;
  listenerCount(): number;
} {
  const localArea = new MemoryStorageArea(local);
  const syncArea = new MemoryStorageArea(sync);
  const listeners = new Set<
    (changes: Record<string, { newValue?: unknown }>, area: string) => void
  >();
  return {
    storage: {
      local: localArea,
      sync: syncArea,
      onChanged: {
        addListener: (listener) => listeners.add(listener),
        removeListener: (listener) => listeners.delete(listener),
      },
    },
    local: localArea,
    sync: syncArea,
    emit: (changes, area) => listeners.forEach((listener) => listener(changes, area)),
    listenerCount: () => listeners.size,
  };
}

async function flushMirrors(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('cross-device Chrome preferences', () => {
  it('uses synced values on conflict and migrates local-only safe preferences', async () => {
    const fixture = storageFixture(
      {
        agi_quick_mode: false,
        agi_task_notifications: true,
        agi_site_allowlist: ['https://private.example'],
      },
      { agi_quick_mode: true },
    );

    const cleanup = await initializeSyncedPreferences(fixture.storage);

    expect(fixture.local.values['agi_quick_mode']).toBe(true);
    expect(fixture.sync.values['agi_task_notifications']).toBe(true);
    expect(fixture.sync.values).not.toHaveProperty('agi_site_allowlist');
    cleanup();
    expect(fixture.listenerCount()).toBe(0);
  });

  it('mirrors only allowlisted changes in both directions', async () => {
    const fixture = storageFixture();
    await initializeSyncedPreferences(fixture.storage);

    fixture.emit(
      {
        agi_thinking_enabled: { newValue: true },
        agi_dev_bearer_token: { newValue: 'never-sync-me' },
        agi_quick_mode: { newValue: 'not-a-boolean' },
      },
      'local',
    );
    await flushMirrors();
    expect(fixture.sync.values['agi_thinking_enabled']).toBe(true);
    expect(fixture.sync.values).not.toHaveProperty('agi_dev_bearer_token');
    expect(fixture.sync.values).not.toHaveProperty('agi_quick_mode');

    fixture.emit({ agi_cu_ask_before_acting: { newValue: false } }, 'sync');
    await flushMirrors();
    expect(fixture.local.values['agi_cu_ask_before_acting']).toBe(false);
  });

  it('keeps the allowlist limited to non-sensitive boolean preferences', () => {
    expect(SYNCED_PREFERENCE_KEYS).toEqual([
      'agi_task_notifications',
      'agi_thinking_enabled',
      'agi_quick_mode',
      'agi_cu_ask_before_acting',
      'agi_in_page_panel_enabled',
    ]);
  });
});

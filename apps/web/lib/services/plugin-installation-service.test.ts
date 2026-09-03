import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { getNeonDbMock, getPluginRegistryEntryMock } = vi.hoisted(() => ({
  getNeonDbMock: vi.fn(),
  getPluginRegistryEntryMock: vi.fn(),
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: getNeonDbMock }));
vi.mock('./plugin-registry-service', () => ({
  getPluginRegistryEntry: getPluginRegistryEntryMock,
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { PluginRegistryEntry } from '@agiworkforce/types';
import {
  countPluginInstallations,
  installWebPlugin,
  listEnabledPluginIds,
  setWebPluginEnabled,
  uninstallWebPlugin,
} from './plugin-installation-service';

function database(rows: unknown[]): DatabaseAdapter & { query: ReturnType<typeof vi.fn> } {
  const db = { query: vi.fn().mockResolvedValue(rows) };
  return db as unknown as DatabaseAdapter & { query: ReturnType<typeof vi.fn> };
}

function registryEntry(overrides: Partial<PluginRegistryEntry>): PluginRegistryEntry {
  return {
    id: 'research-pack',
    name: 'Research Pack',
    version: '1.0.0',
    description: 'Evidence synthesis.',
    category: 'Research',
    publisher: { id: 'agi', name: 'AGI', kind: 'first-party', url: null },
    source: 'builtin',
    status: 'published',
    webInstallable: true,
    declaredSkills: ['literature-review'],
    requiredConnectors: [],
    capabilities: [],
    permissions: [],
    examplePrompts: [],
    versions: [],
    distribution: null,
    integrity: { sha256: null, signature: null, signatureAlgorithm: null },
    homepageUrl: null,
    createdAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  };
}

const INSTALLATION_ROW = {
  plugin_id: 'research-pack',
  installed_version: '1.0.0',
  enabled: true,
  installed_at: '2026-09-03T00:00:00.000Z',
  updated_at: '2026-09-03T00:00:00.000Z',
};

describe('countPluginInstallations', () => {
  beforeEach(() => {
    getNeonDbMock.mockReset();
  });

  it('maps grouped rows onto a plugin id -> count map', async () => {
    const db = database([
      { plugin_id: 'engineering-pack', install_count: '3' },
      { plugin_id: 'writing-pack', install_count: 1 },
    ]);
    const counts = await countPluginInstallations(db);
    expect(counts.get('engineering-pack')).toBe(3);
    expect(counts.get('writing-pack')).toBe(1);
    expect(counts.get('unknown-pack')).toBeUndefined();
  });

  it('never selects or returns a user id — only a plugin id and a count', async () => {
    const db = database([{ plugin_id: 'engineering-pack', install_count: 1 }]);
    await countPluginInstallations(db);
    const sql = String(db.query.mock.calls[0]?.[0]);
    expect(sql.toLowerCase()).not.toContain('user_id');
    expect(sql.toLowerCase()).toContain('group by plugin_id');
  });

  it('reflects an uninstall as a lower count on the next read', async () => {
    const db = database([
      { plugin_id: 'engineering-pack', install_count: 2 },
      { plugin_id: 'writing-pack', install_count: 1 },
    ]);
    const before = await countPluginInstallations(db);
    expect(before.get('engineering-pack')).toBe(2);

    db.query.mockResolvedValueOnce([{ plugin_id: 'writing-pack', install_count: 1 }]);
    const after = await countPluginInstallations(db);
    expect(after.get('engineering-pack')).toBeUndefined();
    expect(after.get('writing-pack')).toBe(1);
  });

  it('coerces a non-numeric count to zero rather than throwing', async () => {
    const db = database([{ plugin_id: 'engineering-pack', install_count: 'nope' as never }]);
    const counts = await countPluginInstallations(db);
    expect(counts.get('engineering-pack')).toBe(0);
  });

  it('returns an empty map when no plugin has ever been installed', async () => {
    const db = database([]);
    await expect(countPluginInstallations(db)).resolves.toEqual(new Map());
  });
});

describe('installWebPlugin', () => {
  beforeEach(() => {
    getNeonDbMock.mockReset();
    getPluginRegistryEntryMock.mockReset();
  });

  it('installs a published, web-installable entry', async () => {
    getPluginRegistryEntryMock.mockResolvedValue({
      entry: registryEntry({}),
      manifest: { name: 'research-pack', version: '1.0.0', description: '', skills: [] },
    });
    const db = database([INSTALLATION_ROW]);

    const installation = await installWebPlugin(db, 'user-1', 'research-pack');

    expect(installation).toEqual({
      pluginId: 'research-pack',
      installedVersion: '1.0.0',
      enabled: true,
      installedAt: '2026-09-03T00:00:00.000Z',
      updatedAt: '2026-09-03T00:00:00.000Z',
    });
    expect(db.query.mock.calls[0]?.[1]).toEqual(['user-1', 'research-pack', '1.0.0']);
  });

  it('refuses a preview entry that is not web-installable', async () => {
    getPluginRegistryEntryMock.mockResolvedValue({
      entry: registryEntry({
        id: 'github-automation',
        status: 'preview',
        webInstallable: false,
      }),
      manifest: null,
    });
    const db = database([INSTALLATION_ROW]);

    const installation = await installWebPlugin(db, 'user-1', 'github-automation');

    expect(installation).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('refuses an entry with no embedded manifest even if flagged web-installable', async () => {
    getPluginRegistryEntryMock.mockResolvedValue({
      entry: registryEntry({}),
      manifest: null,
    });
    const db = database([INSTALLATION_ROW]);

    const installation = await installWebPlugin(db, 'user-1', 'research-pack');

    expect(installation).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('returns null for an unknown plugin id without querying installations', async () => {
    getPluginRegistryEntryMock.mockResolvedValue(null);
    const db = database([INSTALLATION_ROW]);

    const installation = await installWebPlugin(db, 'user-1', 'not-a-real-plugin');

    expect(installation).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('re-enables on a repeat install instead of creating a duplicate row', async () => {
    getPluginRegistryEntryMock.mockResolvedValue({
      entry: registryEntry({}),
      manifest: { name: 'research-pack', version: '1.0.0', description: '', skills: [] },
    });
    const db = database([INSTALLATION_ROW]);

    await installWebPlugin(db, 'user-1', 'research-pack');

    const sql = String(db.query.mock.calls[0]?.[0]).toLowerCase();
    expect(sql).toContain('on conflict (user_id, plugin_id) do update');
    expect(sql).toContain('enabled = true');
  });
});

describe('setWebPluginEnabled', () => {
  beforeEach(() => {
    getNeonDbMock.mockReset();
  });

  it('disables an installed plugin', async () => {
    const db = database([{ ...INSTALLATION_ROW, enabled: false }]);

    const installation = await setWebPluginEnabled(db, 'user-1', 'research-pack', false);

    expect(installation?.enabled).toBe(false);
    expect(db.query.mock.calls[0]?.[1]).toEqual(['user-1', 'research-pack', false]);
  });

  it('returns null when the plugin was never installed', async () => {
    const db = database([]);

    const installation = await setWebPluginEnabled(db, 'user-1', 'research-pack', true);

    expect(installation).toBeNull();
  });
});

describe('uninstallWebPlugin', () => {
  beforeEach(() => {
    getNeonDbMock.mockReset();
  });

  it('deletes the installation and reports success', async () => {
    const db = database([{ plugin_id: 'research-pack' }]);

    await expect(uninstallWebPlugin(db, 'user-1', 'research-pack')).resolves.toBe(true);
    expect(db.query.mock.calls[0]?.[1]).toEqual(['user-1', 'research-pack']);
  });

  it('reports failure when nothing was installed to remove', async () => {
    const db = database([]);

    await expect(uninstallWebPlugin(db, 'user-1', 'research-pack')).resolves.toBe(false);
  });
});

describe('listEnabledPluginIds', () => {
  beforeEach(() => {
    getNeonDbMock.mockReset();
  });

  it('reflects the full install -> enable -> uninstall lifecycle', async () => {
    const db = database([{ plugin_id: 'research-pack' }]);
    await expect(listEnabledPluginIds(db, 'user-1')).resolves.toEqual(new Set(['research-pack']));

    db.query.mockResolvedValueOnce([]);
    await expect(listEnabledPluginIds(db, 'user-1')).resolves.toEqual(new Set());
  });

  it('only joins against published, web-installable registry rows', async () => {
    const db = database([]);
    await listEnabledPluginIds(db, 'user-1');
    const sql = String(db.query.mock.calls[0]?.[0]).toLowerCase();
    expect(sql).toContain("registry.status = 'published'");
    expect(sql).toContain('registry.web_installable = true');
  });
});

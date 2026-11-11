import { describe, expect, it, vi } from 'vitest';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const mocks = vi.hoisted(() => ({ findRecord: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../memory-cache', () => ({
  findPluginDirectoryRecord: (id: string) => mocks.findRecord(id),
}));

import {
  collectDependents,
  dependenciesUnavailableMessage,
  dependentsRefusalMessage,
  listMarketplaceDependents,
  listRegistryDependents,
  listUnmetMarketplaceDependencies,
  listUnmetRegistryDependencies,
  type InstalledPluginNode,
} from '../installed-dependents';

function node(
  id: string,
  dependencies: InstalledPluginNode['dependencies'] = [],
  marketplace: string | null = 'acme',
): InstalledPluginNode {
  return { id, pluginKey: id, name: id.toUpperCase(), marketplace, dependencies };
}

const needs = (name: string, marketplace: string | null = null) => ({
  name,
  marketplace,
  version: null,
});

describe('collectDependents', () => {
  it('finds the plugins that name the target, ordered so the furthest dependent comes first', () => {
    const graph = [
      node('base'),
      node('middle', [needs('base')]),
      node('top', [needs('middle')]),
      node('unrelated'),
    ];
    expect(collectDependents(graph, 'base').map((dependent) => dependent.id)).toEqual([
      'top',
      'middle',
    ]);
  });

  it('reads an unqualified dependency as the dependent’s own marketplace', () => {
    const graph = [
      node('base', [], 'acme'),
      node('same-market', [needs('base')], 'acme'),
      node('other-market', [needs('base')], 'elsewhere'),
      node('qualified', [needs('base', 'acme')], 'elsewhere'),
    ];
    expect(
      collectDependents(graph, 'base')
        .map((dependent) => dependent.id)
        .sort(),
    ).toEqual(['qualified', 'same-market']);
  });

  it('survives a cycle and never lists the target as its own dependent', () => {
    const graph = [node('a', [needs('b')]), node('b', [needs('a')])];
    expect(collectDependents(graph, 'a').map((dependent) => dependent.id)).toEqual(['b']);
  });

  it('answers nothing for a plugin that is not in the graph', () => {
    expect(collectDependents([node('a')], 'missing')).toEqual([]);
  });
});

describe('dependentsRefusalMessage', () => {
  it('names one dependent', () => {
    const message = dependentsRefusalMessage('remove', 'Base', [
      { id: '1', label: 'a', name: 'Alpha' },
    ]);
    expect(message).toBe(
      'Base cannot be removed yet because Alpha needs it. Remove that plugin together with it, or first.',
    );
  });

  it('names several dependents', () => {
    const message = dependentsRefusalMessage('turn off', 'Base', [
      { id: '1', label: 'a', name: 'Alpha' },
      { id: '2', label: 'b', name: 'Beta' },
      { id: '3', label: 'c', name: 'Gamma' },
    ]);
    expect(message).toContain('Alpha, Beta and Gamma need it');
    expect(message).toContain('cannot be turned off');
  });
});

function database(rows: unknown[]): DatabaseAdapter {
  return { query: vi.fn(async () => rows), execute: vi.fn() } as unknown as DatabaseAdapter;
}

describe('listMarketplaceDependents', () => {
  it('reads only enabled installations and unwraps the shadow marketplace name', async () => {
    const db = database([
      {
        id: 'inst-base',
        plugin_key: 'base',
        name: 'Base',
        source_name: 'agi:installed:acme',
        dependencies: [],
      },
      {
        id: 'inst-top',
        plugin_key: 'top',
        name: 'Top',
        source_name: 'acme',
        dependencies: [{ name: 'base' }],
      },
    ]);
    await expect(listMarketplaceDependents(db, 'user-1', 'inst-base')).resolves.toEqual([
      { id: 'inst-top', label: 'top@acme', name: 'Top' },
    ]);
    const sql = String((db.query as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
    expect(sql).toContain('installation.enabled = true');
  });
});

describe('listMarketplaceDependents for installs that stored no dependencies', () => {
  const rows = [
    {
      id: 'inst-base',
      plugin_key: 'base',
      name: 'Base',
      source_name: 'agi:installed:acme',
      dependencies: [],
    },
    {
      id: 'inst-old',
      plugin_key: 'old',
      name: 'Old',
      source_name: 'agi:installed:acme',
      dependencies: [],
    },
  ];

  it('falls back to the cached directory listing', async () => {
    mocks.findRecord.mockImplementation(async (id: string) =>
      id === 'old' ? { dependencies: [{ name: 'base', marketplace: null, version: null }] } : null,
    );
    await expect(listMarketplaceDependents(database(rows), 'user-1', 'inst-base')).resolves.toEqual(
      [{ id: 'inst-old', label: 'old@acme', name: 'Old' }],
    );
  });

  it('finds none when the cache has no record', async () => {
    mocks.findRecord.mockResolvedValue(null);
    await expect(listMarketplaceDependents(database(rows), 'user-1', 'inst-base')).resolves.toEqual(
      [],
    );
  });
});

describe('listRegistryDependents', () => {
  it('finds registry plugins whose manifest names the plugin', async () => {
    const db = database([
      { plugin_id: 'research-pack', name: 'Research Pack', dependencies: null },
      { plugin_id: 'review-pack', name: 'Review Pack', dependencies: [{ name: 'research-pack' }] },
    ]);
    await expect(listRegistryDependents(db, 'user-1', 'research-pack')).resolves.toEqual([
      { id: 'review-pack', label: 'review-pack', name: 'Review Pack' },
    ]);
  });
});

function registryRow(
  id: string,
  dependencies: unknown,
  overrides: Partial<{
    enabled: boolean;
    review_required: boolean;
    installed_version: string;
    version_status: string;
  }> = {},
) {
  return {
    plugin_id: id,
    name: id.toUpperCase(),
    dependencies,
    enabled: true,
    review_required: false,
    installed_version: '1.0.0',
    version_status: 'published',
    ...overrides,
  };
}

describe('listUnmetRegistryDependencies', () => {
  const root = registryRow('review-pack', [{ name: 'research-pack' }], { enabled: false });

  it('reads every installation, including the ones that are off', async () => {
    const db = database([root, registryRow('research-pack', null)]);
    await listUnmetRegistryDependencies(db, 'user-1', 'review-pack');
    const sql = String((db.query as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
    expect(sql).not.toContain('installation.enabled = true');
  });

  it('is satisfied when the required plugin is installed and on', async () => {
    const db = database([root, registryRow('research-pack', null)]);
    await expect(listUnmetRegistryDependencies(db, 'user-1', 'review-pack')).resolves.toEqual([]);
  });

  it('names a required plugin that was turned off', async () => {
    const db = database([root, registryRow('research-pack', null, { enabled: false })]);
    await expect(listUnmetRegistryDependencies(db, 'user-1', 'review-pack')).resolves.toEqual([
      { name: 'RESEARCH-PACK', problem: 'is turned off' },
    ]);
  });

  it('names a required plugin that was removed', async () => {
    const db = database([root]);
    await expect(listUnmetRegistryDependencies(db, 'user-1', 'review-pack')).resolves.toEqual([
      { name: 'research-pack', problem: 'is not installed' },
    ]);
  });

  it('names a required plugin waiting for a permission review or suspended', async () => {
    const reviewing = database([
      root,
      registryRow('research-pack', null, { review_required: true }),
    ]);
    await expect(
      listUnmetRegistryDependencies(reviewing, 'user-1', 'review-pack'),
    ).resolves.toEqual([{ name: 'RESEARCH-PACK', problem: 'is waiting for a permission review' }]);
    const suspended = database([
      root,
      registryRow('research-pack', null, { version_status: 'suspended' }),
    ]);
    await expect(
      listUnmetRegistryDependencies(suspended, 'user-1', 'review-pack'),
    ).resolves.toEqual([{ name: 'RESEARCH-PACK', problem: 'is suspended' }]);
  });

  it('names a required plugin installed outside the version range', async () => {
    const ranged = registryRow('review-pack', [{ name: 'research-pack', version: '^2.0.0' }]);
    const db = database([ranged, registryRow('research-pack', null)]);
    await expect(listUnmetRegistryDependencies(db, 'user-1', 'review-pack')).resolves.toEqual([
      { name: 'RESEARCH-PACK', problem: 'is installed at 1.0.0 but needs ^2.0.0' },
    ]);
  });

  it('follows a ready dependency to the plugin it needs, and lists each plugin once', async () => {
    const db = database([
      registryRow('top', [{ name: 'middle' }, { name: 'base' }]),
      registryRow('middle', [{ name: 'base' }]),
      registryRow('base', null, { enabled: false }),
    ]);
    await expect(listUnmetRegistryDependencies(db, 'user-1', 'top')).resolves.toEqual([
      { name: 'BASE', problem: 'is turned off' },
    ]);
  });

  it('answers nothing for a plugin that is not installed', async () => {
    await expect(
      listUnmetRegistryDependencies(database([]), 'user-1', 'review-pack'),
    ).resolves.toEqual([]);
  });
});

describe('listUnmetMarketplaceDependencies', () => {
  function marketplaceRow(
    id: string,
    sourceName: string,
    dependencies: unknown,
    overrides: Partial<{
      enabled: boolean;
      review_required: boolean;
      installed_version: string;
    }> = {},
  ) {
    return {
      id: `inst-${id}`,
      plugin_key: id,
      name: id.toUpperCase(),
      source_name: sourceName,
      dependencies,
      enabled: true,
      review_required: false,
      installed_version: '1.0.0',
      ...overrides,
    };
  }

  it('reads installations that are off as well as on', async () => {
    const db = database([marketplaceRow('top', 'acme', [{ name: 'base' }])]);
    await listUnmetMarketplaceDependencies(db, 'user-1', 'inst-top');
    const sql = String((db.query as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
    expect(sql).not.toContain('installation.enabled = true');
  });

  it('is satisfied by an enabled install in the same marketplace, shadow name included', async () => {
    const db = database([
      marketplaceRow('top', 'acme', [{ name: 'base' }], { enabled: false }),
      marketplaceRow('base', 'agi:installed:acme', []),
    ]);
    await expect(listUnmetMarketplaceDependencies(db, 'user-1', 'inst-top')).resolves.toEqual([]);
  });

  it('names a dependency that is off, and one that was removed', async () => {
    const db = database([
      marketplaceRow('top', 'acme', [{ name: 'base' }, { name: 'gone' }], { enabled: false }),
      marketplaceRow('base', 'acme', [], { enabled: false }),
    ]);
    await expect(listUnmetMarketplaceDependencies(db, 'user-1', 'inst-top')).resolves.toEqual([
      { name: 'BASE', problem: 'is turned off' },
      { name: 'gone@acme', problem: 'is not installed' },
    ]);
  });

  it('does not take a same-named plugin from another marketplace for the dependency', async () => {
    const db = database([
      marketplaceRow('top', 'acme', [{ name: 'base' }], { enabled: false }),
      marketplaceRow('base', 'elsewhere', []),
    ]);
    await expect(listUnmetMarketplaceDependencies(db, 'user-1', 'inst-top')).resolves.toEqual([
      { name: 'base@acme', problem: 'is not installed' },
    ]);
  });

  it('holds an unversioned copy to the version range the dependency names', async () => {
    const db = database([
      marketplaceRow('top', 'acme', [{ name: 'base', version: '^1.0.0' }]),
      marketplaceRow('base', 'acme', [], { installed_version: '0.0.0+sha.abc123' }),
    ]);
    await expect(listUnmetMarketplaceDependencies(db, 'user-1', 'inst-top')).resolves.toEqual([
      { name: 'BASE', problem: 'is a copy with no version but needs ^1.0.0' },
    ]);
  });
});

describe('dependenciesUnavailableMessage', () => {
  it('names one plugin and what is wrong with it', () => {
    expect(
      dependenciesUnavailableMessage('Review Pack', [{ name: 'Base', problem: 'is turned off' }]),
    ).toBe(
      'Review Pack cannot be turned on yet because it needs Base, which is turned off. Fix that plugin first, then turn Review Pack on again.',
    );
  });

  it('names several plugins', () => {
    const message = dependenciesUnavailableMessage('Review Pack', [
      { name: 'Base', problem: 'is turned off' },
      { name: 'Extra', problem: 'is not installed' },
    ]);
    expect(message).toContain('Base, which is turned off; Extra, which is not installed');
    expect(message).toContain('Fix those plugins first');
  });
});

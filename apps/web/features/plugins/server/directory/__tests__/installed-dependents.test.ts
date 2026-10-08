import { describe, expect, it, vi } from 'vitest';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const mocks = vi.hoisted(() => ({ findRecord: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../memory-cache', () => ({
  findPluginDirectoryRecord: (id: string) => mocks.findRecord(id),
}));

import {
  collectDependents,
  dependentsRefusalMessage,
  listMarketplaceDependents,
  listRegistryDependents,
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

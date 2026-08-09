/**
 * The hero's availability claim must come from the catalogue READ, not from the
 * number of rows it happened to return.
 *
 * When `plugin_registry_entries` is missing (42P01 on a database that never got
 * `0096_plugin_registry.sql`) the loader reports `unavailable` and the page has
 * zero rows to count. The hero used to read that as "no pack is installable
 * yet — every entry is a declared pack", stating a fact about a catalogue it
 * had just failed to open, while the section directly below it said the
 * registry was unreachable.
 */

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginRegistryEntry } from '@agiworkforce/types';

const loadPluginCatalogMock = vi.hoisted(() => vi.fn());

vi.mock('@/features/plugins/server/registry-source', () => ({
  loadPluginCatalog: loadPluginCatalogMock,
}));
vi.mock('@shared/components/layout/Header', () => ({ Header: () => <div /> }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => <div />,
}));
vi.mock('../byok/WaitlistForm', () => ({ WaitlistForm: () => <div /> }));

import PluginsPage from './page';

function entry(overrides: Partial<PluginRegistryEntry> = {}): PluginRegistryEntry {
  return {
    id: 'github-automation',
    name: 'GitHub Automation',
    version: '1.0.0',
    description: 'Automate pull request reviews.',
    category: 'Developer',
    publisher: { id: 'agi', name: 'AGI', kind: 'first-party' },
    source: 'builtin',
    status: 'preview',
    declaredSkills: ['Code Review'],
    requiredConnectors: ['github'],
    capabilities: ['connectors'],
    permissions: [],
    versions: [],
    distribution: null,
    integrity: { sha256: null, signature: null, signatureAlgorithm: null },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  loadPluginCatalogMock.mockReset();
});

describe('PluginsPage availability claim', () => {
  it('does not claim the catalogue is uninstallable when the registry is unreachable', async () => {
    loadPluginCatalogMock.mockResolvedValue({ status: 'unavailable' });

    render(await PluginsPage());

    expect(screen.queryByText(/every entry is a declared pack/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/unreachable/i).length).toBeGreaterThan(0);
  });

  it('separates an empty registry from a registry of declared-only packs', async () => {
    loadPluginCatalogMock.mockResolvedValue({ status: 'ok', entries: [] });

    render(await PluginsPage());

    expect(screen.queryByText(/every entry is a declared pack/i)).not.toBeInTheDocument();
    expect(screen.getByText(/holds no packs yet/i)).toBeInTheDocument();
  });

  it('still reports declared-only packs when the read succeeded', async () => {
    loadPluginCatalogMock.mockResolvedValue({ status: 'ok', entries: [entry()] });

    render(await PluginsPage());

    expect(screen.getByText(/every entry is a declared pack/i)).toBeInTheDocument();
  });

  it('counts installable packs against the rows actually read', async () => {
    loadPluginCatalogMock.mockResolvedValue({
      status: 'ok',
      entries: [
        entry({
          status: 'published',
          distribution: { manifestUrl: 'https://example.com/plugin.json', sha256: null },
        }),
        entry({ id: 'crm-sync', name: 'CRM Sync' }),
      ],
    });

    render(await PluginsPage());

    expect(screen.getByText(/1 of 2 packs are installable today/i)).toBeInTheDocument();
  });
});

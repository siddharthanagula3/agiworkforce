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

const DECLARED_ONLY_CLAIM = /no pack is installable in this environment yet/i;

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
    webInstallable: false,
    declaredSkills: ['Code Review'],
    requiredConnectors: ['github'],
    capabilities: ['connectors'],
    permissions: [],
    examplePrompts: [],
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

    expect(screen.queryByText(DECLARED_ONLY_CLAIM)).not.toBeInTheDocument();
    expect(screen.getAllByText(/unreachable/i).length).toBeGreaterThan(0);
  });

  it('separates an empty registry from a registry of declared-only packs', async () => {
    loadPluginCatalogMock.mockResolvedValue({ status: 'ok', entries: [] });

    render(await PluginsPage());

    expect(screen.queryByText(DECLARED_ONLY_CLAIM)).not.toBeInTheDocument();
    expect(screen.getByText(/holds no packs yet/i)).toBeInTheDocument();
  });

  it('still reports declared-only packs when the read succeeded', async () => {
    loadPluginCatalogMock.mockResolvedValue({ status: 'ok', entries: [entry()] });

    render(await PluginsPage());

    expect(screen.getByText(DECLARED_ONLY_CLAIM)).toBeInTheDocument();
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

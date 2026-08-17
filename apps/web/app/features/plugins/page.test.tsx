import { render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginRegistryEntry } from '@agiworkforce/types';

const loadPluginCatalogMock = vi.hoisted(() => vi.fn());

vi.mock('@/features/plugins/server/registry-source', () => ({
  loadPluginCatalog: loadPluginCatalogMock,
}));
vi.mock('@shared/components/layout/Header', () => ({ Header: () => <div /> }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => <div />,
}));

import FeaturesPluginsPage from './page';

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
    versions: [],
    distribution: null,
    integrity: { sha256: null, signature: null, signatureAlgorithm: null },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

beforeEach(() => {
  loadPluginCatalogMock.mockReset();
});

describe('FeaturesPluginsPage launch-state claims', () => {
  it('states the same availability the hosted catalogue reports', async () => {
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

    render(await FeaturesPluginsPage());

    expect(screen.getAllByText(/1 of 2 packs are installable today/i).length).toBeGreaterThan(0);
  });

  it('never hardcodes a CLI-preview-only launch state', async () => {
    loadPluginCatalogMock.mockResolvedValue({ status: 'ok', entries: [entry()] });

    render(await FeaturesPluginsPage());

    expect(screen.queryByText(/before the marketplace opens/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/live on the cli first/i)).not.toBeInTheDocument();
    expect(
      screen.getAllByText(/no pack is installable in this environment yet/i).length,
    ).toBeGreaterThan(0);
  });

  it('cross-links to the hosted catalogue', async () => {
    loadPluginCatalogMock.mockResolvedValue({ status: 'ok', entries: [entry()] });

    render(await FeaturesPluginsPage());

    const links = screen
      .getAllByRole('link')
      .filter((el) => el.getAttribute('href') === '/plugins');
    expect(links.length).toBeGreaterThan(0);
  });

  it('does not claim an install state when the registry is unreachable', async () => {
    loadPluginCatalogMock.mockResolvedValue({ status: 'unavailable' });

    render(await FeaturesPluginsPage());

    expect(
      screen.queryByText(/no pack is installable in this environment yet/i),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText(/registry is unreachable right now/i).length).toBeGreaterThan(0);
  });
});

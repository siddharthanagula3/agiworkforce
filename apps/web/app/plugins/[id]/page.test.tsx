import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PluginRegistryEntry } from '@agiworkforce/types';

const loadPluginEntryMock = vi.hoisted(() => vi.fn());
const loadPluginCatalogMock = vi.hoisted(() => vi.fn());

vi.mock('@/features/plugins/server/registry-source', () => ({
  loadPluginEntry: loadPluginEntryMock,
  loadPluginCatalog: loadPluginCatalogMock,
  detailInstallCommand: (entry: { installCommand?: string | null }) => entry.installCommand ?? null,
}));
vi.mock('@shared/components/layout/Header', () => ({ Header: () => <div /> }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => <div />,
}));
vi.mock('./ConnectorChecklist', () => ({ ConnectorChecklist: () => <div /> }));
vi.mock('@/lib/identity/client', () => ({
  useCurrentUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
}));

import PluginDetailPage from './page';
import PluginsPage from '../page';

const BASE_ENTRY: PluginRegistryEntry = {
  id: 'fixture-research-pack',
  name: 'Research Pack',
  version: '1.0.0',
  description: 'A reviewed workflow pack.',
  category: 'Research',
  publisher: { id: 'agi', name: 'AGI', kind: 'first-party' },
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
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

describe('PluginDetailPage', () => {
  it('routes a Web-installable pack to the real Plugins settings entry point', async () => {
    const entry = BASE_ENTRY;
    loadPluginEntryMock.mockResolvedValue({ status: 'ok', entry, manifest: null });

    render(
      await PluginDetailPage({
        params: Promise.resolve({ id: entry.id }),
      }),
    );

    expect(screen.getByText('Managed in Website Settings.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open Plugin settings' })).toHaveAttribute(
      'href',
      '/apps',
    );
  });

  it('lets the pinned install command wrap instead of widening a 390px page', async () => {
    const published = {
      ...BASE_ENTRY,
      webInstallable: false,
      distribution: {
        manifestUrl: 'https://example.com/packs/research/manifest.json',
        sha256: 'a'.repeat(64),
      },
    };
    loadPluginEntryMock.mockResolvedValue({ status: 'ok', entry: published, manifest: null });

    render(await PluginDetailPage({ params: Promise.resolve({ id: published.id }) }));

    const command = screen.getByTestId('plugin-install-command');
    expect(command.textContent).toContain(`--integrity sha256:${'a'.repeat(64)}`);
    expect(command.style.overflowWrap).toBe('anywhere');
  });

  it('sends a declared-only pack to a fragment the plugins page actually has', async () => {
    const declared = {
      ...BASE_ENTRY,
      status: 'preview' as const,
      webInstallable: false,
      distribution: null,
    };
    loadPluginEntryMock.mockResolvedValue({ status: 'ok', entry: declared, manifest: null });
    loadPluginCatalogMock.mockResolvedValue({ status: 'ok', entries: [declared] });

    const detail = render(await PluginDetailPage({ params: Promise.resolve({ id: declared.id }) }));
    const href = detail.getByRole('link', { name: 'How installation works' }).getAttribute('href');
    const [path, fragment] = (href ?? '').split('#');
    expect(path).toBe('/plugins');
    expect(fragment).toBeTruthy();

    const list = render(await PluginsPage());
    expect(list.container.querySelector(`[id="${fragment}"]`)).not.toBeNull();
  });
});

const DIRECTORY_BASE = {
  ...BASE_ENTRY,
  source: 'marketplace' as const,
  status: 'published' as const,
  distribution: null,
  slug: 'frontend-design',
  verified: true,
  installs: 1134112,
  repositoryUrl: 'https://github.com/anthropics/claude-plugins-official',
  marketplace: {
    name: 'claude-plugins-official',
    repositoryUrl: 'https://github.com/anthropics/claude-plugins-official',
    manifestUrl: null,
    contentHash: null,
  },
  sourceLocation: null,
  runtime: {
    webInstallable: true,
    inspected: true,
    components: {
      skills: ['frontend-design'],
      skillPaths: [],
      commands: 0,
      agents: 0,
      hooks: false,
      mcpServers: [],
      lspServers: [],
    },
    note: null,
  },
};

describe('PluginDetailPage for ids that only the directory serves', () => {
  it('renders a marketplace pack instead of the not-found page', async () => {
    const marketplace = {
      ...DIRECTORY_BASE,
      id: 'frontend-design',
      name: 'Frontend Design',
      sourceFacet: 'marketplace' as const,
      worksWith: ['web' as const, 'claude-code' as const],
      webInstallable: true,
      installCommand: 'claude plugin install frontend-design@claude-plugins-official',
    };
    loadPluginEntryMock.mockResolvedValue({ status: 'ok', entry: marketplace, manifest: null });

    render(await PluginDetailPage({ params: Promise.resolve({ id: 'frontend-design' }) }));

    expect(screen.getByRole('heading', { name: 'Frontend Design' })).toBeVisible();
    expect(screen.getByTestId('plugin-install-command').textContent).toBe(
      'claude plugin install frontend-design@claude-plugins-official',
    );
  });

  it('renders a partner pack and offers no install it cannot honour', async () => {
    const partner = {
      ...DIRECTORY_BASE,
      id: 'superpowers',
      name: 'Superpowers',
      slug: 'superpowers',
      sourceFacet: 'partner' as const,
      worksWith: ['cowork' as const],
      webInstallable: false,
      installCommand: null,
      runtime: { ...DIRECTORY_BASE.runtime, webInstallable: false, note: 'Cowork only.' },
    };
    loadPluginEntryMock.mockResolvedValue({ status: 'ok', entry: partner, manifest: null });

    render(await PluginDetailPage({ params: Promise.resolve({ id: 'superpowers' }) }));

    expect(screen.getByRole('heading', { name: 'Superpowers' })).toBeVisible();
    expect(screen.queryByTestId('plugin-install-command')).not.toBeInTheDocument();
    expect(screen.getAllByText('Declared: not installable yet').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'How installation works' })).toHaveAttribute(
      'href',
      '/plugins#install',
    );
  });
});

describe('a marketplace pack the web app cannot run', () => {
  it('never calls a pack with a working CLI command not installable', async () => {
    const cliOnly = {
      ...DIRECTORY_BASE,
      id: 'superpowers',
      name: 'Superpowers',
      slug: 'superpowers',
      sourceFacet: 'marketplace' as const,
      worksWith: ['claude-code' as const],
      webInstallable: false,
      installCommand: 'claude plugin install superpowers@claude-plugins-official',
      runtime: { ...DIRECTORY_BASE.runtime, webInstallable: false, note: 'Runs CLI hooks.' },
    };
    loadPluginEntryMock.mockResolvedValue({ status: 'ok', entry: cliOnly, manifest: null });

    render(await PluginDetailPage({ params: Promise.resolve({ id: 'superpowers' }) }));

    expect(screen.getByTestId('plugin-install-command').textContent).toContain(
      'claude plugin install superpowers',
    );
    expect(screen.queryByText('Declared: not installable yet')).not.toBeInTheDocument();
    expect(screen.getAllByText('Desktop and CLI').length).toBeGreaterThan(0);
  });
});

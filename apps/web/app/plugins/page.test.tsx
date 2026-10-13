import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginRegistryEntry } from '@agiworkforce/types';

const loadPluginCatalogMock = vi.hoisted(() => vi.fn());
const useCurrentUserMock = vi.hoisted(() => vi.fn());

vi.mock('@/features/plugins/server/registry-source', () => ({
  loadPluginCatalog: loadPluginCatalogMock,
}));
vi.mock('@shared/components/layout/Header', () => ({ Header: () => <div /> }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => <div />,
}));
vi.mock('@/lib/identity/client', () => ({ useCurrentUser: useCurrentUserMock }));

import { CONNECTORS_COMING_SOON_MESSAGE, connectorsReleased } from '@agiworkforce/types';
import {
  pluginConnectorWiringNote,
  pluginModelHeading,
  pluginStatusLabel,
} from '@/features/plugins/availability';
import { cliAvailabilityNote, isReleased } from '@/lib/surface-status';
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
  useCurrentUserMock.mockReset();
  useCurrentUserMock.mockReturnValue({ isLoaded: true, isSignedIn: false, user: null });
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

  it('counts web-installable packs against the rows actually read', async () => {
    loadPluginCatalogMock.mockResolvedValue({
      status: 'ok',
      entries: [
        entry({ status: 'published', webInstallable: true }),
        entry({ id: 'crm-sync', name: 'CRM Sync' }),
      ],
    });

    render(await PluginsPage());

    expect(screen.getByText(/1 of 2 packs install on the web/i)).toBeInTheDocument();
    expect(
      screen.getByText(/the other one is declared and not yet published/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/installable today/i)).not.toBeInTheDocument();
  });

  it('counts a CLI-published pack in its own sentence, not as a web install', async () => {
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

    expect(screen.getByText(/no pack installs on the web yet/i)).toBeInTheDocument();
    expect(screen.getByText(/1 is published for the CLI/i)).toBeInTheDocument();
    expect(screen.queryByText(/installable today/i)).not.toBeInTheDocument();
  });
});

describe('PluginsPage closing call to action', () => {
  it('sends a signed-out reader to sign up rather than to a waitlist', async () => {
    loadPluginCatalogMock.mockResolvedValue({ status: 'ok', entries: [] });

    render(await PluginsPage());

    expect(screen.getByRole('link', { name: 'Sign up to install' })).toHaveAttribute(
      'href',
      '/signup?redirectTo=%2Fapps',
    );
    expect(screen.queryByText(/get notified/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/when installation opens/i)).not.toBeInTheDocument();
  });

  it('sends a signed-in reader straight to the plugins settings', async () => {
    useCurrentUserMock.mockReturnValue({ isLoaded: true, isSignedIn: true, user: { id: 'u1' } });
    loadPluginCatalogMock.mockResolvedValue({ status: 'ok', entries: [] });

    render(await PluginsPage());

    expect(screen.getByRole('link', { name: 'Open plugin settings' })).toHaveAttribute(
      'href',
      '/apps',
    );
  });

  it('explains how a web pack installs without a typed claim the computed status can contradict', async () => {
    loadPluginCatalogMock.mockResolvedValue({ status: 'ok', entries: [] });

    render(await PluginsPage());

    expect(screen.getByText(/holds no packs yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/hosted installation is live/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /A pack marked Available on Web installs into your account from the plugins section of Settings/,
      ),
    ).toBeInTheDocument();
  });

  it('takes the CLI release state beside the install command from the surface registry', async () => {
    loadPluginCatalogMock.mockResolvedValue({ status: 'ok', entries: [] });

    render(await PluginsPage());

    const explainer = screen.getByText(/prints its AGI CLI install command on its own page/);
    expect(explainer).not.toHaveTextContent(/desktop and CLI install command/i);
    expect(explainer).toHaveTextContent(
      /prints none, because there is nothing published to install yet/,
    );
    if (isReleased('cli')) expect(explainer).not.toHaveTextContent(/coming soon/i);
    else expect(explainer).toHaveTextContent(cliAvailabilityNote());
  });
});

describe('PluginsPage status labels', () => {
  it('never labels a CLI-only pack with the bare word Installable', async () => {
    const cliPack = entry({
      status: 'published',
      distribution: { manifestUrl: 'https://example.com/plugin.json', sha256: null },
    });
    loadPluginCatalogMock.mockResolvedValue({ status: 'ok', entries: [cliPack] });

    render(await PluginsPage());

    expect(screen.queryByText('Installable')).not.toBeInTheDocument();
    expect(screen.queryByText(/· Installable$/)).not.toBeInTheDocument();
    expect(screen.getByText(pluginStatusLabel(cliPack))).toBeInTheDocument();
    expect(
      screen.getByText(`Developer · Built-in · ${pluginStatusLabel(cliPack)}`),
    ).toBeInTheDocument();
  });
});

describe('PluginsPage connector wording', () => {
  it('describes connector wiring through the connector release registry', async () => {
    loadPluginCatalogMock.mockResolvedValue({ status: 'ok', entries: [] });

    render(await PluginsPage());

    expect(screen.getByRole('heading', { name: pluginModelHeading() })).toBeInTheDocument();
    expect(screen.getByText(pluginConnectorWiringNote())).toBeInTheDocument();
    if (connectorsReleased()) {
      expect(
        screen.getByText(/Connect once, and every skill in the pack can use it/),
      ).toBeVisible();
    } else {
      expect(screen.queryByText(/Connect once/)).not.toBeInTheDocument();
      expect(screen.queryByText(/wired once/)).not.toBeInTheDocument();
      expect(pluginConnectorWiringNote()).toContain(CONNECTORS_COMING_SOON_MESSAGE);
    }
  });
});

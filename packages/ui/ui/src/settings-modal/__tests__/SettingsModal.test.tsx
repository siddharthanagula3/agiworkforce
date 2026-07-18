import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SettingsModal } from '../SettingsModal';
import { SETTINGS_NAV_GROUPS_WEB } from '../../settings-nav';
import type { SettingsDataAdapter } from '../types';

/**
 * Settings modal shell + connectors/skills/plugins panes (founder spec
 * 2026-07-10): flat nav with Skills/Connectors/Plugins as plain items (NO
 * "Customize" group heading), connectors TABLE with All/Connected/Not
 * connected tabs and honest statuses, Add dropdown (Browse connectors / Add
 * custom connector), skills table, shared directory browse.
 */

const adapter: SettingsDataAdapter = {
  connectors: [
    {
      id: 'github',
      name: 'GitHub',
      description: 'Repos and pull requests.',
      category: 'Developer',
      authType: 'oauth',
      actionCount: 3,
      phase: 1,
      iconBg: 'from-gray-700 to-gray-900',
      iconText: 'GH',
      canConnect: false,
      statusLabel: 'Not yet available on web',
    },
    {
      id: 'notion',
      name: 'Notion',
      description: 'Pages and databases.',
      category: 'Productivity',
      authType: 'oauth',
      actionCount: 4,
      phase: 1,
      iconBg: 'from-zinc-600 to-zinc-700',
      iconText: 'N',
      canConnect: false,
      statusLabel: 'Not yet available on web',
    },
    {
      id: 'stripe',
      name: 'Stripe',
      description: 'Payments data.',
      category: 'Finance',
      authType: 'api_key',
      actionCount: 5,
      phase: 2,
      iconBg: 'from-indigo-500 to-indigo-600',
      iconText: 'S',
      canConnect: false,
      statusLabel: 'Coming soon',
    },
    {
      id: 'local-filesystem',
      name: 'Local Filesystem',
      description: 'Local-only; must never render on web.',
      category: 'Exclusive',
      authType: 'pat',
      actionCount: 8,
      phase: 1,
      iconBg: 'from-amber-500 to-orange-600',
      iconText: 'FS',
      exclusive: true,
    },
  ],
  connectedConnectors: [{ connectorId: 'github', connectedAt: '2026-07-01T00:00:00.000Z' }],
  skills: [
    {
      id: 'humanizer',
      name: 'humanizer',
      description: 'Rewrite text',
      source: 'personal',
      tab: 'prompts',
    },
    { id: 'docx', name: 'docx', description: 'Word documents', source: 'bundled', tab: 'prompts' },
  ],
  plugins: [],
  pluginCatalog: [
    {
      id: 'github-automation',
      name: 'GitHub Automation',
      description: 'Pull request and issue workflows.',
      enabled: false,
      author: 'AGI',
      skillCount: 3,
      statusLabel: 'Catalogue preview',
      detailsHref: '/plugins/github-automation',
    },
  ],
};

function renderModal(
  overrides: Partial<React.ComponentProps<typeof SettingsModal>> = {},
  adapterOverrides: Partial<SettingsDataAdapter> = {},
) {
  const onClose = vi.fn();
  const onSectionChange = vi.fn();
  const utils = render(
    <SettingsModal
      open
      onClose={onClose}
      activeSection="connectors"
      onSectionChange={onSectionChange}
      sectionContent={{}}
      navGroups={SETTINGS_NAV_GROUPS_WEB}
      adapter={{ ...adapter, ...adapterOverrides }}
      {...overrides}
    />,
  );
  return { onClose, onSectionChange, ...utils };
}

describe('SettingsModal nav (web IA)', () => {
  it('renders Skills, Connectors, and Plugins as plain nav items with NO group headings', () => {
    renderModal();
    const nav = screen.getByRole('navigation', { name: 'Settings navigation' });
    expect(within(nav).getByRole('button', { name: 'Skills' })).toBeTruthy();
    expect(within(nav).getByRole('button', { name: 'Connectors' })).toBeTruthy();
    expect(within(nav).getByRole('button', { name: 'Plugins' })).toBeTruthy();
    // Founder directive: the "Customize" heading is deliberately dropped, and
    // the single flat group renders no heading at all.
    expect(within(nav).queryByText('Customize')).toBeNull();
    expect(SETTINGS_NAV_GROUPS_WEB).toHaveLength(1);
    expect(SETTINGS_NAV_GROUPS_WEB[0]?.label).toBeUndefined();
    // Skills/Connectors/Plugins come AFTER the core settings items.
    const keys = SETTINGS_NAV_GROUPS_WEB[0]!.items.map((i) => i.key);
    expect(keys.slice(-3)).toEqual(['skills', 'connectors', 'plugins']);
  });

  it('closes on Escape', () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('navigates between sections via the left nav', () => {
    const { onSectionChange } = renderModal();
    const nav = screen.getByRole('navigation', { name: 'Settings navigation' });
    fireEvent.click(within(nav).getByRole('button', { name: 'Skills' }));
    expect(onSectionChange).toHaveBeenCalledWith('skills');
  });
});

describe('Connectors pane (table)', () => {
  it('renders a table with Connector/Type/Status columns and real statuses only', () => {
    renderModal();
    expect(screen.getByRole('columnheader', { name: 'Connector' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Type' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeTruthy();

    // Connected row shows the real connected state (scoped to the table —
    // the "Connected" filter tab shares the word).
    const table = screen.getByRole('table');
    expect(within(table).getByText('Connected')).toBeTruthy();
    // Non-connectable rows show the honest surface label — never a Connect
    // button that is known to fail (canConnect false everywhere here).
    expect(screen.getAllByText('Not yet available on web').length).toBeGreaterThan(0);
    expect(screen.getByText('Coming soon')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Connect / })).toBeNull();

    // Local-only (exclusive) connectors never render on this surface.
    expect(screen.queryByText('Local Filesystem')).toBeNull();
  });

  it('filters rows via the All | Connected | Not connected tabs', () => {
    renderModal();
    fireEvent.click(screen.getByRole('tab', { name: /^Connected/ }));
    expect(screen.getByText('GitHub')).toBeTruthy();
    expect(screen.queryByText('Notion')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /^Not connected/ }));
    expect(screen.queryByText('GitHub')).toBeNull();
    expect(screen.getByText('Notion')).toBeTruthy();
    expect(screen.getByText('Stripe')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /^All/ }));
    expect(screen.getByText('GitHub')).toBeTruthy();
  });

  it('filters rows via search', () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText('Search connectors...'), {
      target: { value: 'notion' },
    });
    expect(screen.getByText('Notion')).toBeTruthy();
    expect(screen.queryByText('GitHub')).toBeNull();
  });

  it('opens an in-place detail view with real metadata and Disconnect for connected rows', async () => {
    const disconnectConnector = vi.fn();
    renderModal({}, { disconnectConnector });
    fireEvent.click(screen.getByRole('button', { name: 'GitHub' }));

    // Detail view: back affordance, description, details from the catalog.
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(screen.getByText('Repos and pull requests.')).toBeTruthy();
    expect(screen.getByText('Authentication')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    await waitFor(() => expect(disconnectConnector).toHaveBeenCalledWith('github'));

    // Back returns to the table.
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('columnheader', { name: 'Connector' })).toBeTruthy();
  });

  it('renders a Connect button ONLY when the surface can actually connect, surfacing failures inline', async () => {
    const connectConnector = vi.fn().mockRejectedValue(new Error('OAuth flow failed.'));
    renderModal(
      {},
      {
        connectConnector,
        connectors: [
          {
            ...adapter.connectors![1]!,
            canConnect: true,
            statusLabel: undefined,
          },
        ],
        connectedConnectors: [],
      },
    );
    const connectBtn = screen.getByRole('button', { name: 'Connect Notion' });
    fireEvent.click(connectBtn);
    await waitFor(() => expect(connectConnector).toHaveBeenCalledWith('notion'));
    // The failure renders inline — never a silent rollback or fake success.
    expect(await screen.findByText('OAuth flow failed.')).toBeTruthy();
  });

  it('Add dropdown offers Browse connectors and Add custom connector', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
    expect(screen.getByRole('menuitem', { name: 'Browse connectors' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Add custom connector' })).toBeTruthy();
  });

  it('Browse connectors opens the shared directory with Skills/Connectors/Plugins tabs', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Browse connectors' }));

    expect(screen.getByText('Browse directory')).toBeTruthy();
    const tablist = screen.getByRole('tablist', { name: 'Directory sections' });
    expect(within(tablist).getByRole('tab', { name: 'Skills' })).toBeTruthy();
    expect(within(tablist).getByRole('tab', { name: 'Connectors' })).toBeTruthy();
    expect(within(tablist).getByRole('tab', { name: 'Plugins' })).toBeTruthy();

    // Connectors tab shows the catalog cards (still no fake Connect for
    // non-connectable entries, and no local-only connectors).
    expect(screen.getByText('Notion')).toBeTruthy();
    expect(screen.queryByText('Local Filesystem')).toBeNull();

    // Skills tab shows loaded skills as /name cards without any counts.
    fireEvent.click(within(tablist).getByRole('tab', { name: 'Skills' }));
    expect(screen.getByText('/humanizer')).toBeTruthy();

    // Plugins tab reuses the discoverable catalogue without pretending those
    // entries are installed or installable on this surface.
    fireEvent.click(within(tablist).getByRole('tab', { name: 'Plugins' }));
    expect(screen.getByText('GitHub Automation')).toBeTruthy();
    expect(screen.getByText('Catalogue preview')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'View GitHub Automation details' }).getAttribute('href'),
    ).toBe('/plugins/github-automation');
    expect(screen.queryByRole('button', { name: /install github automation/i })).toBeNull();
  });

  it('shows honest loading states for directory catalogues', () => {
    renderModal({}, { skills: [], skillsLoading: true, pluginCatalog: [], pluginsLoading: true });
    fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Browse connectors' }));

    const tablist = screen.getByRole('tablist', { name: 'Directory sections' });
    fireEvent.click(within(tablist).getByRole('tab', { name: 'Skills' }));
    expect(screen.getByText('Loading skills…')).toBeTruthy();
    fireEvent.click(within(tablist).getByRole('tab', { name: 'Plugins' }));
    expect(screen.getByText('Loading plugins…')).toBeTruthy();
  });

  it('Add custom connector renders the BETA form and surfaces an honest error on submit', async () => {
    const addCustomConnector = vi
      .fn()
      .mockRejectedValue(new Error('Custom connectors are not yet supported on web.'));
    renderModal({}, { addCustomConnector });

    fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add custom connector' }));

    expect(screen.getByText('Add custom connector')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
    expect(screen.getByText(/Only use connectors from developers you trust/)).toBeTruthy();

    // Advanced settings collapse holds the optional OAuth fields.
    fireEvent.click(screen.getByRole('button', { name: 'Advanced settings' }));
    expect(screen.getByText('OAuth Client ID (optional)')).toBeTruthy();
    expect(screen.getByText('OAuth Client Secret (optional)')).toBeTruthy();

    // Add stays disabled until name + a valid https URL are supplied.
    const addBtn = screen.getByRole('button', { name: 'Add' });
    expect(addBtn).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByPlaceholderText('My connector'), {
      target: { value: 'My MCP' },
    });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/mcp'), {
      target: { value: 'http://insecure.example' },
    });
    expect(screen.getByText('Enter a valid https:// URL.')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('https://example.com/mcp'), {
      target: { value: 'https://mcp.example.com' },
    });
    expect(addBtn).toHaveProperty('disabled', false);

    fireEvent.click(addBtn);
    await waitFor(() => expect(addCustomConnector).toHaveBeenCalled());
    // Honest failure — the form shows the error and does NOT fake a success.
    expect(await screen.findByText('Custom connectors are not yet supported on web.')).toBeTruthy();
    expect(screen.getByText('Add custom connector')).toBeTruthy();
  });
});

describe('Skills pane (table)', () => {
  it('renders a Skill/Author table with honest author labels and a Browse button', () => {
    renderModal({ activeSection: 'skills' });
    expect(screen.getByRole('columnheader', { name: 'Skill' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Author' })).toBeTruthy();
    expect(screen.getByText('humanizer')).toBeTruthy();
    expect(screen.getByText('You')).toBeTruthy(); // personal source
    expect(screen.getByText('AGI')).toBeTruthy(); // bundled source
    // No Add dropdown: there is no real create/upload skill capability.
    expect(screen.queryByRole('button', { name: /^Add$/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
    expect(screen.getByText('Browse directory')).toBeTruthy();
    expect(screen.getByText('/humanizer')).toBeTruthy();
  });
});

describe('Plugins pane (table)', () => {
  it('shows the honest empty state and no Add dropdown when no capabilities exist', () => {
    renderModal({ activeSection: 'plugins' });
    expect(
      screen.getByText('No plugins installed. Plugins are available via the AGI CLI.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Add$/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Browse' })).toBeTruthy();
  });

  it('renders plugin rows with optional columns only when real data exists, and gates Add items on capabilities', () => {
    renderModal(
      { activeSection: 'plugins' },
      {
        plugins: [
          {
            id: 'p1',
            name: 'Docs Pack',
            description: 'Document tooling',
            enabled: true,
            author: 'AGI',
            skillCount: 4,
            updatedAt: '2026-07-01T00:00:00.000Z',
          },
        ],
        onAddPluginMarketplace: vi.fn(),
        onUploadPlugin: vi.fn(),
      },
    );
    expect(screen.getByRole('columnheader', { name: 'Plugin' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Author' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Skills' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Last updated' })).toBeTruthy();
    expect(screen.getByText('Docs Pack')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
    expect(screen.getByRole('menuitem', { name: 'Add marketplace' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Upload plugin' })).toBeTruthy();
    // No "Create with AGI" — no real plugin-creation flow exists to back it.
    expect(screen.queryByRole('menuitem', { name: /Create/ })).toBeNull();
  });
});

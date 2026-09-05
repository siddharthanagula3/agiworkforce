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
    {
      id: 'docx',
      name: 'docx',
      description: 'Word documents',
      source: 'bundled',
      tab: 'prompts',
      statusLabel: 'Included',
      downloadHref: '/api/skills/docx/download',
    },
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
  it('uses an accessible dialog boundary and a responsive stacked layout', () => {
    renderModal();

    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    const nav = screen.getByRole('navigation', { name: 'Settings navigation' });

    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(dialog.className).toContain('md:flex-row');
    expect(nav.className).toContain('md:w-[220px]');
    expect(screen.getByRole('searchbox', { name: 'Search settings' })).toBeTruthy();
  });

  it('raises the mobile nav clip and cues an overflowing list with a scroll fade', () => {
    renderModal();

    const nav = screen.getByRole('navigation', { name: 'Settings navigation' });
    const scrollRegion = screen.getByTestId('settings-nav-scroll-region');
    const topFade = screen.getByTestId('settings-nav-scroll-fade-top');
    const bottomFade = screen.getByTestId('settings-nav-scroll-fade-bottom');

    expect(nav.className).toContain('max-h-[64%]');
    expect(topFade.className).toContain('opacity-0');
    expect(bottomFade.className).toContain('opacity-0');

    Object.defineProperty(scrollRegion, 'scrollHeight', { configurable: true, value: 600 });
    Object.defineProperty(scrollRegion, 'clientHeight', { configurable: true, value: 300 });
    Object.defineProperty(scrollRegion, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 0,
    });

    fireEvent.scroll(scrollRegion);

    expect(bottomFade.className).toContain('opacity-100');
    expect(topFade.className).toContain('opacity-0');

    scrollRegion.scrollTop = 300;
    fireEvent.scroll(scrollRegion);

    expect(topFade.className).toContain('opacity-100');
    expect(bottomFade.className).toContain('opacity-0');
  });

  it('gives the fade overlays their own blank space instead of overlapping the first and last rows', () => {
    renderModal();

    const scrollRegion = screen.getByTestId('settings-nav-scroll-region');
    const topFade = screen.getByTestId('settings-nav-scroll-fade-top');
    const bottomFade = screen.getByTestId('settings-nav-scroll-fade-bottom');

    expect(topFade.nextElementSibling?.className).toContain('h-6');
    expect(bottomFade.previousElementSibling?.className).toContain('h-6');
    expect(scrollRegion.contains(topFade.nextElementSibling)).toBe(true);
    expect(scrollRegion.contains(bottomFade.previousElementSibling)).toBe(true);
  });

  it('scrolls the active entry into view with the minimal nearest alignment on change', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    const { rerender } = renderModal({ activeSection: 'general' });
    scrollIntoView.mockClear();

    rerender(
      <SettingsModal
        open
        onClose={vi.fn()}
        activeSection="billing"
        onSectionChange={vi.fn()}
        sectionContent={{}}
        navGroups={SETTINGS_NAV_GROUPS_WEB}
        adapter={adapter}
      />,
    );

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('keeps the title and search pinned outside the scrolling entry list', () => {
    renderModal();

    const nav = screen.getByRole('navigation', { name: 'Settings navigation' });
    const scrollRegion = screen.getByTestId('settings-nav-scroll-region');
    const search = screen.getByRole('searchbox', { name: 'Search settings' });

    expect(scrollRegion.className).toContain('overflow-y-auto');
    expect(nav.className).not.toContain('overflow-y-auto');
    expect(scrollRegion.contains(search)).toBe(false);
  });

  it('renders no New skill control or Actions column when the adapter cannot author skills', () => {
    renderModal({ activeSection: 'skills' });

    expect(screen.queryByRole('button', { name: 'New skill' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
  });

  it('shows New skill and per-row Edit/Delete only for a skill the adapter marks editable', () => {
    renderModal(
      { activeSection: 'skills' },
      {
        skills: [
          {
            id: 'humanizer',
            name: 'humanizer',
            description: 'Rewrite text',
            source: 'personal',
            tab: 'prompts',
            editable: true,
          },
          {
            id: 'docx',
            name: 'docx',
            description: 'Word documents',
            source: 'bundled',
            tab: 'prompts',
            statusLabel: 'Included',
          },
        ],
        onCreateSkill: vi.fn(),
        editSkill: vi.fn(),
        removeSkill: vi.fn(),
      },
    );

    expect(screen.getByRole('button', { name: 'New skill' })).toBeTruthy();
    const editableRow = screen.getByText('humanizer').closest('tr') as HTMLElement;
    expect(within(editableRow).getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(within(editableRow).getByRole('button', { name: 'Delete' })).toBeTruthy();
    const bundledRow = screen.getByText('docx').closest('tr') as HTMLElement;
    expect(within(bundledRow).queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(within(bundledRow).queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('opens the editor for the clicked skill and asks for confirmation before deleting', async () => {
    const editSkill = vi.fn();
    const removeSkill = vi.fn();
    renderModal(
      { activeSection: 'skills' },
      {
        skills: [
          {
            id: 'humanizer',
            name: 'humanizer',
            description: 'Rewrite text',
            source: 'personal',
            tab: 'prompts',
            editable: true,
          },
        ],
        onCreateSkill: vi.fn(),
        editSkill,
        removeSkill,
      },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(editSkill).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'humanizer', name: 'humanizer' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(removeSkill).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Delete skill?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(removeSkill).toHaveBeenCalledWith('humanizer'));
  });

  it('hides secondary Plugin metadata below sm while preserving lifecycle actions', () => {
    renderModal(
      { activeSection: 'plugins' },
      {
        plugins: [
          {
            id: 'research-pack',
            name: 'Research Pack',
            description: 'A reviewed research workflow.',
            enabled: true,
            author: 'AGI',
            skillCount: 1,
            updatedAt: '2026-08-01T00:00:00.000Z',
          },
        ],
        setPluginEnabled: vi.fn(),
        removePlugin: vi.fn(),
      },
    );

    for (const heading of ['Author', 'Skills', 'Last updated']) {
      const column = screen.getByRole('columnheader', { name: heading });
      expect(column.className).toContain('hidden');
      expect(column.className).toContain('sm:table-cell');
    }
    expect(screen.getByRole('columnheader', { name: 'Actions' }).className).toContain('w-[40%]');
    expect(screen.getByText('Research Pack')).toBeTruthy();
    expect(screen.getByText('Enabled')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Disable' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
  });

  it('does not claim a deprecated, server-gated plugin is Enabled just because the stale installation row still says so', () => {
    renderModal(
      { activeSection: 'plugins' },
      {
        plugins: [
          {
            id: 'legacy-pack',
            name: 'Legacy Pack',
            description: 'Deprecated tool bundle.',
            enabled: true,
            installed: true,
            installable: false,
            statusLabel: 'Deprecated',
          },
        ],
        setPluginEnabled: vi.fn(),
        removePlugin: vi.fn(),
      },
    );

    expect(screen.getByText('Legacy Pack')).toBeTruthy();
    expect(screen.getByText('Deprecated')).toBeTruthy();
    expect(screen.queryByText('Enabled')).toBeNull();
  });

  it('finds the real General personalization surface from custom-instructions language', () => {
    renderModal();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search settings' }), {
      target: { value: 'custom instructions' },
    });

    const nav = screen.getByRole('navigation', { name: 'Settings navigation' });
    expect(within(nav).getByRole('button', { name: 'General' })).toBeTruthy();
    expect(within(nav).queryByText('No matches.')).toBeNull();
  });

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
    const keys = SETTINGS_NAV_GROUPS_WEB[0]!.items.map((i) => i.key);
    expect(keys).toContain('reflect');
    expect(keys).toContain('time-focus');
    const customizeRun = keys.indexOf('skills');
    expect(customizeRun).toBeGreaterThan(keys.indexOf('time-focus'));
    expect(keys.slice(customizeRun, customizeRun + 3)).toEqual(['skills', 'connectors', 'plugins']);
    expect(keys[keys.length - 1]).toBe('help');
  });

  it('closes on Escape', () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('navigates between sections via the left nav', () => {
    const { onSectionChange } = renderModal();
    const nav = screen.getByRole('navigation', { name: 'Settings navigation' });
    fireEvent.click(within(nav).getByRole('button', { name: 'Skills' }));
    expect(onSectionChange).toHaveBeenCalledWith('skills');
  });
});

describe('SettingsModal nav badges', () => {
  it('renders no badge when nothing needs attention', () => {
    renderModal();
    const nav = screen.getByRole('navigation', { name: 'Settings navigation' });
    // Exact-name match: a badge would make the accessible name "Connectors 2".
    expect(within(nav).getByRole('button', { name: 'Connectors' })).toBeTruthy();
  });

  it('marks the section and says what is wrong, not just a number', () => {
    renderModal({
      navBadges: { connectors: { count: 2, description: '2 connectors need to be reconnected' } },
    });
    const nav = screen.getByRole('navigation', { name: 'Settings navigation' });

    expect(within(nav).getByText('2')).toBeTruthy();
    // "2" alone tells a screen-reader user nothing about what needs attention.
    expect(within(nav).getByLabelText('2 connectors need to be reconnected')).toBeTruthy();
  });

  it('caps the count so a long list cannot distort the nav row', () => {
    renderModal({
      navBadges: { connectors: { count: 42, description: '42 connectors need to be reconnected' } },
    });
    expect(screen.getByText('9+')).toBeTruthy();
  });

  it('renders nothing for a zero count', () => {
    renderModal({ navBadges: { connectors: { count: 0, description: 'nothing' } } });
    const nav = screen.getByRole('navigation', { name: 'Settings navigation' });
    expect(within(nav).getByRole('button', { name: 'Connectors' })).toBeTruthy();
    expect(within(nav).queryByText('0')).toBeNull();
  });
});

describe('Connectors pane (table)', () => {
  it('keeps the primary table limited to connected or genuinely connectable rows', () => {
    renderModal();
    expect(screen.getByRole('columnheader', { name: 'Connector' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Type' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeTruthy();

    const table = screen.getByRole('table');
    expect(within(table).getByText('Connected')).toBeTruthy();
    // Preview-only rows stay in Browse rather than flooding the operational
    // table with dead actions.
    expect(screen.queryByText('Notion')).toBeNull();
    expect(screen.queryByText('Stripe')).toBeNull();
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
    expect(screen.getByText('No connectors match your filters.')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /^All/ }));
    expect(screen.getByText('GitHub')).toBeTruthy();
  });

  it('keeps the tab count legible when the selected tab inverts its colours', () => {
    renderModal();

    for (const name of [/^All/, /^Connected/, /^Not connected/]) {
      fireEvent.click(screen.getByRole('tab', { name }));
      const selected = screen.getByRole('tab', { name });
      const count = within(selected).getByText(/^\d+$/);
      // The selected tab paints bg-foreground/text-background, so any colour
      // the count sets for itself survives the inversion and lands dark-on-dark.
      expect(selected.className).toContain('bg-foreground');
      expect(count.className).not.toMatch(/(^|\s)text-/);
    }
  });

  it('filters rows via search', () => {
    renderModal();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search connectors' }), {
      target: { value: 'github' },
    });
    expect(screen.getByText('GitHub')).toBeTruthy();
  });

  it('promotes a real custom-MCP connection action when no connector is ready', () => {
    renderModal(
      {},
      {
        connectedConnectors: [],
        addCustomConnector: vi.fn(),
      },
    );

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText('Notion')).toBeNull();
    expect(screen.getByText('Connect your first tool')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Connect remote MCP server' }));
    expect(screen.getByText('Add custom connector')).toBeTruthy();
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
    fireEvent.click(
      within(screen.getByRole('alertdialog', { name: 'Disconnect GitHub?' })).getByRole('button', {
        name: 'Disconnect',
      }),
    );
    await waitFor(() => expect(disconnectConnector).toHaveBeenCalledWith('github'));

    // Back returns to the table.
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('columnheader', { name: 'Connector' })).toBeTruthy();
  });

  it('does not make the entire connector table row a mouse-only control', () => {
    renderModal();
    const githubRow = screen.getByRole('button', { name: 'GitHub' }).closest('tr');
    expect(githubRow).toBeTruthy();

    // "Developer" renders twice in this row: the mobile-only inline category
    // (sm:hidden) and the desktop-only category column (hidden sm:table-cell)
    // added when the Type column moved under the name below sm.
    fireEvent.click(within(githubRow!).getAllByText('Developer')[0]!);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('announces connector loading and errors', () => {
    const first = renderModal({}, { connectorsLoading: true });
    expect(screen.getByRole('status').textContent).toContain('Loading connectors…');

    first.unmount();
    renderModal({}, { connectorsLoading: false, connectorsError: 'Directory unavailable.' });
    expect(screen.getByRole('alert').textContent).toContain('Directory unavailable.');
  });

  it('renders a scoped connectorsNotice alongside the table instead of replacing it', () => {
    renderModal(
      {},
      { connectorsLoading: false, connectorsNotice: 'One source could not be loaded.' },
    );

    expect(screen.getByRole('columnheader', { name: 'Connector' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('One source could not be loaded.');
    expect(screen.queryByRole('alert')).toBeNull();
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
    expect(await screen.findByText('OAuth flow failed.')).toBeTruthy();
  });

  it('renders the surface-supplied per-scope permission list in the connector detail view', () => {
    renderModal({
      renderConnectorScopes: (connectorId) => <div>Scopes for {connectorId}</div>,
    });
    fireEvent.click(screen.getByRole('button', { name: 'GitHub' }));
    expect(screen.getByText('Scopes for github')).toBeTruthy();
  });

  it('renders no scope list when the surface supplies none', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'GitHub' }));
    expect(screen.queryByText(/Scopes for/)).toBeNull();
  });

  it('opens the custom-connector docs without tearing down the settings modal', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add custom connector' }));

    const learnMore = screen.getByRole('link', { name: 'Learn more' });
    expect(learnMore.getAttribute('target')).toBe('_blank');
    expect(learnMore.getAttribute('rel')).toContain('noreferrer');
  });

  // CONNECTOR-FORM-PASSWORD-AUTOFILL-01
  it('opts the custom-connector fields out of password-manager autofill', () => {
    renderModal({}, { addCustomConnector: vi.fn(), customConnectorAuthTokenSupported: true });

    fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add custom connector' }));

    const nameInput = screen.getByPlaceholderText('My connector');
    const tokenInput = screen.getByPlaceholderText('Token is encrypted before storage');

    // A bare text input followed by a password input is the login-form shape
    // that made Chrome fill the account email + saved ACCOUNT PASSWORD here.
    expect(nameInput.getAttribute('autocomplete')).toBe('off');
    // `off` is ignored by managers on login-shaped forms; `new-password` is not.
    expect(tokenInput.getAttribute('autocomplete')).toBe('new-password');

    for (const el of [nameInput, tokenInput]) {
      expect(el.hasAttribute('data-1p-ignore')).toBe(true);
      expect(el.getAttribute('data-lpignore')).toBe('true');
      expect(el.hasAttribute('data-bwignore')).toBe(true);
      // Neither field may look like a username/password slot to a manager.
      expect(el.getAttribute('name')).not.toMatch(/user|email|login|^password$/i);
    }
  });

  it('Add custom connector can securely forward an optional bearer token and surfaces errors', async () => {
    const addCustomConnector = vi
      .fn()
      .mockRejectedValue(new Error('Custom connectors are not yet supported on web.'));
    renderModal(
      {},
      {
        addCustomConnector,
        customConnectorAuthTokenSupported: true,
      },
    );

    fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add custom connector' }));

    expect(screen.getByText('Add custom connector')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
    expect(screen.getByText(/Only use connectors from developers you trust/)).toBeTruthy();

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
    fireEvent.change(screen.getByPlaceholderText('Token is encrypted before storage'), {
      target: { value: 'secret-token' },
    });
    expect(addBtn).toHaveProperty('disabled', false);

    fireEvent.click(addBtn);
    await waitFor(() =>
      expect(addCustomConnector).toHaveBeenCalledWith({
        name: 'My MCP',
        url: 'https://mcp.example.com',
        authToken: 'secret-token',
      }),
    );
    expect(await screen.findByText('Custom connectors are not yet supported on web.')).toBeTruthy();
    expect(screen.getByText('Add custom connector')).toBeTruthy();
  });

  it('prefills name/url/token from a pasted JSON config, then submits through the normal Add flow', async () => {
    const addCustomConnector = vi.fn().mockResolvedValue(undefined);
    renderModal(
      {},
      {
        addCustomConnector,
        customConnectorAuthTokenSupported: true,
      },
    );

    fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add custom connector' }));

    const addBtn = screen.getByRole('button', { name: 'Add' });
    expect(addBtn).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByLabelText('MCP server JSON config'), {
      target: {
        value: JSON.stringify({
          mcpServers: {
            linear: {
              url: 'https://mcp.linear.app/mcp',
              headers: { Authorization: 'Bearer secret-token', 'X-Custom': 'dropped' },
            },
          },
        }),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /parse & fill in fields below/i }));

    expect(screen.getByPlaceholderText('My connector')).toHaveProperty('value', 'linear');
    expect(screen.getByPlaceholderText('https://example.com/mcp')).toHaveProperty(
      'value',
      'https://mcp.linear.app/mcp',
    );
    expect(screen.getByPlaceholderText('Token is encrypted before storage')).toHaveProperty(
      'value',
      'secret-token',
    );
    // A header this product cannot store is surfaced, not silently dropped.
    expect(screen.getByText(/X-Custom.*will not be saved/i)).toBeTruthy();
    expect(addBtn).toHaveProperty('disabled', false);

    fireEvent.click(addBtn);
    await waitFor(() =>
      expect(addCustomConnector).toHaveBeenCalledWith({
        name: 'linear',
        url: 'https://mcp.linear.app/mcp',
        authToken: 'secret-token',
      }),
    );
  });

  it('shows the parser-specific error for malformed JSON instead of a generic message', async () => {
    renderModal({}, { addCustomConnector: vi.fn(), customConnectorAuthTokenSupported: true });

    fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add custom connector' }));

    fireEvent.change(screen.getByLabelText('MCP server JSON config'), {
      target: { value: '{not json' },
    });
    fireEvent.click(screen.getByRole('button', { name: /parse & fill in fields below/i }));

    expect(screen.getByText('That is not valid JSON.')).toBeTruthy();
  });

  it('labels a custom_mcp connector Unverified in the table, its detail card, and the add form', () => {
    const customConnector = {
      id: 'my-mcp',
      name: 'My MCP',
      description: 'A user-added remote server.',
      category: 'Custom',
      authType: 'custom_mcp',
      actionCount: 0,
      phase: 1,
      iconBg: 'from-slate-500 to-slate-700',
      iconText: 'MC',
      canConnect: true,
    };
    renderModal(
      {},
      { connectors: [...(adapter.connectors ?? []), customConnector], addCustomConnector: vi.fn() },
    );

    const row = screen.getByRole('button', { name: 'My MCP' }).closest('tr') as HTMLElement;
    expect(within(row).getByText('Unverified')).toBeTruthy();

    fireEvent.click(within(row).getByRole('button', { name: 'My MCP' }));
    expect(screen.getAllByText('Unverified').length).toBeGreaterThan(0);
    expect(screen.getByText(/AGI has not reviewed this server/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add custom connector' }));
    expect(screen.getByText(/AGI has not reviewed this server/)).toBeTruthy();
  });
});

describe('Skills pane (table)', () => {
  it('renders a Skill/Author table with honest author labels', () => {
    renderModal({ activeSection: 'skills' });
    expect(
      screen.getByText(
        "Bundled, portable instruction sets for focused workflows. Select one in chat with / or @, or download its SKILL.md. The web app doesn't author skills. Use Record a skill in the Desktop app, or add a SKILL.md file to .agiworkforce/skills in the CLI.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Skill' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Author' })).toBeTruthy();
    expect(screen.getByText('humanizer')).toBeTruthy();
    expect(screen.getByText('You')).toBeTruthy(); // personal source
    expect(screen.getByText('AGI')).toBeTruthy(); // bundled source
    expect(screen.queryByRole('button', { name: /^Add$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Browse' })).toBeNull();
  });
});

describe('Plugins pane (table)', () => {
  it('shows the honest empty state and no Add dropdown when no capabilities exist', () => {
    renderModal({ activeSection: 'plugins' });
    expect(
      screen.getByText(
        'No plugins installed. Browse the directory to add an available Web plugin.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Add$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Browse' })).toBeNull();
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
    expect(screen.getByRole('table').className).toContain('table-fixed');

    fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
    expect(screen.getByRole('menuitem', { name: 'Add marketplace' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Upload plugin' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /Create/ })).toBeNull();
  });
});

describe('Customize panels render the directory', () => {
  const directoryAdapter = {
    sections: ['skills'] as const,
    skills: {
      installable: true,
      entries: [
        { id: 'humanizer', name: 'humanizer', slashName: true, description: 'Rewrites text' },
      ],
      sortOptions: ['name'] as const,
    },
  };

  it('replaces the skills table with the directory panel when an adapter is supplied', () => {
    renderModal({ activeSection: 'skills', directoryAdapter });
    expect(screen.getByPlaceholderText('Search skills')).toBeTruthy();
    expect(screen.getByRole('button', { name: '/humanizer' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Skill' })).toBeNull();
  });

  it('keeps the legacy table when no directory adapter is supplied', () => {
    renderModal({ activeSection: 'skills' });
    expect(screen.getByRole('columnheader', { name: 'Skill' })).toBeTruthy();
    expect(screen.queryByPlaceholderText('Search skills')).toBeNull();
  });

  it('leaves a section the adapter does not serve on its legacy panel', () => {
    renderModal({ activeSection: 'connectors', directoryAdapter });
    expect(screen.queryByPlaceholderText('Search connectors')).toBeNull();
  });

  it('renders the directory for a section the adapter does serve', () => {
    renderModal({
      activeSection: 'plugins',
      directoryAdapter: {
        ...directoryAdapter,
        sections: ['skills', 'plugins'] as const,
        plugins: { entries: [], sortOptions: ['name'] as const },
      },
    });
    expect(screen.getByPlaceholderText('Search plugins')).toBeTruthy();
  });
});

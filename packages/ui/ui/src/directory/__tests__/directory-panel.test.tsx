import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DirectoryActionNotice } from '../action-notice';
import { DirectoryPanel } from '../DirectoryPanel';
import type {
  DirectoryAdapter,
  DirectoryDetail,
  DirectoryQuery,
  DirectorySectionKey,
} from '../types';

afterEach(cleanup);

const DETAILS: Record<DirectorySectionKey, DirectoryDetail> = {
  skills: {
    kind: 'skill',
    id: 'canvas-design',
    name: 'canvas-design',
    publisher: 'Made by AGI',
    description: 'Create visual art',
    license: 'Complete terms in LICENSE.txt',
    files: [
      { path: 'SKILL.md', content: 'First block\n\nSecond block' },
      { path: 'fonts/Bold.ttf', previewable: false },
    ],
    installed: false,
  },
  connectors: {
    kind: 'connector',
    id: 'customerscore',
    name: 'Customerscore',
    summary: 'Customer health insights',
    description: 'Scores every customer',
    badge: 'community',
    tools: ['list_customers', 'create_segment'],
    categories: ['Data'],
    publisher: 'Customerscore',
    publisherUrl: 'https://customerscore.invalid',
    authorName: 'Customerscore Inc',
    authorUrl: 'https://customerscore.invalid/about',
    connectorUrl: 'https://mcp.customerscore.invalid/v1',
    documentationUrl: 'https://docs.customerscore.invalid',
  },
  plugins: {
    kind: 'plugin',
    id: 'productivity',
    name: 'Productivity',
    publisher: 'AGI',
    description: 'Manage tasks',
    homepageUrl: 'https://example.invalid/productivity',
    examplePrompts: ['Catch me up'],
  },
};

function makeAdapter(patch: Partial<DirectoryAdapter> = {}): DirectoryAdapter {
  return {
    sections: ['skills', 'connectors', 'plugins'],
    skills: {
      installable: true,
      entries: [
        {
          id: 'canvas-design',
          name: 'canvas-design',
          slashName: true,
          description: 'Create visual art',
          sourceId: 'agi',
          installed: false,
          facets: { status: ['not-installed'] },
        },
        {
          id: 'my-skill',
          name: 'my-skill',
          slashName: true,
          description: 'Mine',
          sourceId: 'yours',
          installed: true,
          facets: { status: ['installed'] },
        },
      ],
      sources: [
        { id: 'agi', label: 'Made by AGI' },
        { id: 'yours', label: 'Yours' },
      ],
      filterGroups: [
        {
          id: 'status',
          label: 'Status',
          options: [
            { value: 'installed', label: 'Installed' },
            { value: 'not-installed', label: 'Not installed' },
          ],
        },
      ],
      sortOptions: ['name'],
    },
    connectors: {
      installable: true,
      entries: [
        {
          id: 'gmail',
          name: 'Gmail',
          description: 'Mail',
          popular: true,
          installed: false,
        },
        { id: 'customerscore', name: 'Customerscore', description: 'Customer health' },
      ],
      sortOptions: ['name'],
    },
    plugins: {
      installable: true,
      entries: [{ id: 'productivity', name: 'Productivity', description: 'Manage tasks' }],
      sortOptions: ['name'],
    },
    loadDetail: (section) => Promise.resolve(DETAILS[section]),
    ...patch,
  };
}

function renderPanel(
  section: DirectorySectionKey = 'skills',
  patch: Partial<DirectoryAdapter> = {},
  props: Partial<React.ComponentProps<typeof DirectoryPanel>> = {},
) {
  const adapter = makeAdapter(patch);
  render(<DirectoryPanel section={section} adapter={adapter} {...props} />);
  return adapter;
}

describe('DirectoryPanel layout', () => {
  it('renders the panel title, search and filters in one view', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: 'Skills' })).toBeTruthy();
    expect(screen.getByPlaceholderText('Search skills')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Made by AGI' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Filter by/ })).toBeTruthy();
  });

  it('splits owned items into an Installed section above the catalog', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: 'Installed' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'All skills' })).toBeTruthy();
  });

  it('names the catalog after the active tab when the section says so', () => {
    renderPanel('connectors', {
      connectors: {
        installable: true,
        entries: [{ id: 'gmail', name: 'Gmail', description: 'Mail' }],
        catalogHeading: 'Official connectors',
      },
    });
    expect(screen.getByRole('heading', { name: 'Official connectors' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Top connectors' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'All connectors' })).toBeNull();
  });

  it('names the connected section for connectors and leads with Top connectors', () => {
    renderPanel('connectors');
    expect(screen.getByRole('heading', { name: 'Top connectors' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'All connectors' })).toBeTruthy();
  });

  it('lists the account custom connectors first', () => {
    renderPanel('connectors', {
      connectors: {
        installable: true,
        entries: [
          {
            id: 'custom-1',
            name: 'My server',
            description: 'https://mcp.invalid',
            badges: ['custom'],
          },
          { id: 'gmail', name: 'Gmail', description: 'Mail', popular: true },
        ],
      },
    });
    const headings = screen.getAllByRole('heading', { level: 3 }).map((node) => node.textContent);
    expect(headings[0]).toBe('Your custom connectors');
    expect(headings[1]).toBe('Top connectors');
  });

  it('starts at the catalog when the account has installed nothing', () => {
    renderPanel('plugins');
    expect(screen.queryByRole('heading', { name: 'Installed' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Productivity' })).toBeTruthy();
  });

  it('renders a section notice when the surface supplies one', () => {
    renderPanel('plugins', {
      plugins: { entries: [], notice: 'Plugin marketplaces are not available yet.' },
    });
    expect(screen.getByText('Plugin marketplaces are not available yet.')).toBeTruthy();
  });

  it('offers a retry beside a notice that reports a failed catalog load', () => {
    const noticeRetry = vi.fn();
    renderPanel('plugins', {
      plugins: { entries: [], notice: 'The plugin catalog is unavailable right now.', noticeRetry },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(noticeRetry).toHaveBeenCalledTimes(1);
  });

  it('shows a plain notice without a retry control', () => {
    renderPanel('plugins', {
      plugins: { entries: [], notice: 'Plugin marketplaces are not available yet.' },
    });
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('asks the surface to load its section', () => {
    const loadSection = vi.fn();
    renderPanel('connectors', { loadSection });
    expect(loadSection).toHaveBeenCalledWith('connectors');
  });

  it('narrows every section by search', () => {
    renderPanel();
    fireEvent.change(screen.getByPlaceholderText('Search skills'), {
      target: { value: 'canvas' },
    });
    expect(screen.getByRole('button', { name: '/canvas-design' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '/my-skill' })).toBeNull();
  });

  it('narrows by a source chip', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Yours' }));
    expect(screen.queryByRole('button', { name: '/canvas-design' })).toBeNull();
  });

  it('offers the create control only where the section supports it', () => {
    const createEntry = vi.fn();
    renderPanel('skills', {
      createEntry,
      skills: {
        installable: true,
        entries: [],
        createLabel: 'New skill',
        sortOptions: ['name'],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'New skill' }));
    expect(createEntry).toHaveBeenCalledWith('skills');
  });

  it('hides the create control on a section with no create label', () => {
    renderPanel('plugins', { createEntry: vi.fn() });
    expect(screen.queryByRole('button', { name: 'New skill' })).toBeNull();
  });

  it('offers add marketplace on plugins only, and opens the dialog', async () => {
    const addMarketplace = vi.fn();
    renderPanel('skills', { addMarketplace });
    expect(screen.queryByRole('button', { name: 'Add marketplace' })).toBeNull();
    cleanup();
    renderPanel('plugins', { addMarketplace });
    fireEvent.click(screen.getByRole('button', { name: 'Add marketplace' }));
    expect(await screen.findByText('Add from a repository')).toBeTruthy();
  });

  it('renders header actions the surface supplies', () => {
    renderPanel('plugins', {}, { headerActions: <button type="button">Add</button> });
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy();
  });
});

describe('DirectoryPanel install consent', () => {
  it('installs straight away when the entry carries no notice', () => {
    const install = vi.fn();
    renderPanel('plugins', { install });
    fireEvent.click(screen.getByRole('button', { name: 'Install Productivity' }));
    expect(install).toHaveBeenCalledWith('plugins', 'productivity');
  });

  it('asks first when the surface says what installing does', async () => {
    const install = vi.fn();
    renderPanel('plugins', {
      install,
      plugins: {
        installable: true,
        entries: [
          {
            id: 'productivity',
            name: 'Productivity',
            description: 'Manage tasks',
            installNotice: "Installing adds this pack's skills to your account.",
          },
        ],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Install Productivity' }));
    expect(await screen.findByText('Install Productivity?')).toBeTruthy();
    expect(screen.getByText("Installing adds this pack's skills to your account.")).toBeTruthy();
    expect(install).not.toHaveBeenCalled();
  });

  it('installs once the notice is accepted', async () => {
    const install = vi.fn();
    renderPanel('plugins', {
      install,
      plugins: {
        installable: true,
        entries: [
          {
            id: 'productivity',
            name: 'Productivity',
            description: 'Manage tasks',
            installNotice: 'This pack reuses connectors you have already connected.',
          },
        ],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Install Productivity' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Install' }));
    await waitFor(() => expect(install).toHaveBeenCalledWith('plugins', 'productivity'));
  });

  it('does not install when the notice is cancelled', async () => {
    const install = vi.fn();
    renderPanel('plugins', {
      install,
      plugins: {
        installable: true,
        entries: [
          {
            id: 'productivity',
            name: 'Productivity',
            description: 'Manage tasks',
            installNotice: 'This pack declares no skills.',
          },
        ],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Install Productivity' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(install).not.toHaveBeenCalled();
  });
});

describe('DirectoryPanel detail', () => {
  it('opens the detail inline and returns with Back', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '/canvas-design' }));
    expect(await screen.findByRole('heading', { name: 'canvas-design' })).toBeTruthy();
    expect(screen.queryByPlaceholderText('Search skills')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByPlaceholderText('Search skills')).toBeTruthy();
  });

  it('reports the open entry so a surface can keep the settings hash in step', async () => {
    const onOpenEntryChange = vi.fn();
    renderPanel('skills', {}, { onOpenEntryChange });
    expect(onOpenEntryChange).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByRole('button', { name: '/canvas-design' }));
    await waitFor(() => expect(onOpenEntryChange).toHaveBeenLastCalledWith('canvas-design'));
  });

  it('does not repeat the connector name as its author or publisher', async () => {
    renderPanel(
      'connectors',
      {
        loadDetail: () =>
          Promise.resolve({
            ...DETAILS.connectors,
            publisher: 'Customerscore',
            authorName: 'Customerscore',
            name: 'Customerscore',
          } as DirectoryDetail),
      },
      { openEntryId: 'customerscore' },
    );
    expect(await screen.findByRole('heading', { name: 'Customerscore' })).toBeTruthy();
    expect(screen.queryByText(/Developed by Customerscore/)).toBeNull();
    expect(screen.queryByText('Author')).toBeNull();
  });

  it('opens the entry a deep link names', async () => {
    renderPanel('connectors', {}, { openEntryId: 'customerscore' });
    expect(await screen.findByRole('heading', { name: 'Customerscore' })).toBeTruthy();
  });

  it('offers Install on a skill the account removed and Uninstall once installed', async () => {
    const install = vi.fn();
    renderPanel('skills', { install });
    fireEvent.click(screen.getByRole('button', { name: '/canvas-design' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Install' }));
    await waitFor(() => expect(install).toHaveBeenCalledWith('skills', 'canvas-design'));
  });

  it('never says download for a skill', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '/canvas-design' }));
    await screen.findByRole('heading', { name: 'canvas-design' });
    expect(screen.queryByText(/Download/)).toBeNull();
  });

  it('surfaces a detail load failure', async () => {
    renderPanel('skills', { loadDetail: () => Promise.reject(new Error('Detail unavailable')) });
    fireEvent.click(screen.getByRole('button', { name: '/canvas-design' }));
    expect(await screen.findByText('Detail unavailable')).toBeTruthy();
  });
});

function remoteAdapter(patch: Partial<DirectoryAdapter> = {}): DirectoryAdapter {
  return makeAdapter({
    connectors: {
      installable: true,
      remote: true,
      entries: [
        { id: 'gmail', name: 'Gmail', description: 'Mail', popular: true },
        { id: 'customerscore', name: 'Customerscore', description: 'Customer health' },
      ],
      sources: [
        { id: 'all', label: 'All' },
        { id: 'first-party', label: 'Official' },
        { id: 'community', label: 'Community' },
      ],
      sortOptions: ['popular', 'name'],
      toggles: [{ id: 'include-local', label: 'Include desktop and CLI connectors' }],
      toggleDefaults: { 'include-local': false },
      countLabel: '2,368 connectors',
      total: 2_368,
      hasMore: true,
    },
    queryEntries: vi.fn(),
    loadMore: vi.fn(),
    ...patch,
  });
}

describe('DirectoryPanel plugins', () => {
  it('offers Uninstall on an installed plugin detail and routes it to the adapter', async () => {
    const uninstall = vi.fn();
    renderPanel(
      'plugins',
      {
        uninstall,
        loadDetail: () =>
          Promise.resolve({ ...DETAILS.plugins, installed: true } as DirectoryDetail),
      },
      { openEntryId: 'productivity' },
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Uninstall' }));
    await waitFor(() => expect(uninstall).toHaveBeenCalledWith('plugins', 'productivity'));
  });

  it('offers Uninstall, never a dead settings gear, on an installed plugin when the adapter edits skills', async () => {
    const uninstall = vi.fn();
    const openSettings = vi.fn();
    renderPanel(
      'plugins',
      {
        uninstall,
        openSettings,
        loadDetail: () =>
          Promise.resolve({ ...DETAILS.plugins, installed: true } as DirectoryDetail),
      },
      { openEntryId: 'productivity' },
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Uninstall' }));
    expect(screen.queryByRole('button', { name: 'Settings Productivity' })).toBeNull();
    await waitFor(() => expect(uninstall).toHaveBeenCalledWith('plugins', 'productivity'));
    expect(openSettings).not.toHaveBeenCalled();
  });

  it('tells the user when an install fails instead of failing silently', async () => {
    renderPanel(
      'plugins',
      {
        install: () => Promise.reject(new Error('Too many requests. Wait a minute and try again.')),
        loadDetail: () => Promise.resolve(DETAILS.plugins),
      },
      { openEntryId: 'productivity' },
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Install' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Too many requests. Wait a minute and try again.',
    );
    expect(screen.getByRole('button', { name: 'Install' })).toBeTruthy();
  });

  it('explains a plugin that cannot be installed from the web instead of offering Install', async () => {
    renderPanel(
      'plugins',
      {
        loadDetail: () =>
          Promise.resolve({
            ...DETAILS.plugins,
            installable: false,
            availabilityNote: 'Available on desktop and CLI',
          } as DirectoryDetail),
      },
      { openEntryId: 'productivity' },
    );
    expect(await screen.findByText('Available on desktop and CLI')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
  });
});

describe('DirectoryPanel connector detail actions', () => {
  it('offers Disconnect on a connected connector even when the adapter edits skills', async () => {
    const uninstall = vi.fn();
    renderPanel(
      'connectors',
      {
        uninstall,
        openSettings: vi.fn(),
        loadDetail: () =>
          Promise.resolve({ ...DETAILS.connectors, connected: true } as DirectoryDetail),
      },
      { openEntryId: 'customerscore' },
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));
    expect(screen.queryByRole('button', { name: 'Settings Customerscore' })).toBeNull();
    await waitFor(() => expect(uninstall).toHaveBeenCalledWith('connectors', 'customerscore'));
  });

  it('opens the editor from an authored skill detail instead of offering Uninstall', async () => {
    const openSettings = vi.fn();
    renderPanel(
      'skills',
      {
        openSettings,
        loadDetail: () =>
          Promise.resolve({
            ...DETAILS.skills,
            installed: true,
            editable: true,
          } as DirectoryDetail),
      },
      { openEntryId: 'canvas-design' },
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Settings canvas-design' }));
    expect(openSettings).toHaveBeenCalledWith('skills', 'canvas-design');
    expect(screen.queryByRole('button', { name: 'Uninstall' })).toBeNull();
  });
});

describe('DirectoryPanel connector credentials', () => {
  it('asks the adapter for credentials and renders the form it returns', async () => {
    const requestCredentials = vi.fn();
    const renderCredentialForm = vi.fn((section: DirectorySectionKey, id: string) =>
      section === 'connectors' && id === 'customerscore' ? (
        <form aria-label="API key form" />
      ) : null,
    );
    renderPanel(
      'connectors',
      {
        loadDetail: () =>
          Promise.resolve({
            ...DETAILS.connectors,
            connectableMode: 'api-key-form',
          } as DirectoryDetail),
        requestCredentials,
        renderCredentialForm,
      },
      { openEntryId: 'customerscore' },
    );
    await screen.findByRole('heading', { name: 'Customerscore' });
    expect(screen.getByRole('form', { name: 'API key form' })).toBeTruthy();
    expect(renderCredentialForm).toHaveBeenCalledWith('connectors', 'customerscore');
  });

  it('opens the detail with the form when an api key card is added from the grid', async () => {
    const requestCredentials = vi.fn();
    const install = vi.fn();
    renderPanel('connectors', {
      install,
      requestCredentials,
      connectors: {
        installable: true,
        entries: [
          {
            id: 'customerscore',
            name: 'Customerscore',
            description: 'Customer health',
            connectableMode: 'api-key-form',
          },
        ],
      },
      loadDetail: () =>
        Promise.resolve({
          ...DETAILS.connectors,
          connectableMode: 'api-key-form',
        } as DirectoryDetail),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add API key Customerscore' }));
    expect(requestCredentials).toHaveBeenCalledWith('connectors', 'customerscore');
    expect(install).not.toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: 'Customerscore' })).toBeTruthy();
  });

  it('hands the footer the loaded detail so the surface can gate what it renders', async () => {
    const renderDetailFooter = vi.fn(
      (_section: DirectorySectionKey, _id: string, detail: DirectoryDetail) =>
        detail.kind === 'connector' && (detail.tools?.length ?? 0) > 0 ? (
          <button type="button">Tool permissions</button>
        ) : null,
    );
    renderPanel('connectors', { renderDetailFooter }, { openEntryId: 'customerscore' });
    expect(await screen.findByRole('button', { name: 'Tool permissions' })).toBeTruthy();
    expect(renderDetailFooter).toHaveBeenCalledWith(
      'connectors',
      'customerscore',
      expect.objectContaining({ id: 'customerscore' }),
    );
  });

  it('opens a related connector from the detail and loads its own detail', async () => {
    const loadDetail = vi.fn((_section: DirectorySectionKey, id: string) =>
      Promise.resolve(
        id === 'customerscore'
          ? ({
              ...DETAILS.connectors,
              related: [{ id: 'segment', name: 'Segment', description: 'Customer data' }],
            } as DirectoryDetail)
          : ({
              ...DETAILS.connectors,
              id: 'segment',
              name: 'Segment',
              related: [],
            } as DirectoryDetail),
      ),
    );
    renderPanel('connectors', { loadDetail }, { openEntryId: 'customerscore' });
    fireEvent.click(await screen.findByRole('button', { name: 'Segment' }));
    expect(await screen.findByRole('heading', { name: 'Segment' })).toBeTruthy();
    expect(loadDetail).toHaveBeenLastCalledWith('connectors', 'segment');
  });

  it('reloads the open detail when the section entries change', async () => {
    const loadDetail = vi.fn(() => Promise.resolve(DETAILS.connectors));
    const adapter = makeAdapter({ loadDetail });
    const { rerender } = render(
      <DirectoryPanel section="connectors" adapter={adapter} openEntryId="customerscore" />,
    );
    await screen.findByRole('heading', { name: 'Customerscore' });
    expect(loadDetail).toHaveBeenCalledTimes(1);
    const refreshed = { ...adapter, connectors: { ...adapter.connectors!, entries: [] } };
    rerender(
      <DirectoryPanel section="connectors" adapter={refreshed} openEntryId="customerscore" />,
    );
    await waitFor(() => expect(loadDetail).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('heading', { name: 'Customerscore' })).toBeTruthy();
  });
});

describe('DirectoryPanel remote section', () => {
  it('asks the adapter for the first page instead of loading the section', async () => {
    const loadSection = vi.fn();
    const queryEntries = vi.fn();
    render(
      <DirectoryPanel
        section="connectors"
        adapter={remoteAdapter({ loadSection, queryEntries })}
      />,
    );
    await waitFor(() => expect(queryEntries).toHaveBeenCalledTimes(1));
    expect(loadSection).not.toHaveBeenCalled();
    const query = queryEntries.mock.calls[0]?.[1] as DirectoryQuery;
    expect(query).toMatchObject({
      search: '',
      sourceId: null,
      sort: 'popular',
      toggles: { 'include-local': false },
    });
  });

  it('sends a debounced search to the adapter rather than filtering locally', async () => {
    const queryEntries = vi.fn();
    render(<DirectoryPanel section="connectors" adapter={remoteAdapter({ queryEntries })} />);
    await waitFor(() => expect(queryEntries).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByPlaceholderText('Search connectors'), {
      target: { value: 'zzz' },
    });
    expect(screen.getByRole('button', { name: 'Gmail' })).toBeTruthy();
    await waitFor(() =>
      expect(queryEntries).toHaveBeenLastCalledWith(
        'connectors',
        expect.objectContaining({ search: 'zzz' }),
      ),
    );
    expect(queryEntries).toHaveBeenCalledTimes(2);
  });

  it('sends the badge tab, the sort and the toggle through the query', async () => {
    const queryEntries = vi.fn();
    render(<DirectoryPanel section="connectors" adapter={remoteAdapter({ queryEntries })} />);
    await waitFor(() => expect(queryEntries).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('tab', { name: 'Community' }));
    await waitFor(() =>
      expect(queryEntries).toHaveBeenLastCalledWith(
        'connectors',
        expect.objectContaining({ sourceId: 'community' }),
      ),
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Include desktop and CLI connectors' }));
    await waitFor(() =>
      expect(queryEntries).toHaveBeenLastCalledWith(
        'connectors',
        expect.objectContaining({ toggles: { 'include-local': true } }),
      ),
    );
  });

  it('shows the directory count from the toolbar and the page position', async () => {
    render(<DirectoryPanel section="connectors" adapter={remoteAdapter()} />);
    expect(screen.getByTestId('directory-count').textContent).toBe('2,368 connectors');
    expect(screen.getByTestId('directory-showing').textContent).toBe('Showing 2 of 2,368');
  });

  it('loads the next page from the Load more control until the total is reached', async () => {
    const loadMore = vi.fn();
    const { rerender } = render(
      <DirectoryPanel section="connectors" adapter={remoteAdapter({ loadMore })} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(loadMore).toHaveBeenCalledWith('connectors');
    const done = remoteAdapter({ loadMore });
    done.connectors = { ...done.connectors!, hasMore: false, total: 2 };
    rerender(<DirectoryPanel section="connectors" adapter={done} />);
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('disables Load more while the next page is in flight', () => {
    const adapter = remoteAdapter();
    adapter.connectors = { ...adapter.connectors!, loadingMore: true };
    render(<DirectoryPanel section="connectors" adapter={adapter} />);
    const control = screen.getByRole('button', { name: /Load more/ }) as HTMLButtonElement;
    expect(control.disabled).toBe(true);
  });
});

function pluginsAdapter(patch: Partial<DirectoryAdapter> = {}): DirectoryAdapter {
  return makeAdapter({
    plugins: {
      installable: true,
      remote: true,
      entries: [
        {
          id: 'data-pack',
          name: 'Data Pack',
          description: 'Data',
          groupId: 'builtin',
          installed: true,
          statusLabel: 'Installed',
        },
        {
          id: 'calendar-assistant',
          name: 'Calendar Assistant',
          description: 'Calendar',
          groupId: 'builtin',
          installable: false,
          statusLabel: 'Desktop and CLI',
        },
        {
          id: 'frontend-design',
          name: 'Frontend Design',
          description: 'Design',
          groupId: 'marketplace',
          statusLabel: 'Install',
        },
      ],
      groups: [
        { id: 'builtin', heading: 'Built-in packs' },
        { id: 'partner', heading: 'Partner plugins' },
        { id: 'marketplace', heading: 'Marketplace plugins' },
      ],
      sources: [
        { id: 'all', label: 'All' },
        { id: 'builtin', label: 'Built in' },
        { id: 'partner', label: 'Partners' },
        { id: 'marketplace', label: 'Marketplace' },
      ],
      filterGroups: [
        {
          id: 'works-with',
          label: 'Works with',
          exclusive: true,
          options: [
            { value: 'web', label: 'Web' },
            { value: 'claude-code', label: 'CLI' },
          ],
        },
      ],
      sortOptions: ['installs', 'name'],
      countLabel: '345 plugins',
      total: 345,
      hasMore: true,
    },
    queryEntries: vi.fn(),
    loadMore: vi.fn(),
    ...patch,
  });
}

describe('DirectoryPanel plugin groups', () => {
  it('lists Installed, then the declared groups in order, skipping empty ones', () => {
    render(<DirectoryPanel section="plugins" adapter={pluginsAdapter()} />);
    const headings = screen.getAllByRole('heading', { level: 3 }).map((node) => node.textContent);
    expect(headings).toEqual(['Installed', 'Built-in packs', 'Marketplace plugins']);
    expect(screen.queryByRole('heading', { name: 'All plugins' })).toBeNull();
    expect(screen.getByTestId('directory-count').textContent).toBe('345 plugins');
    expect(screen.getByTestId('directory-showing').textContent).toBe('Showing 3 of 345');
  });

  it('keeps the state line under each plugin card', () => {
    render(<DirectoryPanel section="plugins" adapter={pluginsAdapter()} />);
    expect(screen.getByText('Installed', { selector: 'p' })).toBeTruthy();
    expect(screen.getByText('Desktop and CLI')).toBeTruthy();
    expect(screen.getByText('Install', { selector: 'p' })).toBeTruthy();
  });

  it('starts from the installs sort and sends the facet tab through the query', async () => {
    const queryEntries = vi.fn();
    render(<DirectoryPanel section="plugins" adapter={pluginsAdapter({ queryEntries })} />);
    await waitFor(() => expect(queryEntries).toHaveBeenCalledTimes(1));
    expect(queryEntries.mock.calls[0]?.[1]).toMatchObject({ sort: 'installs', sourceId: null });
    fireEvent.click(screen.getByRole('tab', { name: 'Marketplace' }));
    await waitFor(() =>
      expect(queryEntries).toHaveBeenLastCalledWith(
        'plugins',
        expect.objectContaining({ sourceId: 'marketplace' }),
      ),
    );
  });

  it('keeps one works-with value at a time when the group is exclusive', async () => {
    const queryEntries = vi.fn();
    render(<DirectoryPanel section="plugins" adapter={pluginsAdapter({ queryEntries })} />);
    await waitFor(() => expect(queryEntries).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /Filter by/ }));
    fireEvent.click(await screen.findByText('Web'));
    await waitFor(() =>
      expect(queryEntries).toHaveBeenLastCalledWith(
        'plugins',
        expect.objectContaining({ selection: { 'works-with': ['web'] } }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: /Filter by/ }));
    fireEvent.click(await screen.findByText('CLI'));
    await waitFor(() =>
      expect(queryEntries).toHaveBeenLastCalledWith(
        'plugins',
        expect.objectContaining({ selection: { 'works-with': ['claude-code'] } }),
      ),
    );
  });

  it('loads the next marketplace page from Load more', () => {
    const loadMore = vi.fn();
    render(<DirectoryPanel section="plugins" adapter={pluginsAdapter({ loadMore })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(loadMore).toHaveBeenCalledWith('plugins');
  });

  it('shows a directory notice as a status line, never as an error', async () => {
    const install = vi.fn(() =>
      Promise.reject(
        new DirectoryActionNotice('Plugin installs are not enabled on this deployment yet'),
      ),
    );
    render(<DirectoryPanel section="plugins" adapter={pluginsAdapter({ install })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Install Frontend Design' }));
    expect((await screen.findByRole('status')).textContent).toBe(
      'Plugin installs are not enabled on this deployment yet',
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Install Frontend Design' })).toBeTruthy();
  });

  it('shows the plugin detail command with a copy control when the web cannot install it', async () => {
    const copyValue = vi.fn();
    render(
      <DirectoryPanel
        section="plugins"
        adapter={pluginsAdapter({
          copyValue,
          loadDetail: () =>
            Promise.resolve({
              ...DETAILS.plugins,
              id: 'superpowers',
              name: 'Superpowers',
              installable: false,
              availabilityNote: 'Desktop and CLI',
              runtimeNote: 'This plugin has not been inspected yet.',
              installCommand: 'claude plugin install superpowers@claude-plugins-official',
            } as DirectoryDetail),
        })}
        openEntryId="superpowers"
      />,
    );
    expect(await screen.findByText('This plugin has not been inspected yet.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy install command' }));
    expect(copyValue).toHaveBeenCalledWith(
      'claude plugin install superpowers@claude-plugins-official',
    );
  });
});

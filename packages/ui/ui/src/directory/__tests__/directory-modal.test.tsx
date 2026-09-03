import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DirectoryModal } from '../DirectoryModal';
import type { DirectoryAdapter, DirectoryDetail, DirectorySectionKey } from '../types';

afterEach(cleanup);

const DETAILS: Record<DirectorySectionKey, DirectoryDetail> = {
  skills: {
    kind: 'skill',
    id: 'canvas-design',
    name: 'canvas-design',
    publisher: 'AGI',
    description: 'Create visual art',
    license: 'Complete terms in LICENSE.txt',
    files: [
      { path: 'SKILL.md', content: 'First block\n\nSecond block' },
      { path: 'fonts/Bold.ttf', content: 'binary' },
    ],
  },
  connectors: {
    kind: 'connector',
    id: 'customerscore',
    name: 'Customerscore',
    summary: 'Customer health insights',
    description: 'Scores every customer',
    badge: 'community',
    tools: ['list_customers'],
    permissions: ['Read customers'],
  },
  plugins: {
    kind: 'plugin',
    id: 'productivity',
    name: 'Productivity',
    publisher: 'AGI',
    description: 'Manage tasks',
    sourceUrl: 'https://example.invalid/productivity',
    examplePrompts: ['Catch me up'],
  },
};

function makeAdapter(patch: Partial<DirectoryAdapter> = {}): DirectoryAdapter {
  return {
    sections: ['skills', 'connectors', 'plugins'],
    skills: {
      entries: [
        {
          id: 'canvas-design',
          name: 'canvas-design',
          slashName: true,
          description: 'Create visual art',
          sourceId: 'agi',
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
        { id: 'agi', label: 'AGI' },
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
      sortOptions: ['name', 'popular'],
      installable: false,
    },
    connectors: {
      entries: [{ id: 'customerscore', name: 'Customerscore', description: 'Customer health' }],
      sortOptions: ['name'],
      installable: true,
    },
    plugins: {
      entries: [{ id: 'productivity', name: 'Productivity', description: 'Manage tasks' }],
      sortOptions: ['name'],
      installable: true,
    },
    loadDetail: (section) => Promise.resolve(DETAILS[section]),
    ...patch,
  };
}

function renderModal(patch: Partial<DirectoryAdapter> = {}, props = {}) {
  const adapter = makeAdapter(patch);
  render(<DirectoryModal open onClose={vi.fn()} adapter={adapter} {...props} />);
  return adapter;
}

describe('DirectoryModal shell', () => {
  it('renders the title and a tablist of every section', () => {
    renderModal();
    expect(screen.getByText('Directory')).toBeTruthy();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Skills', 'Connectors', 'Plugins']);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
  });

  it('switches sections and swaps the search placeholder', () => {
    renderModal();
    fireEvent.click(screen.getByRole('tab', { name: 'Connectors' }));
    expect(screen.getByPlaceholderText('Search connectors')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Connectors' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('asks the surface to load each section it shows', () => {
    const loadSection = vi.fn();
    renderModal({ loadSection });
    expect(loadSection).toHaveBeenCalledWith('skills');
    fireEvent.click(screen.getByRole('tab', { name: 'Plugins' }));
    expect(loadSection).toHaveBeenCalledWith('plugins');
  });

  it('reports the route so a surface can keep a deep link in sync', () => {
    const onRouteChange = vi.fn();
    renderModal({}, { onRouteChange });
    expect(onRouteChange).toHaveBeenCalledWith('skills', null);
    fireEvent.click(screen.getByRole('tab', { name: 'Plugins' }));
    expect(onRouteChange).toHaveBeenLastCalledWith('plugins', null);
  });

  it('opens the section named by initialSection', () => {
    renderModal({}, { initialSection: 'plugins' });
    expect(screen.getByPlaceholderText('Search plugins')).toBeTruthy();
  });

  it('follows a new route while it is already open', () => {
    const adapter = makeAdapter();
    const { rerender } = render(
      <DirectoryModal open onClose={vi.fn()} adapter={adapter} initialSection="skills" />,
    );
    expect(screen.getByPlaceholderText('Search skills')).toBeTruthy();

    rerender(
      <DirectoryModal
        open
        onClose={vi.fn()}
        adapter={adapter}
        initialSection="connectors"
        initialEntryId="customerscore"
      />,
    );

    expect(screen.queryByPlaceholderText('Search skills')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Connectors' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('keeps the user on a tab they picked when the route prop repeats', () => {
    const adapter = makeAdapter();
    const { rerender } = render(
      <DirectoryModal open onClose={vi.fn()} adapter={adapter} initialSection="skills" />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Plugins' }));
    rerender(
      <DirectoryModal open onClose={vi.fn()} adapter={adapter} initialSection="skills" />,
    );
    expect(screen.getByPlaceholderText('Search plugins')).toBeTruthy();
  });

  it('narrows the grid by search', () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText('Search skills'), {
      target: { value: 'canvas' },
    });
    expect(screen.getByRole('button', { name: '/canvas-design' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '/my-skill' })).toBeNull();
  });

  it('narrows the grid by a source chip and clears it on a second press', () => {
    renderModal();
    const chip = screen.getByRole('button', { name: 'Yours' });
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('button', { name: '/canvas-design' })).toBeNull();
    fireEvent.click(chip);
    expect(screen.getByRole('button', { name: '/canvas-design' })).toBeTruthy();
  });

  it('narrows the grid from the filter menu', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Filter by/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Installed' }));
    expect(screen.getByRole('button', { name: '/my-skill' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '/canvas-design' })).toBeNull();
  });

  it('reorders the grid from the sort menu', async () => {
    renderModal({
      skills: {
        entries: [
          { id: 'a', name: 'Alpha', description: '', installCount: 10 },
          { id: 'b', name: 'Beta', description: '', installCount: 999 },
        ],
        sortOptions: ['name', 'popular'],
      },
    });
    const names = () =>
      screen
        .getAllByRole('button')
        .map((node) => node.textContent)
        .filter((text) => text === 'Alpha' || text === 'Beta');
    expect(names()).toEqual(['Alpha', 'Beta']);
    fireEvent.click(screen.getByRole('button', { name: /Sort by/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Most popular' }));
    expect(names()).toEqual(['Beta', 'Alpha']);
  });

  it('renders no card action for a section that installs nothing', () => {
    renderModal({ install: vi.fn(), openSettings: vi.fn() });
    expect(screen.queryByRole('button', { name: /^Add \/?canvas-design$/ })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Connectors' }));
    expect(screen.getByRole('button', { name: 'Add Customerscore' })).toBeTruthy();
  });

  it('offers no install control on a skill detail, since no route installs one', async () => {
    renderModal({ install: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: '/canvas-design' }));
    expect(await screen.findByRole('heading', { name: 'canvas-design' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
  });

  it('hides the add marketplace control unless the adapter supports it', () => {
    renderModal({}, { initialSection: 'plugins' });
    expect(screen.queryByRole('button', { name: 'Add marketplace' })).toBeNull();
  });

  it('shows the add marketplace control on plugins only', () => {
    const addMarketplace = vi.fn();
    renderModal({ addMarketplace }, { initialSection: 'skills' });
    expect(screen.queryByRole('button', { name: 'Add marketplace' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Plugins' }));
    expect(screen.getByRole('button', { name: 'Add marketplace' })).toBeTruthy();
  });
});

describe('DirectoryModal detail views', () => {
  it('opens the skill detail with its file tree, callouts and raw toggle', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: '/canvas-design' }));
    expect(await screen.findByRole('heading', { name: 'canvas-design' })).toBeTruthy();
    expect(screen.getByText('Create visual art')).toBeTruthy();
    expect(screen.getByText('Complete terms in LICENSE.txt')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'SKILL.md' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bold.ttf' })).toBeTruthy();
    expect(screen.getByText('First block')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Raw' }));
    expect(screen.getByText(/First block\s+Second block/)).toBeTruthy();
  });

  it('shows a selected skill file in place of the callouts', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: '/canvas-design' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Bold.ttf' }));
    expect(screen.getByText('fonts/Bold.ttf')).toBeTruthy();
    expect(screen.queryByText('Complete terms in LICENSE.txt')).toBeNull();
  });

  it('returns to the grid from the detail back link', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: '/canvas-design' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Back' }));
    expect(screen.getByPlaceholderText('Search skills')).toBeTruthy();
  });

  it('opens the connector detail with the community notice, tools and permissions', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('tab', { name: 'Connectors' }));
    fireEvent.click(screen.getByRole('button', { name: 'Customerscore' }));
    expect(await screen.findByRole('heading', { name: 'Customerscore' })).toBeTruthy();
    expect(screen.getByText(/Community connectors have passed automated checks only/)).toBeTruthy();
    expect(screen.getByText('list_customers')).toBeTruthy();
    expect(screen.getByText('Read customers')).toBeTruthy();
  });

  it('runs the connect action from the connector detail', async () => {
    const install = vi.fn();
    renderModal({ install });
    fireEvent.click(screen.getByRole('tab', { name: 'Connectors' }));
    fireEvent.click(screen.getByRole('button', { name: 'Customerscore' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(install).toHaveBeenCalledWith('connectors', 'customerscore'));
  });

  it('opens the plugin detail with its prompts and source link', async () => {
    const openHref = vi.fn();
    renderModal({ openHref });
    fireEvent.click(screen.getByRole('tab', { name: 'Plugins' }));
    fireEvent.click(screen.getByRole('button', { name: 'Productivity' }));
    expect(await screen.findByRole('heading', { name: 'Productivity' })).toBeTruthy();
    expect(screen.getByText('by AGI')).toBeTruthy();
    expect(screen.getByText('Catch me up')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /View source/ }));
    expect(openHref).toHaveBeenCalledWith('https://example.invalid/productivity');
  });

  it('surfaces a detail load failure instead of an empty pane', async () => {
    renderModal({ loadDetail: () => Promise.reject(new Error('Detail unavailable')) });
    fireEvent.click(screen.getByRole('button', { name: '/canvas-design' }));
    expect(await screen.findByText('Detail unavailable')).toBeTruthy();
  });
});

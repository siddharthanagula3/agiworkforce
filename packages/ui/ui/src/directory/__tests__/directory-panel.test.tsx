import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DirectoryPanel } from '../DirectoryPanel';
import type { DirectoryAdapter, DirectoryDetail, DirectorySectionKey } from '../types';

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
    sourceUrl: 'https://example.invalid/productivity',
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
    expect(screen.getByRole('button', { name: 'Made by AGI' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Filter by/ })).toBeTruthy();
  });

  it('splits owned items into an Installed section above the catalog', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: 'Installed' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'All skills' })).toBeTruthy();
  });

  it('names the connected section for connectors and leads with Popular', () => {
    renderPanel('connectors');
    expect(screen.getByRole('heading', { name: 'Popular' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'All connectors' })).toBeTruthy();
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
    fireEvent.click(screen.getByRole('button', { name: 'Yours' }));
    expect(screen.queryByRole('button', { name: '/canvas-design' })).toBeNull();
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
    fireEvent.click(screen.getByRole('button', { name: 'Add Productivity' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Add Productivity' }));
    expect(await screen.findByText('Install Productivity?')).toBeTruthy();
    expect(
      screen.getByText("Installing adds this pack's skills to your account."),
    ).toBeTruthy();
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
    fireEvent.click(screen.getByRole('button', { name: 'Add Productivity' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Add Productivity' }));
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

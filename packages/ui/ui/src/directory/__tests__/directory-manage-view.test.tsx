import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DirectoryPanel } from '../DirectoryPanel';
import type { DirectoryAdapter, DirectoryManageSection } from '../types';

afterEach(cleanup);

const ROWS = [
  {
    id: 'productivity',
    name: 'Productivity',
    author: 'AGI',
    skillCount: 3,
    updatedAt: '2026-09-04T00:00:00.000Z',
  },
  { id: 'reviewer', name: 'Reviewer', author: 'Team marketplace', skillCount: 1 },
];

function makeAdapter(
  manage: DirectoryManageSection,
  patch: Partial<DirectoryAdapter> = {},
): DirectoryAdapter {
  return {
    sections: ['plugins'],
    plugins: {
      installable: true,
      manage,
      entries: [{ id: 'productivity', name: 'Productivity', description: 'Manage tasks' }],
      sortOptions: ['name'],
    },
    loadDetail: () =>
      Promise.resolve({
        kind: 'plugin',
        id: 'productivity',
        name: 'Productivity',
        description: 'Manage tasks',
        examplePrompts: [],
      }),
    ...patch,
  };
}

function renderPlugins(manage: DirectoryManageSection, patch: Partial<DirectoryAdapter> = {}) {
  const adapter = makeAdapter(manage, patch);
  render(<DirectoryPanel section="plugins" adapter={adapter} />);
  return adapter;
}

describe('the plugins manage view', () => {
  it('lists the installed plugins in a table instead of the catalog', () => {
    renderPlugins({ rows: ROWS });
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Plugin' })).toBeTruthy();
    expect(within(table).getByRole('columnheader', { name: 'Author' })).toBeTruthy();
    expect(within(table).getByRole('columnheader', { name: 'Skills' })).toBeTruthy();
    expect(within(table).getByRole('columnheader', { name: 'Last updated' })).toBeTruthy();
    expect(within(table).getByRole('button', { name: 'Manage Productivity' })).toBeTruthy();
    expect(within(table).getByRole('button', { name: 'Manage Reviewer' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Filter by/ })).toBeNull();
  });

  it('repeats the trailing columns as a meta line for the phone layout', () => {
    renderPlugins({ rows: ROWS });
    const row = screen.getByRole('button', { name: 'Manage Reviewer' }).closest('td');
    expect(row?.querySelector('p')?.textContent).toBe(
      `Team marketplace ${String.fromCharCode(0xb7)} 1 skill`,
    );
    const first = screen.getByRole('button', { name: 'Manage Productivity' }).closest('td');
    expect(first?.querySelector('p')?.textContent).toContain(
      `AGI ${String.fromCharCode(0xb7)} 3 skills ${String.fromCharCode(0xb7)} `,
    );
  });

  it('filters the rows by the header search', () => {
    renderPlugins({ rows: ROWS });
    fireEvent.change(screen.getByPlaceholderText('Search plugins'), {
      target: { value: 'review' },
    });
    expect(screen.queryByRole('button', { name: 'Manage Productivity' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Manage Reviewer' })).toBeTruthy();
  });

  it('says so when the search matches no installed plugin', () => {
    renderPlugins({ rows: ROWS });
    fireEvent.change(screen.getByPlaceholderText('Search plugins'), {
      target: { value: 'nothing' },
    });
    expect(screen.getByText('Nothing here matches this search.')).toBeTruthy();
  });

  it('offers the catalog from the empty state and from Browse', () => {
    renderPlugins({ rows: [] });
    expect(screen.getByText('No plugins yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(screen.getByText('Manage tasks')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('No plugins yet')).toBeTruthy();
  });

  it('opens the catalog from Browse and returns to the table', () => {
    renderPlugins({ rows: ROWS });
    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Manage tasks')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('table')).toBeTruthy();
  });

  it('opens the plugin detail from a row', async () => {
    renderPlugins({ rows: ROWS });
    fireEvent.click(screen.getByRole('button', { name: 'Manage Productivity' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Productivity' })).toBeTruthy());
  });

  it('runs an adapter action from the Add menu', () => {
    const onSelect = vi.fn();
    renderPlugins({ rows: ROWS, actions: [{ id: 'create', label: 'Create with AGI', onSelect }] });
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Create with AGI' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('adds the marketplace entry to the Add menu when the adapter can sync one', () => {
    renderPlugins(
      { rows: ROWS, actions: [{ id: 'create', label: 'Create with AGI', onSelect: vi.fn() }] },
      { addMarketplace: vi.fn() },
    );
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Add marketplace',
      'Create with AGI',
    ]);
  });

  it('surfaces a load failure with its retry', () => {
    const retry = vi.fn();
    renderPlugins({ rows: [], error: 'Plugins could not be loaded.', retry });
    expect(screen.getByRole('alert').textContent).toBe('Plugins could not be loaded.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('keeps the catalog when a section supplies no manage view', () => {
    const adapter: DirectoryAdapter = {
      sections: ['connectors'],
      connectors: { entries: [{ id: 'gmail', name: 'Gmail', description: 'Mail' }] },
    };
    render(<DirectoryPanel section="connectors" adapter={adapter} />);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Connectors' })).toBeTruthy();
  });
});

describe('the Add menu offers what the account can actually do', () => {
  function openAddMenu() {
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));
    return screen.getByRole('menu');
  }

  it('orders the plugins menu the way the leader does', () => {
    renderPlugins(
      { rows: ROWS, actions: [{ id: 'compose', label: 'Create with AGI', onSelect: vi.fn() }] },
      {
        addMarketplace: vi.fn(),
        uploadPluginArchive: vi.fn(),
        createPlugin: vi.fn(),
      },
    );
    const items = within(openAddMenu())
      .getAllByRole('menuitem')
      .map((item) => item.textContent);
    expect(items).toEqual([
      'Add marketplace',
      'Upload plugin',
      'Create a plugin',
      'Create with AGI',
    ]);
  });

  it('leaves out an item the adapter cannot perform', () => {
    renderPlugins(
      { rows: ROWS, actions: [{ id: 'compose', label: 'Create with AGI', onSelect: vi.fn() }] },
      { addMarketplace: vi.fn() },
    );
    const items = within(openAddMenu())
      .getAllByRole('menuitem')
      .map((item) => item.textContent);
    expect(items).toEqual(['Add marketplace', 'Create with AGI']);
  });

  it('opens the upload dialog from the menu and closes it on cancel', async () => {
    renderPlugins({ rows: ROWS }, { uploadPluginArchive: vi.fn() });
    fireEvent.click(within(openAddMenu()).getByRole('menuitem', { name: 'Upload plugin' }));
    expect(await screen.findByLabelText('Choose file')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByLabelText('Choose file')).toBeNull());
  });

  it('opens the create dialog from the menu', async () => {
    renderPlugins({ rows: ROWS }, { createPlugin: vi.fn() });
    fireEvent.click(within(openAddMenu()).getByRole('menuitem', { name: 'Create a plugin' }));
    expect(await screen.findByLabelText('Skill name')).toBeTruthy();
  });

  it('reloads the plugins section when an upload dialog closes', async () => {
    const loadSection = vi.fn();
    renderPlugins({ rows: ROWS }, { uploadPluginArchive: vi.fn(), loadSection });
    fireEvent.click(within(openAddMenu()).getByRole('menuitem', { name: 'Upload plugin' }));
    await screen.findByLabelText('Choose file');
    loadSection.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(loadSection).toHaveBeenCalledWith('plugins'));
  });

  it('puts Upload skill after the ways to create one, and never on the plugins menu', () => {
    const adapter: DirectoryAdapter = {
      sections: ['skills'],
      skills: {
        installable: true,
        entries: [],
        manage: {
          rows: [{ id: 'summarise', name: 'summarise' }],
          actions: [{ id: 'create', label: 'Create a skill', onSelect: vi.fn() }],
        },
      },
      uploadSkillFile: vi.fn(),
      uploadPluginArchive: vi.fn(),
    };
    render(<DirectoryPanel section="skills" adapter={adapter} />);
    const items = within(openAddMenu())
      .getAllByRole('menuitem')
      .map((item) => item.textContent);
    expect(items).toEqual(['Create a skill', 'Upload skill']);
  });
});

describe('the skills list grouped like the leaders', () => {
  const groups = [
    { id: 'created', heading: 'Created by you' },
    { id: 'workspace', heading: 'From your workspace' },
    { id: 'plugins', heading: 'From plugins' },
    { id: 'agi', heading: 'From AGI Workforce' },
  ];
  const rows = [
    { id: 'mine', name: 'mine', slashName: true, author: 'You', groupId: 'created' },
    { id: 'team', name: 'team', slashName: true, author: 'Team pack', groupId: 'workspace' },
    { id: 'packed', name: 'packed', slashName: true, author: 'Pack', groupId: 'plugins' },
    { id: 'docx', name: 'docx', slashName: true, author: 'AGI', groupId: 'agi', enabled: true },
    { id: 'pdf', name: 'pdf', slashName: true, author: 'AGI', groupId: 'agi', enabled: false },
  ];

  function openAddMenu() {
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));
    return screen.getByRole('menu');
  }

  function renderSkills(patch: Partial<DirectoryAdapter> = {}) {
    const adapter: DirectoryAdapter = {
      sections: ['skills'],
      skills: { installable: true, entries: [], manage: { rows, groups } },
      loadDetail: vi.fn(() => Promise.resolve(null)),
      ...patch,
    };
    render(<DirectoryPanel section="skills" adapter={adapter} />);
    return adapter;
  }

  it('heads each group and skips the ones with nothing in them', () => {
    renderSkills();
    expect(screen.getAllByRole('table')).toHaveLength(4);
    expect(screen.getByRole('table', { name: 'Created by you' })).toBeTruthy();
    expect(
      within(screen.getByRole('table', { name: 'From AGI Workforce' })).getAllByRole('row'),
    ).toHaveLength(3);
  });

  it('turns a built-in skill on or off from its row without opening it', async () => {
    const setSkillEnabled = vi.fn(() => Promise.resolve());
    const adapter = renderSkills({ setSkillEnabled });
    fireEvent.click(screen.getByRole('switch', { name: 'Use /pdf' }));
    await waitFor(() => expect(setSkillEnabled).toHaveBeenCalledWith('pdf', true));
    expect(adapter.loadDetail).not.toHaveBeenCalled();
    expect(screen.getByRole('switch', { name: 'Use /docx' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.queryByRole('switch', { name: 'Use /mine' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Use /packed' })).toBeNull();
  });

  it('says why a switch did not take instead of failing silently', async () => {
    renderSkills({ setSkillEnabled: () => Promise.reject(new Error('That skill is locked.')) });
    fireEvent.click(screen.getByRole('switch', { name: 'Use /docx' }));
    expect((await screen.findByRole('alert')).textContent).toBe('That skill is locked.');
  });

  it('offers upload with the leader help text, the .skill type and the trust warning', () => {
    renderSkills({
      uploadSkillFile: vi.fn(),
      skills: {
        installable: true,
        entries: [],
        manage: { rows, groups, actions: [] },
      },
    });
    fireEvent.click(within(openAddMenu()).getByRole('menuitem', { name: 'Upload skill' }));
    expect(
      screen.getByText(
        'Zip the skill folder (named the same as the skill, with SKILL.md inside) and upload the .zip or .skill file.',
      ),
    ).toBeTruthy();
    expect(screen.getByTestId('upload-trust-notice').textContent).toBe(
      'Only add skills and plugins from sources you trust. Read the files first; a skill can include instructions or scripts that act on your data.',
    );
    expect(screen.getByLabelText('Choose file').getAttribute('accept')).toContain('.skill');
  });
});

describe('deleting a skill the account wrote', () => {
  it('names the skill and what is lost before anything is deleted', async () => {
    const deleteEntry = vi.fn(() => Promise.resolve());
    const adapter: DirectoryAdapter = {
      sections: ['skills'],
      skills: { installable: true, entries: [] },
      openEntry: { section: 'skills', entryId: 'mine' },
      loadDetail: () =>
        Promise.resolve({
          kind: 'skill',
          id: 'mine',
          name: 'mine',
          description: 'Mine',
          files: [{ path: 'SKILL.md', content: 'Do it.' }],
          editable: true,
          installed: true,
        }),
      openSettings: vi.fn(),
      deleteEntry,
    };
    render(<DirectoryPanel section="skills" adapter={adapter} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete skill' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Delete /mine?')).toBeTruthy();
    expect(dialog.textContent).toContain('cannot be recovered');
    expect(deleteEntry).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteEntry).toHaveBeenCalledWith('skills', 'mine'));
  });
});

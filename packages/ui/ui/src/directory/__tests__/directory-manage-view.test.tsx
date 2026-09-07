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
    fireEvent.click(screen.getByRole('button', { name: 'Install', exact: true }));
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

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { INSTALL_COUNT_FLOOR } from '../constants';
import { DirectoryGrid } from '../DirectoryGrid';
import type { DirectoryEntry } from '../types';

afterEach(cleanup);

const skill: DirectoryEntry = {
  id: 'canvas-design',
  name: 'canvas-design',
  slashName: true,
  publisher: 'AGI',
  description: 'Create visual art',
  installCount: 2_400_000,
};

function renderGrid(props: Partial<Parameters<typeof DirectoryGrid>[0]> = {}) {
  return render(<DirectoryGrid section="skills" entries={[skill]} onOpen={vi.fn()} {...props} />);
}

describe('DirectoryGrid', () => {
  it('renders a skill card with a slash name and a formatted count', () => {
    renderGrid();
    expect(screen.getByRole('button', { name: '/canvas-design' })).toBeTruthy();
    expect(screen.getByText('AGI')).toBeTruthy();
    expect(screen.getByText('2.4M')).toBeTruthy();
  });

  it('hides an install count below the floor', () => {
    renderGrid({ entries: [{ ...skill, installCount: INSTALL_COUNT_FLOOR - 1 }] });
    expect(screen.queryByText(String(INSTALL_COUNT_FLOOR - 1))).toBeNull();
  });

  it('renders an add control for an entry that is not installed', () => {
    const onInstall = vi.fn();
    renderGrid({ onInstall });
    fireEvent.click(screen.getByRole('button', { name: 'Add canvas-design' }));
    expect(onInstall).toHaveBeenCalledWith('canvas-design');
  });

  it('swaps the add control for a settings control once installed', () => {
    const onOpenSettings = vi.fn();
    const onInstall = vi.fn();
    renderGrid({ entries: [{ ...skill, installed: true }], onInstall, onOpenSettings });
    expect(screen.queryByRole('button', { name: 'Add canvas-design' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Settings canvas-design' }));
    expect(onOpenSettings).toHaveBeenCalledWith('canvas-design');
    expect(onInstall).not.toHaveBeenCalled();
  });

  it('disables the trailing control while a mutation is in flight', () => {
    renderGrid({ entries: [{ ...skill, mutating: true }], onInstall: vi.fn() });
    const control = screen.getByRole('button', { name: 'Add canvas-design' });
    expect((control as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders a per entry error', () => {
    renderGrid({ entries: [{ ...skill, error: 'Install failed' }] });
    expect(screen.getByText('Install failed')).toBeTruthy();
  });

  it('renders the empty state when nothing matches', () => {
    renderGrid({ entries: [] });
    expect(screen.getByText('No skills match this search.')).toBeTruthy();
  });

  it('renders a spinner while the first page loads', () => {
    renderGrid({ entries: [], loading: true });
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('renders an error with a retry control', () => {
    const onRetry = vi.fn();
    renderGrid({ entries: [], error: 'Directory unavailable', onRetry });
    expect(screen.getByText('Directory unavailable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('opens the detail view from the card name', () => {
    const onOpen = vi.fn();
    renderGrid({ onOpen });
    fireEvent.click(screen.getByRole('button', { name: '/canvas-design' }));
    expect(onOpen).toHaveBeenCalledWith('canvas-design');
  });

  it('renders the monogram fallback for an entry with no icon', () => {
    renderGrid({
      section: 'connectors',
      entries: [{ id: 'slack', name: 'Slack', description: 'Chat', monogram: 'SL' }],
    });
    expect(screen.getByText('SL')).toBeTruthy();
  });
});

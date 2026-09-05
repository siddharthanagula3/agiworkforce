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

  it('offers a remove control when installed with no settings pane', () => {
    const onRemove = vi.fn();
    renderGrid({ entries: [{ ...skill, installed: true }], onInstall: vi.fn(), onRemove });
    fireEvent.click(screen.getByRole('button', { name: 'Remove canvas-design' }));
    expect(onRemove).toHaveBeenCalledWith('canvas-design');
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

  it('offers no add control for an entry the surface cannot install', () => {
    renderGrid({ entries: [{ ...skill, installable: false }], onInstall: vi.fn() });
    expect(screen.queryByRole('button', { name: 'Add canvas-design' })).toBeNull();
  });

  it('renders a status label the surface supplies', () => {
    renderGrid({ entries: [{ ...skill, statusLabel: 'Needs setup by AGI' }] });
    expect(screen.getByText('Needs setup by AGI')).toBeTruthy();
  });

  it('does not repeat the name as the publisher line', () => {
    renderGrid({
      section: 'connectors',
      entries: [{ id: 'slack', name: 'Slack', description: 'Chat', publisher: 'Slack' }],
    });
    expect(screen.getAllByText('Slack')).toHaveLength(1);
  });

  it('renders a publisher that differs from the name', () => {
    renderGrid({
      section: 'connectors',
      entries: [
        { id: 'adobe', name: 'Adobe Creative Cloud', description: 'Art', publisher: 'Adobe' },
      ],
    });
    expect(screen.getByText('Adobe')).toBeTruthy();
  });

  it('keeps every logo tile on a light surface so a black mark stays visible', () => {
    renderGrid({
      section: 'connectors',
      entries: [
        { id: 'anthropic', name: 'Anthropic', description: 'Models', brandId: 'anthropic' },
      ],
    });
    const tile = document.querySelector('[aria-hidden="true"]');
    expect(tile?.className).toContain('bg-logo-surface');
    expect(tile?.className).toContain('text-logo-on-surface');
  });

  it('keeps the monogram readable on that same light tile', () => {
    renderGrid({
      section: 'connectors',
      entries: [{ id: 'x', name: 'Unknown', description: 'None', monogram: 'UN' }],
    });
    const tile = screen.getByText('UN');
    expect(tile.className).toContain('bg-logo-surface');
    expect(tile.className).not.toContain('text-muted-foreground');
  });

  it('renders a per entry error', () => {
    renderGrid({ entries: [{ ...skill, error: 'Install failed' }] });
    expect(screen.getByText('Install failed')).toBeTruthy();
  });

  it('renders the empty state when nothing matches', () => {
    renderGrid({ entries: [] });
    expect(screen.getByText('No skills match this search.')).toBeTruthy();
  });

  it('renders skeleton rows, not a spinner, while the first page loads', () => {
    renderGrid({ entries: [], loading: true });
    expect(screen.getByRole('status').textContent).toBe('Loading directory');
    expect(document.querySelector('.animate-pulse')).not.toBeNull();
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

  it('prefers the brand mark over the icon url and the monogram', () => {
    const { container } = renderGrid({
      section: 'connectors',
      entries: [
        {
          id: 'gmail',
          name: 'Gmail',
          description: 'Mail',
          brandId: 'gmail',
          iconUrl: 'https://cdn.invalid/gmail.png',
          monogram: 'GM',
        },
      ],
    });
    expect(container.querySelector('svg[aria-label="Gmail logo"]')).toBeTruthy();
    expect(container.querySelector('img[src="https://cdn.invalid/gmail.png"]')).toBeNull();
    expect(screen.queryByText('GM')).toBeNull();
  });

  it('falls back to the icon url when the entry names no brand', () => {
    const { container } = renderGrid({
      section: 'connectors',
      entries: [
        {
          id: 'customerscore',
          name: 'Customerscore',
          description: 'Health',
          iconUrl: 'https://cdn.invalid/icon.png',
          monogram: 'CU',
        },
      ],
    });
    expect(container.querySelector('img[src="https://cdn.invalid/icon.png"]')).toBeTruthy();
    expect(screen.queryByText('CU')).toBeNull();
  });

  it('falls back to the monogram when a named brand has no mark', () => {
    renderGrid({
      section: 'connectors',
      entries: [
        {
          id: 'nowhere',
          name: 'Nowhere',
          description: 'Nothing',
          brandId: 'nowhere',
          monogram: 'NW',
        },
      ],
    });
    expect(screen.getByText('NW')).toBeTruthy();
  });

  it('names the vendor under the connector name and drops the AGI badge', () => {
    renderGrid({
      section: 'connectors',
      entries: [
        {
          id: 'adobe',
          name: 'Adobe Creative Cloud',
          publisher: 'Adobe',
          description: 'Creative Cloud asset and font access.',
          badges: ['verified'],
        },
      ],
    });
    expect(screen.getByRole('button', { name: 'Adobe Creative Cloud' })).toBeTruthy();
    expect(screen.getByText('Adobe')).toBeTruthy();
    expect(screen.getByText('Verified')).toBeTruthy();
    expect(screen.queryByText('Made by AGI')).toBeNull();
  });
});

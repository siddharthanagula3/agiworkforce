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

  it('swaps the add control for a settings control once an editable skill is installed', () => {
    const onOpenSettings = vi.fn();
    const onInstall = vi.fn();
    renderGrid({
      entries: [{ ...skill, installed: true, editable: true }],
      onInstall,
      onOpenSettings,
    });
    expect(screen.queryByRole('button', { name: 'Add canvas-design' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Settings canvas-design' }));
    expect(onOpenSettings).toHaveBeenCalledWith('canvas-design');
    expect(onInstall).not.toHaveBeenCalled();
  });

  it('offers Remove, not Settings, for an installed skill the account cannot edit', () => {
    const onOpenSettings = vi.fn();
    const onRemove = vi.fn();
    renderGrid({ entries: [{ ...skill, installed: true }], onOpenSettings, onRemove });
    expect(screen.queryByRole('button', { name: 'Settings canvas-design' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove canvas-design' }));
    expect(onRemove).toHaveBeenCalledWith('canvas-design');
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

  it('lays the cards out in two columns from the small breakpoint', () => {
    const { container } = renderGrid({ section: 'connectors' });
    expect(container.querySelector('.grid')?.className).toContain('sm:grid-cols-2');
    expect(container.querySelector('.grid')?.className).toContain('grid-cols-1');
  });

  it('renders the connector state line under the description', () => {
    renderGrid({
      section: 'connectors',
      entries: [
        { id: 'slack', name: 'Slack', description: 'Chat', statusLabel: 'Desktop and CLI' },
      ],
    });
    expect(screen.getByText('Desktop and CLI')).toBeTruthy();
  });

  it('names the card action by connectable mode with a tooltip', () => {
    const onInstall = vi.fn();
    renderGrid({
      section: 'connectors',
      entries: [
        { id: 'slack', name: 'Slack', description: 'Chat', connectableMode: 'connect' },
        { id: 'stripe', name: 'Stripe', description: 'Pay', connectableMode: 'api-key-form' },
      ],
      onInstall,
    });
    const connect = screen.getByRole('button', { name: 'Connect Slack' });
    expect(connect.getAttribute('title')).toBe('Connect');
    const key = screen.getByRole('button', { name: 'Add API key Stripe' });
    expect(key.getAttribute('title')).toBe('Add API key');
    fireEvent.click(key);
    expect(onInstall).toHaveBeenCalledWith('stripe');
  });

  it('shows a green check instead of a control for a connected connector', () => {
    const onRemove = vi.fn();
    renderGrid({
      section: 'connectors',
      entries: [{ id: 'slack', name: 'Slack', description: 'Chat', installed: true }],
      onInstall: vi.fn(),
      onRemove,
    });
    expect(screen.getByRole('img', { name: 'Connected' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove Slack' })).toBeNull();
  });

  it('renders Official and Community as pills and Custom for user-added servers', () => {
    renderGrid({
      section: 'connectors',
      entries: [
        { id: 'a', name: 'Alpha', description: 'A', badges: ['official'] },
        { id: 'b', name: 'Beta', description: 'B', badges: ['community'] },
        { id: 'c', name: 'Gamma', description: 'C', badges: ['custom'] },
      ],
    });
    expect(screen.getByText('Official')).toBeTruthy();
    expect(screen.getByText('Community')).toBeTruthy();
    expect(screen.getByText('Custom')).toBeTruthy();
  });

  it('renders First-party as a pill from the same label map', () => {
    renderGrid({
      section: 'connectors',
      entries: [{ id: 'gmail', name: 'Gmail', description: 'Mail', badges: ['first-party'] }],
    });
    expect(screen.getByText('First-party')).toBeTruthy();
  });

  it('gives a long community name the whole row and moves the pill below it', () => {
    const onInstall = vi.fn();
    renderGrid({
      section: 'connectors',
      entries: [
        {
          id: 'ai-craftsman',
          name: 'AI Craftsman Workshop Assistant',
          publisher: 'Craft Labs',
          description: 'Build things',
          badges: ['community'],
          connectableMode: 'connect',
        },
      ],
      onInstall,
    });
    const name = screen.getByRole('button', { name: 'AI Craftsman Workshop Assistant' });
    expect(name.className).toContain('line-clamp-2');
    expect(name.className).not.toContain('truncate');
    const pill = screen.getByText('Community');
    expect(name.parentElement?.contains(pill)).toBe(false);
    expect(pill.parentElement?.contains(screen.getByText('Craft Labs'))).toBe(true);
    const control = screen.getByRole('button', { name: 'Connect AI Craftsman Workshop Assistant' });
    expect(control.parentElement).toBe(name.parentElement?.parentElement?.parentElement);
  });

  it('keeps the verified glyph beside the name', () => {
    renderGrid({
      section: 'connectors',
      entries: [{ id: 'gmail', name: 'Gmail', description: 'Mail', badges: ['verified'] }],
    });
    const name = screen.getByRole('button', { name: 'Gmail' });
    expect(name.parentElement?.contains(screen.getByRole('img', { name: 'Verified' }))).toBe(true);
  });

  it('falls back to the monogram when the icon fails to load', () => {
    const { container } = renderGrid({
      section: 'connectors',
      entries: [{ id: 'x', name: 'Xylo', description: 'X', iconUrl: '/icon?id=x', monogram: 'XY' }],
    });
    const img = container.querySelector('img[src="/icon?id=x"]');
    expect(img).toBeTruthy();
    fireEvent.error(img as Element);
    expect(container.querySelector('img[src="/icon?id=x"]')).toBeNull();
    expect(screen.getByText('XY')).toBeTruthy();
  });

  it('labels a plugin card Install and Uninstall with a tooltip', () => {
    const onInstall = vi.fn();
    const onRemove = vi.fn();
    renderGrid({
      section: 'plugins',
      entries: [
        { id: 'frontend-design', name: 'Frontend Design', description: 'Design' },
        { id: 'superpowers', name: 'Superpowers', description: 'Skills', installed: true },
      ],
      onInstall,
      onRemove,
    });
    const install = screen.getByRole('button', { name: 'Install Frontend Design' });
    expect(install.getAttribute('title')).toBe('Install');
    fireEvent.click(install);
    expect(onInstall).toHaveBeenCalledWith('frontend-design');
    const uninstall = screen.getByRole('button', { name: 'Uninstall Superpowers' });
    expect(uninstall.getAttribute('title')).toBe('Uninstall');
    fireEvent.click(uninstall);
    expect(onRemove).toHaveBeenCalledWith('superpowers');
  });

  it('writes a plugin install count as a sentence with the publisher and verified glyph', () => {
    renderGrid({
      section: 'plugins',
      entries: [
        {
          id: 'frontend-design',
          name: 'Frontend Design',
          publisher: 'Anthropic',
          description: 'Design',
          badges: ['verified'],
          installCount: 1_134_112,
          statusLabel: 'Desktop and CLI',
          installable: false,
        },
      ],
      onInstall: vi.fn(),
    });
    expect(screen.getByText('Anthropic')).toBeTruthy();
    expect(screen.getByText('1.1M')).toBeTruthy();
    expect(screen.getByText('installs')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Verified' })).toBeTruthy();
    expect(screen.getByText('Desktop and CLI')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Install Frontend Design' })).toBeNull();
    expect(document.querySelector('.lucide-download')).toBeNull();
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
    expect(screen.getByRole('img', { name: 'Verified' })).toBeTruthy();
    expect(screen.queryByText('Verified')).toBeNull();
    expect(screen.queryByText('Made by AGI')).toBeNull();
  });
});

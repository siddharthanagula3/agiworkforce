import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SettingsModal } from '../SettingsModal';
import { SETTINGS_NAV_GROUPS_WEB } from '../../settings-nav';
import type { SettingsDataAdapter, SettingsPlugin } from '../types';

/**
 * UI-74/WEB-53: disconnecting a connector is destructive and must go through
 * the same confirm step as plugin removal. The settings modal is the surface
 * signed-in users actually reach, so a missing confirm here is the real gap.
 */
function renderConnectorDetail() {
  const disconnectConnector = vi.fn();
  render(
    <SettingsModal
      open
      onClose={vi.fn()}
      activeSection="connectors"
      onSectionChange={vi.fn()}
      sectionContent={{}}
      navGroups={SETTINGS_NAV_GROUPS_WEB}
      adapter={{
        connectors: [
          {
            id: 'github',
            name: 'GitHub',
            description: 'Repositories, issues and pull requests.',
            category: 'Developer',
            authType: 'oauth',
            actionCount: 0,
            phase: 1,
            iconBg: 'from-slate-500 to-slate-700',
            iconText: 'GH',
            canConnect: true,
          },
        ],
        connectedConnectors: [{ connectorId: 'github', status: 'connected' }],
        connectConnector: vi.fn(),
        disconnectConnector,
      }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'GitHub' }));
  return { disconnectConnector };
}

describe('connector disconnect confirmation', () => {
  it('does not disconnect until the confirm dialog is accepted', async () => {
    const { disconnectConnector } = renderConnectorDetail();

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(disconnectConnector).not.toHaveBeenCalled();

    const dialog = screen.getByRole('alertdialog', { name: 'Disconnect GitHub?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disconnect' }));

    await waitFor(() => expect(disconnectConnector).toHaveBeenCalledWith('github'));
  });

  it('cancels without disconnecting', () => {
    const { disconnectConnector } = renderConnectorDetail();

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Disconnect GitHub?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(disconnectConnector).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog', { name: 'Disconnect GitHub?' })).toBeNull();
  });
});

const INSTALLED_PLUGIN: SettingsPlugin = {
  id: 'research-pack',
  name: 'Research Pack',
  description: 'A reviewed research workflow.',
  enabled: true,
  installed: true,
};

function renderPlugins(adapterOverrides: Partial<SettingsDataAdapter>) {
  const removePlugin = vi.fn();
  render(
    <SettingsModal
      open
      onClose={vi.fn()}
      activeSection="plugins"
      onSectionChange={vi.fn()}
      sectionContent={{}}
      navGroups={SETTINGS_NAV_GROUPS_WEB}
      adapter={{ removePlugin, ...adapterOverrides }}
    />,
  );
  return { removePlugin };
}

describe('plugin removal confirmation', () => {
  it('confirms before removing from the plugins table', async () => {
    const { removePlugin } = renderPlugins({ plugins: [INSTALLED_PLUGIN] });

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(removePlugin).not.toHaveBeenCalled();

    const dialog = screen.getByRole('alertdialog', { name: 'Remove plugin?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(removePlugin).toHaveBeenCalledWith('research-pack'));
  });

  it('confirms before removing from the directory browse view', async () => {
    const { removePlugin } = renderPlugins({
      plugins: [],
      pluginCatalog: [INSTALLED_PLUGIN],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(removePlugin).not.toHaveBeenCalled();

    const dialog = screen.getByRole('alertdialog', { name: 'Remove plugin?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(removePlugin).toHaveBeenCalledWith('research-pack'));
  });
});

const DESTRUCTIVE_ACTION_PANELS = [
  'DirectoryBrowse',
  'ConnectorsPanel',
  'SkillsPanel',
  'PluginsPanel',
] as const;

function topLevelFunctionSpans(source: string): Array<{ name: string; body: string }> {
  const starts = [...source.matchAll(/^(?:export )?function ([A-Za-z0-9_]+)/gmu)];
  return starts.map((match, index) => {
    const name = match[1] as string;
    const start = match.index as number;
    const next = starts[index + 1];
    const end = next ? (next.index as number) : source.length;
    return { name, body: source.slice(start, end) };
  });
}

describe('confirm primitive ownership', () => {
  const source = readFileSync(path.join(__dirname, '..', 'SettingsModal.tsx'), 'utf8');

  it('borrows the package-shared useConfirm instead of declaring its own', () => {
    expect(source).toContain("import { useConfirm } from '../primitives/ConfirmDialog';");
    expect(source).not.toMatch(/function\s+useConfirm\s*\(/u);
  });

  it('routes every destructive action in the modal through that one hook', () => {
    const spans = topLevelFunctionSpans(source);
    const panelsUsingConfirm = spans
      .filter((span) => (span.body.match(/useConfirm\(\)/gu) ?? []).length > 0)
      .map((span) => span.name)
      .sort();

    expect(
      panelsUsingConfirm,
      'a destructive action must live in one of the named panels, routed through useConfirm()',
    ).toEqual([...DESTRUCTIVE_ACTION_PANELS].sort());

    const totalHookUses = source.match(/useConfirm\(\)/gu) ?? [];
    expect(
      totalHookUses.length,
      'a new destructive action must reuse an existing panel call, not add a call site',
    ).toBe(DESTRUCTIVE_ACTION_PANELS.length);

    expect(source).not.toMatch(/window\.confirm/u);
  });
});

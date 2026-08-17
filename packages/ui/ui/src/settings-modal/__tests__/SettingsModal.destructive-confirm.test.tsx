import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
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
  it('does not disconnect until the confirm dialog is accepted', () => {
    const { disconnectConnector } = renderConnectorDetail();

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(disconnectConnector).not.toHaveBeenCalled();

    const dialog = screen.getByRole('dialog', { name: 'Disconnect GitHub?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disconnect' }));

    expect(disconnectConnector).toHaveBeenCalledWith('github');
  });

  it('cancels without disconnecting', () => {
    const { disconnectConnector } = renderConnectorDetail();

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

    const dialog = screen.getByRole('dialog', { name: 'Disconnect GitHub?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(disconnectConnector).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Disconnect GitHub?' })).toBeNull();
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
  it('confirms before removing from the plugins table', () => {
    const { removePlugin } = renderPlugins({ plugins: [INSTALLED_PLUGIN] });

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(removePlugin).not.toHaveBeenCalled();

    const dialog = screen.getByRole('dialog', { name: 'Remove plugin?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(removePlugin).toHaveBeenCalledWith('research-pack');
  });

  it('confirms before removing from the directory browse view', () => {
    const { removePlugin } = renderPlugins({
      plugins: [],
      pluginCatalog: [INSTALLED_PLUGIN],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(removePlugin).not.toHaveBeenCalled();

    const dialog = screen.getByRole('dialog', { name: 'Remove plugin?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(removePlugin).toHaveBeenCalledWith('research-pack');
  });
});

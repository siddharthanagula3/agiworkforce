import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SettingsModal } from '../SettingsModal';
import { SETTINGS_NAV_GROUPS_WEB } from '../../settings-nav';
import type { SettingsDataAdapter } from '../types';

/**
 * WEB-31: installing a plugin pack grants its skills and reuses the connectors
 * it declares. Install must state that grant and be accepted before the
 * install call is made.
 */

function renderPluginDirectory(adapterOverrides: Partial<SettingsDataAdapter> = {}) {
  const installPlugin = vi.fn();
  render(
    <SettingsModal
      open
      onClose={vi.fn()}
      activeSection="plugins"
      onSectionChange={vi.fn()}
      sectionContent={{}}
      navGroups={SETTINGS_NAV_GROUPS_WEB}
      adapter={{
        plugins: [],
        pluginCatalog: [
          {
            id: 'research-pack',
            name: 'Research Pack',
            description: 'A reviewed research workflow.',
            enabled: false,
            installed: false,
            installable: true,
            author: 'AGI Workforce',
            skillCount: 2,
            declaredSkills: ['Deep research', 'Source triage'],
            requiredConnectors: ['github', 'notion'],
          },
        ],
        installPlugin,
        removePlugin: vi.fn(),
        ...adapterOverrides,
      }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
  return { installPlugin };
}

describe('plugin install consent', () => {
  it('does not install until the consent dialog is accepted', () => {
    const { installPlugin } = renderPluginDirectory();

    const card = screen.getByText('Research Pack').closest('div')!.parentElement!.parentElement!;
    fireEvent.click(within(card).getByRole('button', { name: 'Install' }));

    expect(installPlugin).not.toHaveBeenCalled();

    const dialog = screen.getByRole('dialog', { name: 'Install Research Pack?' });
    expect(within(dialog).getByText('Deep research')).toBeTruthy();
    expect(within(dialog).getByText('Source triage')).toBeTruthy();
    expect(within(dialog).getByText('github')).toBeTruthy();
    expect(within(dialog).getByText('notion')).toBeTruthy();
    expect(dialog.textContent).toContain('AGI Workforce');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Install' }));
    expect(installPlugin).toHaveBeenCalledWith('research-pack');
  });

  it('cancels without installing', () => {
    const { installPlugin } = renderPluginDirectory();

    const card = screen.getByText('Research Pack').closest('div')!.parentElement!.parentElement!;
    fireEvent.click(within(card).getByRole('button', { name: 'Install' }));

    const dialog = screen.getByRole('dialog', { name: 'Install Research Pack?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(installPlugin).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Install Research Pack?' })).toBeNull();
  });

  it('says plainly when a pack needs no connectors', () => {
    renderPluginDirectory({
      pluginCatalog: [
        {
          id: 'offline-pack',
          name: 'Offline Pack',
          description: 'No external access.',
          enabled: false,
          installed: false,
          installable: true,
          declaredSkills: ['Summarize'],
          requiredConnectors: [],
        },
      ],
    });

    const card = screen.getByText('Offline Pack').closest('div')!.parentElement!.parentElement!;
    fireEvent.click(within(card).getByRole('button', { name: 'Install' }));

    const dialog = screen.getByRole('dialog', { name: 'Install Offline Pack?' });
    expect(dialog.textContent).toContain('grants no new data access');
  });
});

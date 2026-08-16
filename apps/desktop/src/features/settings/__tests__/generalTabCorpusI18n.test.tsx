import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/tauri-mock', () => ({
  isTauri: true,
  isCloudWeb: false,
  isDesktopUiDevLocal: false,
  invoke: vi.fn(async () => undefined),
}));

vi.mock('@agiworkforce/desktop-command-client', () => ({
  window: {
    windowGetState: vi.fn(async () => ({ keepInMenuBar: true })),
    windowSetMenuBarMode: vi.fn(async () => undefined),
  },
}));

vi.mock('@/features/resource-monitor', () => ({ ResourceMonitor: () => <div /> }));
vi.mock('../../AutomationPermissionsSettings', () => ({
  AutomationPermissionsSettings: () => <div />,
}));
vi.mock('../../UpdateSettings', () => ({ UpdateSettings: () => <div /> }));
vi.mock('../../KeybindingsSettings', () => ({ KeybindingsSettings: () => <div /> }));
vi.mock('../../NetworkProxySettings', () => ({ NetworkProxySettings: () => <div /> }));

import i18n from '../../../i18n';
import { GeneralTab } from '../tabs/General';
import { AllowedDirectoriesSettings } from '../AllowedDirectoriesSettings';

function renderGeneralTab() {
  return render(
    <GeneralTab
      resolvedWindowPreferences={{ theme: 'system', language: 'es' }}
      resolvedGlobalHotkeyPreferences={{ enabled: false, combo: 'CommandOrControl+Shift+A' }}
      defaultGlobalHotkeyCombo="CommandOrControl+Shift+A"
      onThemeChange={vi.fn()}
      onLanguageChange={vi.fn()}
      onGlobalHotkeyEnabledChange={vi.fn()}
      onGlobalHotkeyComboChange={vi.fn()}
    />,
  );
}

describe('General settings tab renders the shared translation corpus', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage('en');
  });

  it('labels the theme and language controls in the active locale', async () => {
    await i18n.changeLanguage('es');
    renderGeneralTab();

    expect(screen.getByText('Tema')).toBeInTheDocument();
    expect(screen.getByText('Idioma')).toBeInTheDocument();
    expect(screen.queryByText('Theme')).not.toBeInTheDocument();
    expect(screen.queryByText('Language')).not.toBeInTheDocument();
  });

  it('resolves the English wording rather than a raw key name', () => {
    renderGeneralTab();

    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(screen.getByText('Language')).toBeInTheDocument();
  });
});

describe('Allowed directories settings renders the shared translation corpus', () => {
  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage('en');
  });

  it('translates the section heading and its add/remove actions', async () => {
    await i18n.changeLanguage('es');
    render(<AllowedDirectoriesSettings />);

    expect(screen.getByText('Directorios Permitidos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar' })).toBeInTheDocument();
    expect(screen.queryByText('Allowed Directories')).not.toBeInTheDocument();
  });
});

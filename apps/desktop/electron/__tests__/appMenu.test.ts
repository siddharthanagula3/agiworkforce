import { describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import { HOST_COMMANDS } from '@agiworkforce/local-runtime-contract';

vi.mock('electron', () => ({
  Menu: { buildFromTemplate: vi.fn((template: unknown) => template), setApplicationMenu: vi.fn() },
  app: { name: 'AGI Cloud', isPackaged: true },
}));
vi.mock('../launchAtLogin', () => ({
  isLaunchAtLoginEnabled: () => false,
  setLaunchAtLogin: vi.fn(),
}));

const { appMenuTemplate } = await import('../appMenu');

function actions() {
  return {
    newChat: vi.fn(),
    toggleQuickAsk: vi.fn(),
    captureScreenshot: vi.fn(),
    openSettings: vi.fn(),
    openLogs: vi.fn(),
    openSupport: vi.fn(),
    checkForUpdates: vi.fn(),
    sendHostCommand: vi.fn(),
    goBack: vi.fn(),
    goForward: vi.fn(),
    setZoomLevel: vi.fn(),
    stepZoomLevel: vi.fn(),
  };
}

const ACCELERATORS = { quickAsk: 'Alt+Shift+Space', screenshot: 'CommandOrControl+Shift+2' };

function template(overrides = actions()) {
  return { menu: appMenuTemplate(overrides, ACCELERATORS), actions: overrides };
}

function submenu(menu: MenuItemConstructorOptions[], label: string): MenuItemConstructorOptions[] {
  const found = menu.find((entry) => entry.label === label || entry.role === label.toLowerCase());
  return (found?.submenu as MenuItemConstructorOptions[] | undefined) ?? [];
}

function item(
  menu: MenuItemConstructorOptions[],
  menuLabel: string,
  itemLabel: string,
): MenuItemConstructorOptions {
  const found = submenu(menu, menuLabel).find((entry) => entry.label === itemLabel);
  if (!found) throw new Error(`${menuLabel} has no item labelled ${itemLabel}`);
  return found;
}

describe('the application menu', () => {
  it('carries the menus a desktop app is expected to have', () => {
    const { menu } = template();
    const labels = menu.map((entry) => entry.label ?? entry.role);

    expect(labels).toEqual(expect.arrayContaining(['File', 'Edit', 'View', 'History', 'Window']));
    expect(menu.some((entry) => entry.role === 'help')).toBe(true);
  });

  it('shows the configured Quick Ask and Screenshot chords without claiming them', () => {
    const { menu } = template();

    for (const [label, accelerator] of [
      ['Quick Ask', ACCELERATORS.quickAsk],
      ['Screenshot to Chat', ACCELERATORS.screenshot],
    ] as const) {
      const entry = item(menu, 'File', label);
      expect(entry.accelerator, label).toBe(accelerator);
      // A global shortcut already owns this chord; registering it here too
      // would fire the action twice or take it away from the global one.
      expect(entry.registerAccelerator, label).toBe(false);
    }
  });

  it('shows the page bindings for the two actions the page owns, without claiming them', () => {
    const { menu } = template();
    const toggle = item(menu, 'View', 'Toggle Sidebar');
    const shortcuts = submenu(menu, 'Help').find((entry) => entry.label === 'Keyboard Shortcuts');

    expect(toggle.accelerator).toBe('CommandOrControl+B');
    expect(toggle.registerAccelerator).toBe(false);
    expect(shortcuts?.accelerator).toBe('CommandOrControl+/');
    expect(shortcuts?.registerAccelerator).toBe(false);
  });

  it('sends each page-owned item as a command the contract names', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'View', 'Toggle Sidebar').click as () => void)();
    (
      submenu(menu, 'Help').find((entry) => entry.label === 'Keyboard Shortcuts')
        ?.click as () => void
    )();

    const sent = spies.sendHostCommand.mock.calls.map(([command]) => command);
    expect(sent).toEqual(['toggle-sidebar', 'show-keyboard-shortcuts']);
    for (const command of sent) {
      expect(HOST_COMMANDS).toContain(command);
    }
  });

  it('drives zoom by steps and resets to actual size', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'View', 'Zoom In').click as () => void)();
    (item(menu, 'View', 'Zoom Out').click as () => void)();
    (item(menu, 'View', 'Actual Size').click as () => void)();

    expect(spies.stepZoomLevel.mock.calls).toEqual([[1], [-1]]);
    expect(spies.setZoomLevel).toHaveBeenCalledWith(0);
  });

  it('moves through history from the History menu', () => {
    const { menu, actions: spies } = template();

    expect(item(menu, 'History', 'Back').accelerator).toBe('CmdOrCtrl+[');
    expect(item(menu, 'History', 'Forward').accelerator).toBe('CmdOrCtrl+]');

    (item(menu, 'History', 'Back').click as () => void)();
    (item(menu, 'History', 'Forward').click as () => void)();

    expect(spies.goBack).toHaveBeenCalledTimes(1);
    expect(spies.goForward).toHaveBeenCalledTimes(1);
  });

  it('keeps the help items wired to something', () => {
    const { menu, actions: spies } = template();
    const help = submenu(menu, 'Help');

    for (const label of ['AGI Workforce Support', 'Open Logs', 'Check for Updates']) {
      const entry = help.find((candidate) => candidate.label === label);
      expect(entry, label).toBeDefined();
      (entry?.click as () => void)();
    }

    expect(spies.openSupport).toHaveBeenCalledTimes(1);
    expect(spies.openLogs).toHaveBeenCalledTimes(1);
    expect(spies.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('leaves no item without an action', () => {
    const { menu } = template();

    for (const entry of menu) {
      for (const child of (entry.submenu as MenuItemConstructorOptions[] | undefined) ?? []) {
        if (child.type === 'separator' || child.role) continue;
        expect(typeof child.click, `${entry.label} > ${child.label}`).toBe('function');
      }
    }
  });
});

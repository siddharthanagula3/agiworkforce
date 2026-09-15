import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HOST_MENU_SHORTCUTS,
  NO_HOST_SHORTCUT,
  type HostBridge,
  type HostPreferencesState,
} from '@agiworkforce/local-runtime-contract';
import { useHostShortcuts } from '../hooks/use-host-shortcuts';

function preferences(overrides: Partial<HostPreferencesState['preferences']> = {}) {
  return {
    preferences: {
      launchAtLogin: false,
      showInMenuBar: true,
      cliPath: '',
      quickAskShortcut: 'Alt+Space',
      screenshotShortcut: 'CommandOrControl+Shift+2',
      voiceShortcut: NO_HOST_SHORTCUT,
      ...overrides,
    },
    shortcutStatus: { quickAsk: 'registered', screenshot: 'registered', voice: 'off' },
  } as HostPreferencesState;
}

function installHost(bridge: Partial<HostBridge> | null) {
  if (bridge === null) {
    Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'agiHost');
    return;
  }
  Object.defineProperty(window, 'agiHost', {
    value: {
      platform: 'electron-darwin',
      appVersion: '1.2.0',
      readPreferences: () => Promise.resolve(preferences()),
      ...bridge,
    },
    configurable: true,
    writable: true,
  });
}

function Harness() {
  const rows = useHostShortcuts();
  return (
    <ul>
      {rows.map((row) => (
        <li key={row.id} data-testid={row.id}>
          {row.description} {row.chord}
        </li>
      ))}
    </ul>
  );
}

afterEach(() => {
  installHost(null);
  vi.restoreAllMocks();
});

describe('useHostShortcuts', () => {
  it('says nothing in a browser, so the web sheet is unchanged', () => {
    installHost(null);
    render(<Harness />);

    expect(screen.queryByTestId('host-new-chat')).toBeNull();
  });

  it('renders every chord the shell menu claims, in macOS symbols', async () => {
    installHost({});
    render(<Harness />);

    for (const shortcut of HOST_MENU_SHORTCUTS) {
      expect(await screen.findByTestId(shortcut.id)).toBeTruthy();
    }
    expect(screen.getByTestId('host-new-chat').textContent).toBe('New chat ⌘N');
    expect(screen.getByTestId('host-close-window').textContent).toBe('Close window ⌘W');
  });

  it('adds the configurable global chords the user actually set', async () => {
    installHost({});
    render(<Harness />);

    expect((await screen.findByTestId('host-quickAsk')).textContent).toBe('Quick Ask ⌥Space');
    expect(screen.getByTestId('host-screenshot').textContent).toBe('Screenshot to chat ⌘⇧2');
  });

  it('leaves out a global chord the user switched off rather than showing an empty key', async () => {
    installHost({});
    render(<Harness />);

    await screen.findByTestId('host-quickAsk');
    expect(screen.queryByTestId('host-voice')).toBeNull();
  });

  it('still lists the menu chords when the preferences read fails', async () => {
    installHost({ readPreferences: () => Promise.reject(new Error('bridge down')) });
    render(<Harness />);

    expect(await screen.findByTestId('host-settings')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('host-quickAsk')).toBeNull());
  });

  it('spells the chords for the platform the bridge reports', async () => {
    installHost({ platform: 'electron-win32' });
    render(<Harness />);

    expect((await screen.findByTestId('host-new-chat')).textContent).toBe('New chat Ctrl+N');
  });
});

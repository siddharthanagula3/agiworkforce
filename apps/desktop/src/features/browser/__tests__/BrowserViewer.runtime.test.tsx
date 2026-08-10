import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { BrowserViewer } from '../BrowserViewer';
import { cleanupBrowserStore, useBrowserStore } from '../../../stores/browserStore';

vi.mock('../../../lib/tauri-mock', () => ({
  invoke: vi.fn(),
  listen: vi.fn(() => Promise.resolve(() => {})),
  isTauri: true,
}));

type InvokeMock = Mock<(cmd: string, args?: Record<string, unknown>) => Promise<unknown>>;

async function getInvokeMock(): Promise<InvokeMock> {
  const { invoke } = await import('../../../lib/tauri-mock');
  return invoke as InvokeMock;
}

/**
 * The exact shape of the diagnostic the Rust launcher produces when discovery
 * finds nothing installed. If this text never reaches the screen, a user on a
 * stock machine has no way to learn what to install or which env var to set.
 */
const DISCOVERY_DIAGNOSTIC =
  'No Chromium-based browser installation found. Looked for ' +
  '[/Applications/Google Chrome.app/Contents/MacOS/Google Chrome] on disk and for ' +
  '[google-chrome, chromium, chrome] on PATH. Install one of them, or set ' +
  'AGIWORKFORCE_BROWSER_EXECUTABLE to the absolute path of the browser executable.';

function resetBrowserStore() {
  useBrowserStore.setState({
    sessions: [],
    activeSessionId: null,
    initialized: false,
    screenshots: [],
    actions: [],
    domSnapshots: [],
    highlightedElement: null,
    isRecording: false,
    recordedSteps: [],
    isStreaming: false,
    streamIntervalId: null,
  });
}

describe('BrowserViewer browser-control runtime', () => {
  let invokeMock: InvokeMock;

  beforeEach(async () => {
    invokeMock = await getInvokeMock();
    invokeMock.mockReset();
    resetBrowserStore();
  });

  afterEach(() => {
    cleanupBrowserStore();
  });

  it('starts the browser-control runtime from the viewer when nothing is running', async () => {
    const user = userEvent.setup();
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'browser_launch') return 'session-1';
      if (command === 'browser_open_tab') return 'tab-1';
      return undefined;
    });

    render(<BrowserViewer />);

    // Both the toolbar control and the empty-state panel offer the start
    // action; the panel one is what a user with no session actually sees.
    const startButtons = screen.getAllByRole('button', { name: /Start browser/ });
    expect(startButtons.length).toBeGreaterThan(0);
    await user.click(startButtons[startButtons.length - 1]!);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        'browser_launch',
        expect.objectContaining({ browserType: 'Chromium', headless: false }),
      );
    });

    // A launched runtime with no tab leaves the address bar dead, so the first
    // tab is part of starting it.
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('browser_open_tab', { url: 'about:blank' });
    });

    await waitFor(() => {
      expect(useBrowserStore.getState().activeSessionId).toBe('session-1');
    });
  });

  it('shows the launcher diagnostic when no supported browser is installed', async () => {
    const user = userEvent.setup();
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'browser_launch') throw new Error(DISCOVERY_DIAGNOSTIC);
      return undefined;
    });

    render(<BrowserViewer />);

    const startButtons = screen.getAllByRole('button', { name: /Start browser/ });
    await user.click(startButtons[startButtons.length - 1]!);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('AGIWORKFORCE_BROWSER_EXECUTABLE');
    expect(alert.textContent).toContain(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    );
  });

  it('stops a running browser-control runtime', async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValue(undefined);

    useBrowserStore.setState({
      sessions: [
        {
          id: 'session-1',
          browserType: 'Chromium',
          headless: false,
          tabs: [],
          active: true,
        },
      ],
      activeSessionId: 'session-1',
    });

    render(<BrowserViewer />);

    await user.click(screen.getByRole('button', { name: 'Stop browser' }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('browser_close', { browserId: 'session-1' });
    });

    // Closed runtime, so the viewer must offer to start one again rather than
    // stranding the user with a dead panel.
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Start browser/ }).length).toBeGreaterThan(0);
    });
  });
});

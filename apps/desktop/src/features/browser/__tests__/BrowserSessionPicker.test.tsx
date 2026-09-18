import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { CLOUD_BROWSER_UNAVAILABLE_REASON } from '@agiworkforce/types';
import { BrowserSessionPicker } from '../BrowserSessionPicker';
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

describe('BrowserSessionPicker', () => {
  it('offers the three sessions as separate choices', () => {
    render(<BrowserSessionPicker value="built-in" onChange={vi.fn()} />);

    const options = screen.getAllByRole('radio');
    expect(options).toHaveLength(3);
    expect(screen.getByRole('radio', { name: /Your Chrome/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Built-in browser/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Cloud browser/ })).toBeInTheDocument();
  });

  it('shows the cloud session as unavailable with its reason rather than hiding it', () => {
    render(<BrowserSessionPicker value="built-in" onChange={vi.fn()} />);

    const cloud = screen.getByRole('radio', { name: /Cloud browser/ });
    expect(cloud).toBeDisabled();
    expect(cloud).toHaveTextContent(CLOUD_BROWSER_UNAVAILABLE_REASON);
  });

  it('does not select a session that cannot run', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<BrowserSessionPicker value="built-in" onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: /Cloud browser/ }));
    expect(onChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole('radio', { name: /Your Chrome/ }));
    expect(onChange).toHaveBeenCalledWith('user-chrome');
  });
});

describe('BrowserViewer session selection', () => {
  let invokeMock: InvokeMock;

  beforeEach(async () => {
    invokeMock = await getInvokeMock();
    invokeMock.mockReset();
    resetBrowserStore();
  });

  afterEach(() => {
    cleanupBrowserStore();
  });

  it('starts the runtime only for the session the viewer hosts', async () => {
    const user = userEvent.setup();
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'browser_launch') return 'session-1';
      if (command === 'browser_open_tab') return 'tab-1';
      return undefined;
    });

    render(<BrowserViewer />);

    const startButtons = screen.getAllByRole('button', { name: /Start browser/ });
    await user.click(startButtons[startButtons.length - 1]!);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('browser_launch', expect.anything());
    });
  });

  it('refuses to launch the built-in browser when the user asked for their own Chrome', async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValue(undefined);

    render(<BrowserViewer />);

    await user.click(screen.getByRole('radio', { name: /Your Chrome/ }));
    const startButtons = screen.getAllByRole('button', { name: /Start browser/ });
    await user.click(startButtons[startButtons.length - 1]!);

    expect(await screen.findByRole('alert')).toHaveTextContent(/AGI extension inside Chrome/);
    expect(invokeMock).not.toHaveBeenCalledWith('browser_launch', expect.anything());
  });
});

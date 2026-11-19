import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DesktopRuntimeError,
  type HostBridge,
  type HostCommand,
} from '@agiworkforce/local-runtime-contract';
import { useUIStore } from '@shared/stores/layout-store';
import { onAppCommand } from '@shared/lib/app-commands';
import { OpenedFolderNotice } from '../components/OpenedFolderNotice';
import { PageFindBar } from '../components/PageFindBar';
import { useHostCommands } from '../hooks/use-host-commands';
import { useOpenedFolderStore } from '../lib/open-granted-folder';

const { pickWorkspaceRoot } = vi.hoisted(() => ({ pickWorkspaceRoot: vi.fn() }));

vi.mock('../lib/runtime-client', () => ({
  pickWorkspaceRoot,
}));

let deliver: ((command: HostCommand) => void) | null = null;
let released = 0;

function fakeHost(): HostBridge {
  return {
    platform: 'electron-darwin',
    appVersion: '1.2.0',
    onHostCommand: (callback: (command: HostCommand) => void) => {
      deliver = callback;
      return () => {
        released += 1;
        deliver = null;
      };
    },
  } as unknown as HostBridge;
}

function Harness({ host }: { host: HostBridge | null }) {
  useHostCommands(host);
  return (
    <>
      <p>alpha beta alpha</p>
      <PageFindBar />
      <OpenedFolderNotice />
    </>
  );
}

beforeEach(() => {
  deliver = null;
  released = 0;
  pickWorkspaceRoot.mockReset();
  useOpenedFolderStore.getState().reset();
  useUIStore.getState().setSidebarCollapsed(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('host commands', () => {
  it('collapses and restores the sidebar the page already owns', () => {
    render(<Harness host={fakeHost()} />);

    deliver?.('toggle-sidebar');
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);

    deliver?.('toggle-sidebar');
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
  });

  it('asks the page to open a side chat through the command the pane listens for', () => {
    const opened = vi.fn();
    const stop = onAppCommand('toggle-side-chat', opened);
    render(<Harness host={fakeHost()} />);

    deliver?.('toggle-side-chat');

    expect(opened).toHaveBeenCalledTimes(1);
    stop();
  });

  it('starts and stops a performance trace from the public window command', () => {
    performance.clearMarks('agi-desktop-trace-start');
    performance.clearMeasures('agi-desktop-trace');
    render(<Harness host={fakeHost()} />);

    deliver?.('start-performance-trace');
    expect(performance.getEntriesByName('agi-desktop-trace-start', 'mark')).toHaveLength(1);
    expect(performance.getEntriesByName('agi-desktop-trace', 'measure')).toHaveLength(0);

    deliver?.('start-performance-trace');
    expect(performance.getEntriesByName('agi-desktop-trace-start', 'mark')).toHaveLength(0);
    expect(performance.getEntriesByName('agi-desktop-trace', 'measure').length).toBeGreaterThan(0);
    performance.clearMeasures('agi-desktop-trace');
  });

  it('asks the page to open a new tab through the command the pane listens for', () => {
    const opened = vi.fn();
    const stop = onAppCommand('new-tab', opened);
    render(<Harness host={fakeHost()} />);

    deliver?.('new-tab');

    expect(opened).toHaveBeenCalledTimes(1);
    stop();
  });

  it('asks the page to focus the composer through the command the pane listens for', () => {
    const opened = vi.fn();
    const stop = onAppCommand('focus-follow-up', opened);
    render(<Harness host={fakeHost()} />);

    deliver?.('focus-follow-up');

    expect(opened).toHaveBeenCalledTimes(1);
    stop();
  });

  it('asks the page to close the tabs to the right through the command the tab strip listens for', () => {
    const opened = vi.fn();
    const stop = onAppCommand('close-tabs-to-the-right', opened);
    render(<Harness host={fakeHost()} />);

    deliver?.('close-tabs-to-the-right');

    expect(opened).toHaveBeenCalledTimes(1);
    stop();
  });

  it('asks the page to close the other tabs through the command the tab strip listens for', () => {
    const opened = vi.fn();
    const stop = onAppCommand('close-other-tabs', opened);
    render(<Harness host={fakeHost()} />);

    deliver?.('close-other-tabs');

    expect(opened).toHaveBeenCalledTimes(1);
    stop();
  });

  it('asks the page to show the file tree through the command the pane listens for', () => {
    const opened = vi.fn();
    const stop = onAppCommand('toggle-files', opened);
    render(<Harness host={fakeHost()} />);

    deliver?.('toggle-files');

    expect(opened).toHaveBeenCalledTimes(1);
    stop();
  });

  it('asks the page to show the terminal through the command the pane listens for', () => {
    const opened = vi.fn();
    const stop = onAppCommand('toggle-terminal', opened);
    render(<Harness host={fakeHost()} />);

    deliver?.('toggle-terminal');

    expect(opened).toHaveBeenCalledTimes(1);
    stop();
  });

  it('opens the feedback dialog through the command the surfaces listen for', () => {
    const opened = vi.fn();
    const stop = onAppCommand('open-feedback', opened);
    render(<Harness host={fakeHost()} />);

    deliver?.('send-feedback');

    expect(opened).toHaveBeenCalledTimes(1);
    stop();
  });

  it('opens the shortcut sheet through the command the surfaces listen for', () => {
    const opened = vi.fn();
    const stop = onAppCommand('open-shortcuts', opened);
    render(<Harness host={fakeHost()} />);

    deliver?.('show-keyboard-shortcuts');

    expect(opened).toHaveBeenCalledTimes(1);
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
    stop();
  });

  it.each([
    ['find', 'find'],
    ['open-search', 'open-search'],
    ['previous-chat', 'previous-chat'],
    ['next-chat', 'next-chat'],
    ['new-temporary-chat', 'new-temporary-chat'],
  ] as const)('turns the %s menu command into the %s app command', (command, appCommand) => {
    const answered = vi.fn();
    const stop = onAppCommand(appCommand, answered);
    render(<Harness host={fakeHost()} />);

    deliver?.(command);

    expect(answered).toHaveBeenCalledTimes(1);
    stop();
  });

  it('ignores a command from a newer shell instead of opening the shortcut sheet', () => {
    const opened = vi.fn();
    const stop = onAppCommand('open-shortcuts', opened);
    render(<Harness host={fakeHost()} />);

    deliver?.('open-the-pod-bay-doors' as HostCommand);

    expect(opened).not.toHaveBeenCalled();
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
    stop();
  });

  it('subscribes to nothing in a browser', () => {
    render(<Harness host={null} />);

    expect(deliver).toBeNull();
  });

  it('asks the page to open New Project without creating one', async () => {
    const open = vi.fn();
    const stop = onAppCommand('new-project', open);
    render(<Harness host={fakeHost()} />);

    await act(async () => {
      deliver?.('new-project');
    });

    expect(open).toHaveBeenCalledTimes(1);
    stop();
  });

  it('opens Find on the page the window is showing', async () => {
    render(<Harness host={fakeHost()} />);

    await act(async () => {
      deliver?.('find');
    });
    const field = await screen.findByRole('textbox', { name: 'Find in page' });
    expect(field).toBeTruthy();
  });

  it('approves the folder File > Open Folder asks for and shows its name', async () => {
    pickWorkspaceRoot.mockResolvedValue({ id: 'root-1', name: 'Notes', path: '/work/notes' });
    render(<Harness host={fakeHost()} />);

    await act(async () => {
      deliver?.('open-folder');
    });

    expect(await screen.findByText('Folder open: Notes')).toBeTruthy();
    expect(pickWorkspaceRoot).toHaveBeenCalledWith('folder');
  });

  it('leaves the window unchanged when the folder dialog is cancelled', async () => {
    pickWorkspaceRoot.mockRejectedValue(
      new DesktopRuntimeError({ code: 'cancelled', message: 'No folder was chosen.' }),
    );
    render(<Harness host={fakeHost()} />);

    await act(async () => {
      deliver?.('open-folder');
    });

    await waitFor(() => expect(pickWorkspaceRoot).toHaveBeenCalledWith('folder'));
    expect(screen.queryByText(/Folder open/)).toBeNull();
    expect(screen.queryByText('No folder was chosen.')).toBeNull();
  });

  it('releases the subscription when it unmounts', () => {
    const view = render(<Harness host={fakeHost()} />);

    view.unmount();

    expect(released).toBe(1);
    expect(deliver).toBeNull();
  });
});

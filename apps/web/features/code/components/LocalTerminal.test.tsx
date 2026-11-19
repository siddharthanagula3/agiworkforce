import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/features/desktop-host');

const startBackgroundLocalCommand = vi.fn();
const startLocalCommand = vi.fn();
const cancelLocalCommand = vi.fn();

vi.mock('@/features/desktop-host', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  startBackgroundLocalCommand,
  startLocalCommand,
  cancelLocalCommand,
}));

vi.mock('./LocalPtyTerminal', () => ({
  LocalPtyTerminal: ({ rootId }: { rootId: string }) => <div data-testid="pty">{rootId}</div>,
}));

const { LocalTerminal, LocalTerminalDock } = await import('./LocalTerminal');

beforeEach(() => {
  vi.clearAllMocks();
  cancelLocalCommand.mockResolvedValue(undefined);
});

function renderDock(open = true, pty = false) {
  const onClose = vi.fn();
  const onCommandFinished = vi.fn();
  const view = render(
    <LocalTerminalDock
      rootId="root-1"
      folder="agiworkforce"
      open={open}
      pty={pty}
      onClose={onClose}
      onCommandFinished={onCommandFinished}
      onBackgroundStarted={vi.fn()}
    />,
  );
  return { ...view, onClose, onCommandFinished };
}

function backgroundReceipt(patch: Record<string, unknown> = {}) {
  return {
    runId: 'run-1',
    command: 'pnpm dev',
    program: 'pnpm',
    output: 'ready on http://localhost:5173',
    running: true,
    exitCode: null,
    truncated: false,
    terminal: true,
    ...patch,
  };
}

function pendingBackgroundStart(runId: string) {
  let settle: (value: ReturnType<typeof backgroundReceipt>) => void = () => undefined;
  let fail: (reason: Error) => void = () => undefined;
  startBackgroundLocalCommand.mockReturnValue({
    runId,
    started: new Promise((resolve, reject) => {
      settle = resolve;
      fail = reject;
    }),
  });
  return { settle: (value: ReturnType<typeof backgroundReceipt>) => settle(value), fail };
}

function neverEndingRun(runId: string) {
  startLocalCommand.mockImplementation(() => ({
    runId,
    result: new Promise(() => undefined),
  }));
}

describe('the local terminal', () => {
  it('keeps a command such as a dev server running and hands it to the running list', async () => {
    startBackgroundLocalCommand.mockReturnValue({
      runId: 'run-1',
      started: Promise.resolve(backgroundReceipt()),
    });
    const onBackgroundStarted = vi.fn();
    render(
      <LocalTerminal
        rootId="root-1"
        folder="agiworkforce"
        onCommandFinished={vi.fn()}
        onBackgroundStarted={onBackgroundStarted}
      />,
    );

    await userEvent.type(screen.getByLabelText('Command'), 'pnpm dev');
    await userEvent.click(screen.getByRole('button', { name: 'Keep running' }));

    expect(startBackgroundLocalCommand).toHaveBeenCalledWith({
      rootId: 'root-1',
      command: 'pnpm dev',
    });
    expect(await screen.findByText(/ready on http:\/\/localhost:5173/)).toBeInTheDocument();
    expect(screen.getByText(/Running in the background/)).toBeInTheDocument();
    await waitFor(() => expect(onBackgroundStarted).toHaveBeenCalledOnce());
    expect(screen.getByLabelText('Command')).toHaveValue('');
  });

  it('does not say a background command that already exited is still running', async () => {
    startBackgroundLocalCommand.mockReturnValue({
      runId: 'run-1',
      started: Promise.resolve(backgroundReceipt({ output: 'done', running: false, exitCode: 0 })),
    });
    render(<LocalTerminal rootId="root-1" folder="agiworkforce" onCommandFinished={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Command'), 'echo done');
    await userEvent.click(screen.getByRole('button', { name: 'Keep running' }));

    expect(await screen.findByText('exit 0')).toBeInTheDocument();
    expect(screen.queryByText(/Running in the background/)).not.toBeInTheDocument();
  });

  it('does not label a live background command as stopped', async () => {
    startBackgroundLocalCommand.mockReturnValue({
      runId: 'run-1',
      started: Promise.resolve(backgroundReceipt()),
    });
    render(<LocalTerminal rootId="root-1" folder="agiworkforce" onCommandFinished={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Command'), 'pnpm dev');
    await userEvent.click(screen.getByRole('button', { name: 'Keep running' }));

    expect(await screen.findByText(/Running in the background/)).toBeInTheDocument();
    expect(screen.queryByText('stopped')).not.toBeInTheDocument();
  });

  it('cancels the exact background start that Stop names while it is still starting', async () => {
    const start = pendingBackgroundStart('run-bg-1');
    const onBackgroundStarted = vi.fn();
    render(
      <LocalTerminal
        rootId="root-1"
        folder="agiworkforce"
        onCommandFinished={vi.fn()}
        onBackgroundStarted={onBackgroundStarted}
      />,
    );

    await userEvent.type(screen.getByLabelText('Command'), 'pnpm dev');
    await userEvent.click(screen.getByRole('button', { name: 'Keep running' }));
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));

    expect(cancelLocalCommand).toHaveBeenCalledOnce();
    expect(cancelLocalCommand).toHaveBeenCalledWith('run-bg-1');

    start.settle(backgroundReceipt({ runId: 'run-bg-1' }));
    expect(await screen.findByText('stopped')).toBeInTheDocument();
    expect(screen.queryByText(/Running in the background/)).not.toBeInTheDocument();
    expect(onBackgroundStarted).not.toHaveBeenCalled();
  });

  it('keeps a background command that was handed off when the terminal closes', async () => {
    startBackgroundLocalCommand.mockReturnValue({
      runId: 'run-bg-2',
      started: Promise.resolve(backgroundReceipt({ runId: 'run-bg-2' })),
    });
    const view = render(
      <LocalTerminal rootId="root-1" folder="agiworkforce" onCommandFinished={vi.fn()} />,
    );

    await userEvent.type(screen.getByLabelText('Command'), 'pnpm dev');
    await userEvent.click(screen.getByRole('button', { name: 'Keep running' }));
    await screen.findByText(/Running in the background/);
    view.unmount();

    expect(cancelLocalCommand).not.toHaveBeenCalled();
  });

  it('cancels a background start that is still starting when its tab is closed', async () => {
    pendingBackgroundStart('run-bg-3');
    renderDock();

    await userEvent.click(screen.getByRole('button', { name: 'New terminal' }));
    await userEvent.type(
      within(screen.getByRole('tabpanel')).getByLabelText('Command'),
      'pnpm dev',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Keep running' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close agiworkforce (2)' }));

    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stop and close' }));

    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(1));
    expect(cancelLocalCommand).toHaveBeenCalledWith('run-bg-3');
  });

  it('prompts with the folder name and runs a command on Enter', async () => {
    startLocalCommand.mockImplementation(() => ({
      runId: 'run-2',
      result: Promise.resolve({ exitCode: 0, timedOut: false }),
    }));
    const { onCommandFinished } = renderDock();

    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText('agiworkforce %')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Command')).toHaveFocus());

    await userEvent.type(screen.getByLabelText('Command'), 'git status{Enter}');

    expect(startLocalCommand).toHaveBeenCalledWith(
      expect.objectContaining({ rootId: 'root-1', command: 'git status' }),
      expect.any(Function),
    );
    expect(await within(panel).findByText('exit 0')).toBeInTheDocument();
    expect(onCommandFinished).toHaveBeenCalledOnce();
  });
});

describe('the terminal dock', () => {
  it('gives each tab a real shell when the CLI hosts one, and the command line otherwise', async () => {
    const shell = renderDock(true, true);
    expect(screen.getByTestId('pty')).toHaveTextContent('root-1');
    expect(screen.queryByLabelText('Command')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'New terminal' }));
    expect(screen.getAllByTestId('pty')).toHaveLength(2);
    shell.unmount();

    renderDock(true, false);
    expect(screen.queryByTestId('pty')).toBeNull();
    expect(screen.getByLabelText('Command')).toBeInTheDocument();
  });

  it('opens one tab named for the folder and adds numbered tabs with the plus button', async () => {
    renderDock();

    expect(screen.getByRole('tab', { name: 'agiworkforce' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await userEvent.click(screen.getByRole('button', { name: 'New terminal' }));

    const second = screen.getByRole('tab', { name: 'agiworkforce (2)' });
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Close agiworkforce (2)' }));
    expect(screen.getAllByRole('tab')).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'agiworkforce' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('closes the panel from its close button and when its last tab closes', async () => {
    const { onClose } = renderDock();

    await userEvent.click(screen.getByRole('button', { name: 'Close the terminal panel' }));
    expect(onClose).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole('button', { name: 'Close agiworkforce' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('tab', { name: 'agiworkforce' })).toBeInTheDocument();
  });

  it('asks before closing a tab whose command is still running, then stops it', async () => {
    neverEndingRun('run-3');
    renderDock();

    await userEvent.click(screen.getByRole('button', { name: 'New terminal' }));
    await userEvent.type(
      within(screen.getByRole('tabpanel')).getByLabelText('Command'),
      'pnpm test{Enter}',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Close agiworkforce (2)' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('pnpm test is still running here.');
    expect(screen.getAllByRole('tab', { hidden: true })).toHaveLength(2);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Stop and close' }));

    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(1));
    expect(cancelLocalCommand).toHaveBeenCalledWith('run-3');
  });

  it('hides rather than unmounts while closed, so its tabs keep running', () => {
    const { container } = renderDock(false);

    expect(container.querySelector('[data-testid="local-terminal-dock"]')).toHaveAttribute(
      'hidden',
    );
  });
});

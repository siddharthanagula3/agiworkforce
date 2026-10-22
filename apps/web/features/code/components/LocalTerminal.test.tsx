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

const { LocalTerminal, LocalTerminalDock } = await import('./LocalTerminal');

beforeEach(() => {
  vi.clearAllMocks();
  cancelLocalCommand.mockResolvedValue(undefined);
});

function renderDock(open = true) {
  const onClose = vi.fn();
  const onCommandFinished = vi.fn();
  const view = render(
    <LocalTerminalDock
      rootId="root-1"
      folder="agiworkforce"
      open={open}
      onClose={onClose}
      onCommandFinished={onCommandFinished}
      onBackgroundStarted={vi.fn()}
    />,
  );
  return { ...view, onClose, onCommandFinished };
}

function neverEndingRun(runId: string) {
  startLocalCommand.mockImplementation(() => ({
    runId,
    result: new Promise(() => undefined),
  }));
}

describe('the local terminal', () => {
  it('keeps a command such as a dev server running and hands it to the running list', async () => {
    startBackgroundLocalCommand.mockResolvedValue({
      runId: 'run-1',
      command: 'pnpm dev',
      program: 'pnpm',
      output: 'ready on http://localhost:5173',
      running: true,
      exitCode: null,
      truncated: false,
      terminal: true,
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

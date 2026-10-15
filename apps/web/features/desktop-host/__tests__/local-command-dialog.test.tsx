import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LocalCommandOutput } from '../lib/runtime-client';

const listWorkspaceRoots = vi.fn();
const pickWorkspaceRoot = vi.fn();
const startLocalCommand = vi.fn();
const cancelLocalCommand = vi.fn();
let workspaceChanged: (() => void) | null = null;
const onWorkspaceChanged = (listener: () => void) => {
  workspaceChanged = listener;
  return () => {
    workspaceChanged = null;
  };
};

vi.mock('../lib/runtime-client', () => ({
  listWorkspaceRoots,
  onWorkspaceChanged,
  pickWorkspaceRoot,
  startLocalCommand,
  cancelLocalCommand,
}));

const { LocalCommandDialog } = await import('../components/LocalCommandDialog');

const root = {
  id: 'root-1',
  path: '/Users/me/project',
  name: 'project',
  grantedAtMs: 0,
  lastOpenedAtMs: 0,
};

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function finished(overrides: Record<string, unknown> = {}) {
  return {
    runId: 'run-1',
    command: 'git status',
    program: 'git',
    cwd: '',
    exitCode: 0,
    signal: null,
    stdout: 'clean\n',
    stderr: '',
    truncated: false,
    timedOut: false,
    durationMs: 420,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  cancelLocalCommand.mockResolvedValue(true);
  listWorkspaceRoots.mockResolvedValue([root]);
});

describe('LocalCommandDialog', () => {
  it('renders nothing while closed', () => {
    const { container } = render(
      <LocalCommandDialog open={false} onClose={vi.fn()} onAttach={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('offers the approved folders and refuses to run an empty command', async () => {
    render(<LocalCommandDialog open onClose={vi.fn()} onAttach={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'project' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();
  });

  it('offers a folder approved by a drop on the window while it is open', async () => {
    render(<LocalCommandDialog open onClose={vi.fn()} onAttach={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'project' })).toBeInTheDocument();

    listWorkspaceRoots.mockResolvedValue([
      root,
      { ...root, id: 'root-2', path: '/Users/me/dropped', name: 'dropped' },
    ]);
    act(() => workspaceChanged?.());

    expect(await screen.findByRole('button', { name: 'dropped' })).toBeInTheDocument();
  });

  it('does not run on the Enter that confirms an IME word', async () => {
    const user = userEvent.setup();
    startLocalCommand.mockReturnValue({ runId: 'run-1', result: Promise.resolve(finished()) });
    render(<LocalCommandDialog open onClose={vi.fn()} onAttach={vi.fn()} />);
    const field = await screen.findByLabelText('Command');
    await user.type(field, 'git commit -m');

    fireEvent.keyDown(field, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(field, { key: 'Enter', keyCode: 229 });
    expect(startLocalCommand).not.toHaveBeenCalled();

    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(startLocalCommand).toHaveBeenCalledTimes(1));
  });

  it('says so when a running command could not be stopped', async () => {
    const user = userEvent.setup();
    startLocalCommand.mockReturnValue({ runId: 'run-1', result: new Promise(() => undefined) });
    cancelLocalCommand.mockRejectedValue(new Error('gone'));
    render(<LocalCommandDialog open onClose={vi.fn()} onAttach={vi.fn()} />);
    await user.type(await screen.findByLabelText('Command'), 'sleep 60');
    await user.click(screen.getByRole('button', { name: 'Run' }));

    await user.click(await screen.findByRole('button', { name: 'Stop' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be stopped');
  });

  it('stops a running command when the composer that owns the dialog goes away', async () => {
    const user = userEvent.setup();
    startLocalCommand.mockReturnValue({ runId: 'run-1', result: new Promise(() => undefined) });
    cancelLocalCommand.mockResolvedValue(true);
    const view = render(<LocalCommandDialog open onClose={vi.fn()} onAttach={vi.fn()} />);
    await user.type(await screen.findByLabelText('Command'), 'sleep 60');
    await user.click(screen.getByRole('button', { name: 'Run' }));
    await screen.findByRole('button', { name: 'Stop' });

    view.unmount();

    expect(cancelLocalCommand).toHaveBeenCalledWith('run-1');
  });

  it('moves off a folder that is no longer approved when the list is reread', async () => {
    const second = { ...root, id: 'root-2', path: '/Users/me/other', name: 'other' };
    listWorkspaceRoots.mockResolvedValue([root, second]);
    render(<LocalCommandDialog open onClose={vi.fn()} onAttach={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'project' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    listWorkspaceRoots.mockResolvedValue([second]);
    act(() => workspaceChanged?.());

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'other' })).toHaveAttribute('aria-pressed', 'true'),
    );
    expect(screen.queryByRole('button', { name: 'project' })).not.toBeInTheDocument();
  });

  it('tells the user to approve a folder before anything can run', async () => {
    listWorkspaceRoots.mockResolvedValue([]);
    render(<LocalCommandDialog open onClose={vi.fn()} onAttach={vi.fn()} />);
    expect(await screen.findByText(/No folders are approved yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run' })).not.toBeInTheDocument();
  });

  it('streams output while the command runs and reports how it ended', async () => {
    const user = userEvent.setup();
    let release: (value: unknown) => void = () => undefined;
    startLocalCommand.mockImplementation(
      (_input: unknown, onOutput: (output: LocalCommandOutput) => void) => {
        onOutput({ stream: 'stdout', text: 'on branch main\n' });
        return {
          runId: 'run-1',
          result: new Promise((resolve) => {
            release = resolve;
          }),
        };
      },
    );

    render(<LocalCommandDialog open onClose={vi.fn()} onAttach={vi.fn()} />);
    await screen.findByRole('button', { name: 'project' });
    await user.type(screen.getByLabelText(/Command/), 'git status');
    await user.click(screen.getByRole('button', { name: 'Run' }));

    expect(await screen.findByText(/on branch main/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();

    release(finished());
    expect(await screen.findByText(/Finished in/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
  });

  it('names a non-zero exit rather than calling it done', async () => {
    const user = userEvent.setup();
    startLocalCommand.mockReturnValue({
      runId: 'run-1',
      result: Promise.resolve(finished({ exitCode: 2 })),
    });

    render(<LocalCommandDialog open onClose={vi.fn()} onAttach={vi.fn()} />);
    await screen.findByRole('button', { name: 'project' });
    await user.type(screen.getByLabelText(/Command/), 'git status');
    await user.click(screen.getByRole('button', { name: 'Run' }));

    expect(await screen.findByText('Exited with code 2.')).toBeInTheDocument();
  });

  it('says when the output was cut off', async () => {
    const user = userEvent.setup();
    startLocalCommand.mockReturnValue({
      runId: 'run-1',
      result: Promise.resolve(finished({ truncated: true })),
    });

    render(<LocalCommandDialog open onClose={vi.fn()} onAttach={vi.fn()} />);
    await screen.findByRole('button', { name: 'project' });
    await user.type(screen.getByLabelText(/Command/), 'git log');
    await user.click(screen.getByRole('button', { name: 'Run' }));

    expect(await screen.findByText(/cut off at the size limit/)).toBeInTheDocument();
  });

  it('surfaces a refusal from the runtime instead of failing silently', async () => {
    const user = userEvent.setup();
    const refusal = Promise.reject(
      Object.assign(new Error('rm is on your blocked list for local commands.'), {
        name: 'DesktopRuntimeError',
      }),
    );
    refusal.catch(() => undefined);
    startLocalCommand.mockReturnValue({ runId: 'run-1', result: refusal });

    render(<LocalCommandDialog open onClose={vi.fn()} onAttach={vi.fn()} />);
    await screen.findByRole('button', { name: 'project' });
    await user.type(screen.getByLabelText(/Command/), 'rm -rf build');
    await user.click(screen.getByRole('button', { name: 'Run' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('attaches the transcript, naming the command and where it ran', async () => {
    const user = userEvent.setup();
    const onAttach = vi.fn();
    const onClose = vi.fn();
    startLocalCommand.mockImplementation(
      (_input: unknown, onOutput: (output: LocalCommandOutput) => void) => {
        onOutput({ stream: 'stdout', text: 'clean\n' });
        return { runId: 'run-1', result: Promise.resolve(finished()) };
      },
    );

    render(<LocalCommandDialog open onClose={onClose} onAttach={onAttach} />);
    await screen.findByRole('button', { name: 'project' });
    await user.type(screen.getByLabelText(/Command/), 'git status');
    await user.click(screen.getByRole('button', { name: 'Run' }));
    await user.click(await screen.findByRole('button', { name: 'Add output to chat' }));

    expect(onAttach).toHaveBeenCalledTimes(1);
    const [file] = onAttach.mock.calls[0]?.[0] as File[];
    expect(file?.type).toBe('text/plain');
    const body = await readText(file as File);
    expect(body).toContain('$ git status');
    expect(body).toContain('# in project');
    expect(body).toContain('clean');
    expect(onClose).toHaveBeenCalled();
  });

  it('stops a running command when the dialog is closed', async () => {
    const user = userEvent.setup();
    startLocalCommand.mockReturnValue({
      runId: 'run-7',
      result: new Promise(() => undefined),
    });

    render(<LocalCommandDialog open onClose={vi.fn()} onAttach={vi.fn()} />);
    await screen.findByRole('button', { name: 'project' });
    await user.type(screen.getByLabelText(/Command/), 'pnpm test');
    await user.click(screen.getByRole('button', { name: 'Run' }));
    await screen.findByRole('button', { name: 'Stop' });
    await user.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(cancelLocalCommand).toHaveBeenCalledWith('run-7'));
  });

  it('shows the whole output even when no chunk was streamed', async () => {
    const user = userEvent.setup();
    startLocalCommand.mockReturnValue({
      runId: 'run-1',
      result: Promise.resolve(finished({ stdout: 'on branch main\n', stderr: 'a warning\n' })),
    });

    render(<LocalCommandDialog open onClose={vi.fn()} onAttach={vi.fn()} />);
    await screen.findByRole('button', { name: 'project' });
    await user.type(screen.getByLabelText(/Command/), 'git status');
    await user.click(screen.getByRole('button', { name: 'Run' }));

    const pane = await screen.findByLabelText('Command output');
    expect(pane.textContent).toContain('on branch main');
    expect(pane.textContent).toContain('a warning');
  });

  it('builds the transcript from the result, not from what was streamed', async () => {
    const user = userEvent.setup();
    const onAttach = vi.fn();
    startLocalCommand.mockReturnValue({
      runId: 'run-1',
      result: Promise.resolve(finished({ stdout: 'complete output\n' })),
    });

    render(<LocalCommandDialog open onClose={vi.fn()} onAttach={onAttach} />);
    await screen.findByRole('button', { name: 'project' });
    await user.type(screen.getByLabelText(/Command/), 'git status');
    await user.click(screen.getByRole('button', { name: 'Run' }));
    await user.click(await screen.findByRole('button', { name: 'Add output to chat' }));

    const [file] = onAttach.mock.calls[0]?.[0] as File[];
    await expect(readText(file as File)).resolves.toContain('complete output');
  });

  it('sends the subfolder only when the user typed one', async () => {
    const user = userEvent.setup();
    startLocalCommand.mockReturnValue({
      runId: 'run-1',
      result: Promise.resolve(finished()),
    });

    render(<LocalCommandDialog open onClose={vi.fn()} onAttach={vi.fn()} />);
    await screen.findByRole('button', { name: 'project' });
    await user.type(screen.getByLabelText(/Folder inside project/), 'apps/web');
    await user.type(screen.getByLabelText(/Command/), 'pnpm test');
    await user.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() =>
      expect(startLocalCommand).toHaveBeenCalledWith(
        expect.objectContaining({ rootId: 'root-1', command: 'pnpm test', path: 'apps/web' }),
        expect.any(Function),
      ),
    );
  });
});

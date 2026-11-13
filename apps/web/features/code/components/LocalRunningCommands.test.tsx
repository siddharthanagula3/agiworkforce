import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BackgroundActivity,
  BackgroundCommandRun,
} from '@agiworkforce/local-runtime-contract';
type ScanModule0 = typeof import('@/features/desktop-host');

const readBackgroundActivity = vi.fn();
const cancelLocalCommand = vi.fn();
const readPreviewConsoleErrors = vi.fn();

vi.mock('@/features/desktop-host', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  cancelLocalCommand,
  readBackgroundActivity,
  readPreviewConsoleErrors,
}));

const { LocalRunningCommands } = await import('./LocalRunningCommands');

const NOW = 1_000_000_000;

function run(
  runId: string,
  command: string,
  rootId: string,
  minutesAgo: number,
): BackgroundCommandRun {
  return {
    runId,
    command,
    rootId,
    rootName: rootId,
    startedAtMs: NOW - minutesAgo * 60_000,
    background: true,
  };
}

function activity(commands: BackgroundCommandRun[]): BackgroundActivity {
  return {
    codingRuntimes: [],
    commands,
    computerUse: 'idle',
    remoteControl: 'idle',
    browserPaired: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  cancelLocalCommand.mockResolvedValue(true);
  readPreviewConsoleErrors.mockResolvedValue({ url: null, errors: [], dropped: 0 });
});

describe('the commands running in a local folder', () => {
  it("lists only this folder's runs, with how long each has run", async () => {
    readBackgroundActivity.mockResolvedValue(
      activity([run('run-1', 'pnpm dev', 'root-1', 4), run('run-2', 'npm start', 'root-2', 1)]),
    );
    render(<LocalRunningCommands rootId="root-1" refreshKey={0} now={() => NOW} />);

    expect(await screen.findByText('pnpm dev')).toBeInTheDocument();
    expect(screen.getByText('Running for 4 min')).toBeInTheDocument();
    expect(screen.queryByText('npm start')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop all' })).not.toBeInTheDocument();
  });

  it('stops one run, or every run in the folder at once', async () => {
    readBackgroundActivity.mockResolvedValue(
      activity([
        run('run-1', 'pnpm dev', 'root-1', 0),
        run('run-3', 'pnpm storybook', 'root-1', 2),
      ]),
    );
    render(<LocalRunningCommands rootId="root-1" refreshKey={0} now={() => NOW} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Stop pnpm dev' }));
    expect(cancelLocalCommand).toHaveBeenCalledWith('run-1');

    await userEvent.click(screen.getByRole('button', { name: 'Stop all' }));
    await waitFor(() => expect(cancelLocalCommand).toHaveBeenCalledWith('run-3'));
  });

  it('keeps a failed stop visible after the list refreshes, until the run ends', async () => {
    const user = userEvent.setup();
    readBackgroundActivity.mockResolvedValue(
      activity([
        run('run-1', 'pnpm dev', 'root-1', 1),
        run('run-3', 'pnpm storybook', 'root-1', 2),
      ]),
    );
    cancelLocalCommand.mockRejectedValueOnce(new Error('bridge closed'));
    const { rerender } = render(
      <LocalRunningCommands rootId="root-1" refreshKey={0} now={() => NOW} />,
    );

    const stopButton = await screen.findByRole('button', { name: 'Stop pnpm dev' });
    await user.click(stopButton);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'pnpm dev could not be stopped and may still be running.',
    );
    await waitFor(() => expect(readBackgroundActivity).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('alert')).toHaveTextContent('pnpm dev could not be stopped');
    expect(stopButton).toBeEnabled();

    readBackgroundActivity.mockResolvedValue(
      activity([run('run-3', 'pnpm storybook', 'root-1', 2)]),
    );
    rerender(<LocalRunningCommands rootId="root-1" refreshKey={1} now={() => NOW} />);
    await waitFor(() => expect(screen.queryByText('pnpm dev')).not.toBeInTheDocument());
    expect(screen.getByText('pnpm storybook')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reports each run of a stop-all on its own', async () => {
    const user = userEvent.setup();
    readBackgroundActivity.mockResolvedValue(
      activity([
        run('run-1', 'pnpm dev', 'root-1', 0),
        run('run-3', 'pnpm storybook', 'root-1', 2),
      ]),
    );
    cancelLocalCommand.mockImplementation(async (runId: string) => {
      if (runId === 'run-1') throw new Error('refused');
      return true;
    });
    render(<LocalRunningCommands rootId="root-1" refreshKey={0} now={() => NOW} />);

    await user.click(await screen.findByRole('button', { name: 'Stop all' }));

    const alerts = await screen.findAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent('pnpm dev could not be stopped');
    expect(cancelLocalCommand).toHaveBeenCalledWith('run-3');
  });

  it('shows nothing while nothing runs here', async () => {
    readBackgroundActivity.mockResolvedValue(activity([run('run-2', 'npm start', 'root-2', 1)]));
    const { container } = render(<LocalRunningCommands rootId="root-1" refreshKey={0} />);

    await waitFor(() => expect(readBackgroundActivity).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('hands the address a dev server printed to the browser pane', async () => {
    const user = userEvent.setup();
    const onOpenPreview = vi.fn();
    readBackgroundActivity.mockResolvedValue(
      activity([
        { ...run('run-1', 'pnpm dev', 'root-1', 2), previewUrl: 'http://localhost:5173/' },
        run('run-2', 'pnpm test --watch', 'root-1', 2),
      ]),
    );
    render(
      <LocalRunningCommands
        rootId="root-1"
        refreshKey={0}
        now={() => NOW}
        onOpenPreview={onOpenPreview}
      />,
    );

    const open = await screen.findByRole('button', {
      name: 'Open a preview of http://localhost:5173/',
    });
    expect(screen.getAllByRole('button', { name: /Open a preview/u })).toHaveLength(1);
    await user.click(open);
    expect(onOpenPreview).toHaveBeenCalledWith('http://localhost:5173/');
  });

  it('offers no preview where there is no browser pane to show it in', async () => {
    readBackgroundActivity.mockResolvedValue(
      activity([
        { ...run('run-1', 'pnpm dev', 'root-1', 2), previewUrl: 'http://localhost:5173/' },
      ]),
    );
    render(<LocalRunningCommands rootId="root-1" refreshKey={0} now={() => NOW} />);

    expect(await screen.findByText('pnpm dev')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open a preview/u })).not.toBeInTheDocument();
  });
});

describe('sending the preview console errors to the agent', () => {
  const PAGE = 'http://localhost:5173/';
  const report = {
    url: PAGE,
    errors: [
      {
        message: 'Uncaught TypeError: x is undefined',
        source: `${PAGE}src/app.ts`,
        line: 12,
        count: 3,
      },
      { message: 'Failed to load resource', source: null, line: null, count: 1 },
    ],
    dropped: 2,
  };

  function previewRun() {
    readBackgroundActivity.mockResolvedValue(
      activity([{ ...run('run-1', 'pnpm dev', 'root-1', 1), previewUrl: PAGE }]),
    );
  }

  it('offers the action only when a preview has logged errors and a turn can take them', async () => {
    previewRun();
    const { unmount } = render(
      <LocalRunningCommands
        rootId="root-1"
        refreshKey={0}
        now={() => NOW}
        onSendToAgent={vi.fn()}
      />,
    );
    await screen.findByText('pnpm dev');
    expect(screen.queryByRole('button', { name: /preview error/u })).not.toBeInTheDocument();
    unmount();

    readPreviewConsoleErrors.mockResolvedValue(report);
    const withoutSend = render(
      <LocalRunningCommands rootId="root-1" refreshKey={0} now={() => NOW} />,
    );
    await screen.findByText('pnpm dev');
    expect(screen.queryByRole('button', { name: /preview error/u })).not.toBeInTheDocument();
    expect(readPreviewConsoleErrors).toHaveBeenCalledTimes(1);
    withoutSend.unmount();

    readBackgroundActivity.mockResolvedValue(activity([run('run-2', 'pnpm test', 'root-1', 1)]));
    render(
      <LocalRunningCommands
        rootId="root-1"
        refreshKey={0}
        now={() => NOW}
        onSendToAgent={vi.fn()}
      />,
    );
    await screen.findByText('pnpm test');
    expect(screen.queryByRole('button', { name: /preview error/u })).not.toBeInTheDocument();
  });

  it('reads and clears the errors, then sends them as one turn', async () => {
    const user = userEvent.setup();
    const onSendToAgent = vi.fn();
    previewRun();
    readPreviewConsoleErrors.mockResolvedValue(report);
    render(
      <LocalRunningCommands
        rootId="root-1"
        refreshKey={0}
        now={() => NOW}
        onSendToAgent={onSendToAgent}
      />,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Send the 4 preview errors to the agent' }),
    );

    expect(readPreviewConsoleErrors).toHaveBeenLastCalledWith(true, PAGE);
    expect(onSendToAgent).toHaveBeenCalledWith(
      [
        'The page I opened in the preview, http://localhost:5173/, logged these errors in its console:',
        '',
        '1. Uncaught TypeError: x is undefined (http://localhost:5173/src/app.ts:12) [x3]',
        '2. Failed to load resource',
        '',
        '2 more errors were not kept.',
      ].join('\n'),
    );
    expect(screen.queryByRole('button', { name: /preview error/u })).not.toBeInTheDocument();
  });

  it('offers only the errors of a page this folder is serving', async () => {
    const onSendToAgent = vi.fn();
    previewRun();
    readPreviewConsoleErrors.mockResolvedValue({ ...report, url: 'http://localhost:3000/' });
    render(
      <LocalRunningCommands
        rootId="root-1"
        refreshKey={0}
        now={() => NOW}
        onSendToAgent={onSendToAgent}
      />,
    );
    await screen.findByText('pnpm dev');
    await waitFor(() => expect(readPreviewConsoleErrors).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /preview error/u })).not.toBeInTheDocument();
    expect(readPreviewConsoleErrors).not.toHaveBeenCalledWith(true, expect.anything());
  });

  it('offers the errors of another page of the same server, and asks for that server only', async () => {
    const user = userEvent.setup();
    const onSendToAgent = vi.fn();
    previewRun();
    const inner = `${PAGE}settings`;
    readPreviewConsoleErrors.mockResolvedValue({ ...report, url: inner });
    render(
      <LocalRunningCommands
        rootId="root-1"
        refreshKey={0}
        now={() => NOW}
        onSendToAgent={onSendToAgent}
      />,
    );
    await user.click(await screen.findByRole('button', { name: /preview errors/u }));
    expect(readPreviewConsoleErrors).toHaveBeenLastCalledWith(true, inner);
    expect(onSendToAgent).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when the errors were read elsewhere in the meantime', async () => {
    const user = userEvent.setup();
    const onSendToAgent = vi.fn();
    previewRun();
    readPreviewConsoleErrors.mockResolvedValueOnce(report).mockResolvedValue({
      url: PAGE,
      errors: [],
      dropped: 0,
    });
    render(
      <LocalRunningCommands
        rootId="root-1"
        refreshKey={0}
        now={() => NOW}
        onSendToAgent={onSendToAgent}
      />,
    );

    await user.click(await screen.findByRole('button', { name: /preview errors/u }));

    expect(onSendToAgent).not.toHaveBeenCalled();
  });

  it('says so when the errors cannot be read, and hides the action on a host without the command', async () => {
    const user = userEvent.setup();
    previewRun();
    readPreviewConsoleErrors.mockResolvedValueOnce(report).mockRejectedValueOnce(new Error('gone'));
    const { unmount } = render(
      <LocalRunningCommands
        rootId="root-1"
        refreshKey={0}
        now={() => NOW}
        onSendToAgent={vi.fn()}
      />,
    );
    await user.click(await screen.findByRole('button', { name: /preview errors/u }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The preview errors could not be read.',
    );
    unmount();

    readPreviewConsoleErrors.mockReset();
    readPreviewConsoleErrors.mockRejectedValue(new Error('unknown command'));
    render(
      <LocalRunningCommands
        rootId="root-1"
        refreshKey={0}
        now={() => NOW}
        onSendToAgent={vi.fn()}
      />,
    );
    await screen.findByText('pnpm dev');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /preview error/u })).not.toBeInTheDocument();
  });
});

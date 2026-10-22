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
const openLocalPreview = vi.fn();
const readPreviewConsoleErrors = vi.fn();

vi.mock('@/features/desktop-host', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  cancelLocalCommand,
  openLocalPreview,
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

  it('shows nothing while nothing runs here', async () => {
    readBackgroundActivity.mockResolvedValue(activity([run('run-2', 'npm start', 'root-2', 1)]));
    const { container } = render(<LocalRunningCommands rootId="root-1" refreshKey={0} />);

    await waitFor(() => expect(readBackgroundActivity).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('opens the address a dev server printed, and says so when it cannot', async () => {
    const user = userEvent.setup();
    readBackgroundActivity.mockResolvedValue(
      activity([
        { ...run('run-1', 'pnpm dev', 'root-1', 2), previewUrl: 'http://localhost:5173/' },
        run('run-2', 'pnpm test --watch', 'root-1', 2),
      ]),
    );
    openLocalPreview
      .mockResolvedValueOnce({ url: 'http://localhost:5173/' })
      .mockRejectedValueOnce(new Error('Nothing answered at http://localhost:5173/.'));
    render(<LocalRunningCommands rootId="root-1" refreshKey={0} now={() => NOW} />);

    const open = await screen.findByRole('button', {
      name: 'Open a preview of http://localhost:5173/',
    });
    expect(screen.getAllByRole('button', { name: /Open a preview/u })).toHaveLength(1);
    await user.click(open);
    expect(openLocalPreview).toHaveBeenCalledWith('http://localhost:5173/');

    await user.click(open);
    expect(await screen.findByRole('alert')).toHaveTextContent('Nothing answered');
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

    expect(readPreviewConsoleErrors).toHaveBeenLastCalledWith(true);
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

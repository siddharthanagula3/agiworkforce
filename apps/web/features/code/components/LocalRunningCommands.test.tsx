import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackgroundActivity, BackgroundCommandRun } from '@agiworkforce/local-runtime-contract';
type ScanModule0 = typeof import('@/features/desktop-host');

const readBackgroundActivity = vi.fn();
const cancelLocalCommand = vi.fn();

vi.mock('@/features/desktop-host', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  cancelLocalCommand,
  readBackgroundActivity,
}));

const { LocalRunningCommands } = await import('./LocalRunningCommands');

const NOW = 1_000_000_000;

function run(runId: string, command: string, rootId: string, minutesAgo: number): BackgroundCommandRun {
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
});

describe('the commands running in a local folder', () => {
  it("lists only this folder's runs, with how long each has run", async () => {
    readBackgroundActivity.mockResolvedValue(
      activity([
        run('run-1', 'pnpm dev', 'root-1', 4),
        run('run-2', 'npm start', 'root-2', 1),
      ]),
    );
    render(<LocalRunningCommands rootId="root-1" refreshKey={0} now={() => NOW} />);

    expect(await screen.findByText('pnpm dev')).toBeInTheDocument();
    expect(screen.getByText('Running for 4 min')).toBeInTheDocument();
    expect(screen.queryByText('npm start')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop all' })).not.toBeInTheDocument();
  });

  it('stops one run, or every run in the folder at once', async () => {
    readBackgroundActivity.mockResolvedValue(
      activity([run('run-1', 'pnpm dev', 'root-1', 0), run('run-3', 'pnpm storybook', 'root-1', 2)]),
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
});

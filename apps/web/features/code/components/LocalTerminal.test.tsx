import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/features/desktop-host');

const startBackgroundLocalCommand = vi.fn();

vi.mock('@/features/desktop-host', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  startBackgroundLocalCommand,
}));

const { LocalTerminal } = await import('./LocalTerminal');

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
        onCommandFinished={vi.fn()}
        onBackgroundStarted={onBackgroundStarted}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Terminal' }));
    await userEvent.type(screen.getByLabelText('Command'), 'pnpm dev');
    await userEvent.click(screen.getByRole('button', { name: 'Keep running' }));

    expect(startBackgroundLocalCommand).toHaveBeenCalledWith({ rootId: 'root-1', command: 'pnpm dev' });
    expect(await screen.findByText(/ready on http:\/\/localhost:5173/)).toBeInTheDocument();
    expect(screen.getByText(/Running in the background/)).toBeInTheDocument();
    await waitFor(() => expect(onBackgroundStarted).toHaveBeenCalledOnce());
    expect(screen.getByLabelText('Command')).toHaveValue('');
  });
});

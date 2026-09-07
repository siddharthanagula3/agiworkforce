import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { reportUncaughtConfirmError, useConfirmAction } from '../ConfirmAction';

afterEach(cleanup);

function Harness({ onConfirm }: { onConfirm: () => Promise<unknown> }) {
  const { confirm, dialog } = useConfirmAction();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          confirm({ title: 'Remove it?', description: 'This cannot be undone.', onConfirm })
        }
      >
        Remove
      </button>
      {dialog}
    </>
  );
}

async function openAndConfirm(onConfirm: () => Promise<unknown>) {
  render(<Harness onConfirm={onConfirm} />);
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
}

describe('useConfirmAction', () => {
  it('runs the confirmed action and closes', async () => {
    const onConfirm = vi.fn(async () => undefined);
    await openAndConfirm(onConfirm);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('Remove it?')).toBeNull());
  });

  it('lets the caller handle its own failure, and still closes', async () => {
    const handled: unknown[] = [];
    const onConfirm = vi.fn(async () => {
      try {
        throw new Error('delete failed');
      } catch (error) {
        handled.push(error);
      }
    });

    await openAndConfirm(onConfirm);

    await waitFor(() => expect(handled).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText('Remove it?')).toBeNull());
  });

  it('closes even when the confirmed action rejects, and reports rather than swallows', async () => {
    const scheduled = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation(() => undefined);
    const rejecting = vi.fn(async () => {
      throw new Error('delete failed');
    });

    await openAndConfirm(rejecting);

    await waitFor(() => expect(rejecting).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('Remove it?')).toBeNull());
    await waitFor(() => expect(scheduled).toHaveBeenCalledTimes(1));
    expect(() => scheduled.mock.calls[0]![0]()).toThrow('delete failed');
    scheduled.mockRestore();
  });
});

describe('reportUncaughtConfirmError', () => {
  it('schedules a rethrow of the original error rather than discarding it', () => {
    const error = new Error('delete failed');
    const scheduled = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation(() => undefined);

    reportUncaughtConfirmError(error);

    expect(scheduled).toHaveBeenCalledTimes(1);
    expect(() => scheduled.mock.calls[0]![0]()).toThrow(error);
    scheduled.mockRestore();
  });
});

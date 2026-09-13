import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { reportUncaughtConfirmError, useConfirmAction } from '../ConfirmAction';

afterEach(cleanup);

function Harness({
  onConfirm,
  stealFocus = false,
}: {
  onConfirm: () => Promise<unknown>;
  stealFocus?: boolean;
}) {
  const { confirm, dialog } = useConfirmAction();
  const thief = React.useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          confirm({ title: 'Remove it?', description: 'This cannot be undone.', onConfirm });
          if (stealFocus) thief.current?.focus();
        }}
      >
        Remove
      </button>
      <button type="button" ref={thief}>
        Composer
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

describe('useConfirmAction focus return', () => {
  it('restores the control that asked, not whatever took focus before the dialog mounted', async () => {
    // The shape of a confirm raised from a menu: the panel unmounts with focus
    // inside it and the page moves focus on, all before the dialog commits, so
    // reading document.activeElement at mount time records the wrong element.
    render(<Harness onConfirm={async () => undefined} stealFocus />);
    const trigger = screen.getByRole('button', { name: 'Remove' });
    trigger.focus();
    fireEvent.click(trigger);

    await screen.findByText('Remove it?');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Remove it?')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
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

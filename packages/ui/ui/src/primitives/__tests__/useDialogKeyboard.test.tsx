import { describe, expect, it, vi } from 'vitest';
import { useRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useDialogKeyboard } from '../useDialogKeyboard';

function Harness({
  onClose,
  closeOnEscape,
  empty = false,
}: {
  onClose: () => void;
  closeOnEscape?: boolean;
  empty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useDialogKeyboard({
    open,
    onClose: () => {
      onClose();
      setOpen(false);
    },
    panelRef,
    ...(closeOnEscape === undefined ? {} : { closeOnEscape }),
  });

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <button type="button">Behind</button>
      {open && (
        <div role="dialog" ref={panelRef} aria-label="Panel">
          {!empty && (
            <>
              <button type="button">First</button>
              <button type="button">Last</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

async function openPanel(onClose = vi.fn(), props: Partial<Parameters<typeof Harness>[0]> = {}) {
  const user = userEvent.setup();
  render(<Harness onClose={onClose} {...props} />);
  await user.click(screen.getByRole('button', { name: 'Open' }));
  return { user, onClose };
}

describe('the dialog keyboard contract', () => {
  it('moves focus into the panel when it opens', async () => {
    await openPanel();

    await vi.waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'First' }));
    });
  });

  it('closes on Escape', async () => {
    const { user, onClose } = await openPanel();

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('leaves Escape alone when the panel owns it', async () => {
    const onClose = vi.fn();
    const { user } = await openPanel(onClose, { closeOnEscape: false });

    await user.keyboard('{Escape}');

    expect(onClose).not.toHaveBeenCalled();
  });

  it('returns focus to whatever opened it', async () => {
    const { user } = await openPanel();

    await user.keyboard('{Escape}');

    await vi.waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open' }));
    });
  });

  // Without this, Tab walks straight out of the dialog and onto the page
  // behind it, which a sighted mouse user never sees and a keyboard user
  // cannot recover from without knowing the panel is still open.
  it('keeps Tab inside the panel, in both directions', async () => {
    const { user } = await openPanel();
    const first = screen.getByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });

    await vi.waitFor(() => expect(document.activeElement).toBe(first));

    await user.tab();
    expect(document.activeElement).toBe(last);

    await user.tab();
    expect(document.activeElement).toBe(first);

    await user.tab({ shift: true });
    expect(document.activeElement).toBe(last);
  });

  it('does not let Tab escape a panel with nothing focusable in it', async () => {
    const { user } = await openPanel(vi.fn(), { empty: true });
    const behind = screen.getByRole('button', { name: 'Behind' });

    await user.tab();

    expect(document.activeElement).not.toBe(behind);
  });
});

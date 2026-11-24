import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Dialog, DialogContent, DialogTitle } from '../Dialog';
import { AlertDialog, AlertDialogContent, AlertDialogTitle } from '../AlertDialog';
import { PromptDialog } from '../PromptDialog';

function captureDialogDiagnostics(renderDialog: () => void): string {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  renderDialog();
  const diagnostics = [...error.mock.calls, ...warn.mock.calls].flat().join(' ');
  error.mockRestore();
  warn.mockRestore();
  return diagnostics;
}

describe('Dialog', () => {
  it('renders a close button by default', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Settings</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeTruthy();
  });

  it('returns focus to the replacement control when the opener remounts', async () => {
    function Harness({ open, layout }: { open: boolean; layout: string }) {
      return (
        <>
          <button key={layout} id="open-settings" type="button">
            Open settings
          </button>
          <Dialog open={open}>
            <DialogContent>
              <DialogTitle>Settings</DialogTitle>
            </DialogContent>
          </Dialog>
        </>
      );
    }

    const { rerender } = render(<Harness open={false} layout="wide" />);
    const opener = screen.getByRole('button', { name: 'Open settings' });
    opener.focus();
    rerender(<Harness open layout="wide" />);
    await screen.findByRole('dialog');
    rerender(<Harness open layout="narrow" />);
    expect(opener.isConnected).toBe(false);
    rerender(<Harness open={false} layout="narrow" />);

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open settings' })),
    );
  });

  it('hides the close button when hideCloseButton is set', () => {
    render(
      <Dialog open>
        <DialogContent hideCloseButton>
          <DialogTitle>Settings</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.queryByRole('button', { name: 'Close dialog' })).toBeNull();
  });

  it('honours a custom closeLabel', () => {
    render(
      <Dialog open>
        <DialogContent closeLabel="Dismiss">
          <DialogTitle>Settings</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
  });

  it('can render critical native dialogs without keyframe visibility dependencies', () => {
    render(
      <Dialog open>
        <DialogContent disableAnimation>
          <DialogTitle>Native settings</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.className).not.toContain('animate-in');
    expect(dialog.previousElementSibling?.className).not.toContain('animate-in');
  });

  it('caps dialogs and alert dialogs to the dynamic viewport', () => {
    const { unmount } = render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Settings</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole('dialog').className).toContain('max-h-[calc(100dvh-2rem)]');
    unmount();

    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>Delete account</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>,
    );

    expect(screen.getByRole('alertdialog').className).toContain('max-h-[calc(100dvh-2rem)]');
  });

  it('keeps PromptDialog description registered with Radix', () => {
    const diagnostics = captureDialogDiagnostics(() => {
      render(
        <PromptDialog
          open
          onOpenChange={vi.fn()}
          title="Rename"
          description="Choose a new name"
          onConfirm={vi.fn()}
        />,
      );
    });

    expect(diagnostics).not.toMatch(/requires a `DialogTitle`|Missing `Description`/);
  });
});

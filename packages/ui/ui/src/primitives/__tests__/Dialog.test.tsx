import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Dialog, DialogContent, DialogTitle } from '../Dialog';
import { AccessibleDialog } from '../AccessibleDialog';
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

  it('keeps AccessibleDialog title and description registered with Radix', () => {
    const diagnostics = captureDialogDiagnostics(() => {
      render(
        <AccessibleDialog
          open
          onOpenChange={vi.fn()}
          title="Account settings"
          description="Manage your account"
        >
          Content
        </AccessibleDialog>,
      );
    });

    expect(diagnostics).not.toMatch(/requires a `DialogTitle`|Missing `Description`/);
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

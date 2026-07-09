import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Dialog, DialogContent, DialogTitle } from '../Dialog';

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
});

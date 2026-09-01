import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '../Sheet';

describe('Sheet', () => {
  it('renders content when open', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>Adjust your preferences.</SheetDescription>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('Adjust your preferences.')).toBeTruthy();
  });

  it('marks the open sheet as a modal dialog', () => {
    render(
      <Sheet open>
        <SheetContent side="left">
          <SheetTitle>Navigation</SheetTitle>
        </SheetContent>
      </Sheet>,
    );

    const sheet = screen.getByRole('dialog');
    expect(sheet.getAttribute('aria-modal')).toBe('true');
    expect(sheet.getAttribute('data-state')).toBe('open');
  });

  it('lets a call site drop aria-modal for a non-modal sheet', () => {
    render(
      <Sheet open modal={false}>
        <SheetContent side="left" aria-modal={undefined}>
          <SheetTitle>Navigation</SheetTitle>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBeNull();
  });
});

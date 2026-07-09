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
});

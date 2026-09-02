import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '../Button';

describe('Button', () => {
  it('renders a plain button with no loading affordances by default', () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('aria-busy')).toBeNull();
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('reflects loading state via aria-busy, disabled, and an sr-only message', () => {
    render(<Button isLoading>Save</Button>);
    const btn = screen.getByRole('button', { name: /Save/ });
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Loading, please wait')).toBeTruthy();
  });

  it('uses the provided aria-label as the accessible name for icon-only buttons', () => {
    render(
      <Button aria-label="Close">
        <svg data-testid="icon" />
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('falls back to a visually-hidden label when an icon-only button has no name', () => {
    render(
      <Button>
        <svg data-testid="icon" />
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Button' })).toBeTruthy();
  });

  it('recognizes text nested inside a wrapper element and skips the generic fallback', () => {
    render(
      <Button>
        <span className="truncate">Continue</span>
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(screen.queryByText('Button')).toBeNull();
  });
});

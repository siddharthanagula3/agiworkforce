import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Alert } from '../Alert';

describe('Alert', () => {
  it('announces politely by default', () => {
    render(<Alert>Heads up</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert.getAttribute('aria-live')).toBe('polite');
    expect(alert.getAttribute('aria-atomic')).toBe('true');
  });

  it('announces assertively for the destructive variant', () => {
    render(<Alert variant="destructive">Boom</Alert>);
    expect(screen.getByRole('alert').getAttribute('aria-live')).toBe('assertive');
  });

  it('applies success variant styling', () => {
    render(<Alert variant="success">Done</Alert>);
    expect(screen.getByRole('alert').className).toContain('border-green-500/50');
  });

  it('applies warning variant styling', () => {
    render(<Alert variant="warning">Careful</Alert>);
    expect(screen.getByRole('alert').className).toContain('border-yellow-500/50');
  });

  it('lets callers override aria-live', () => {
    render(
      <Alert variant="destructive" aria-live="polite">
        Quiet
      </Alert>,
    );
    expect(screen.getByRole('alert').getAttribute('aria-live')).toBe('polite');
  });
});

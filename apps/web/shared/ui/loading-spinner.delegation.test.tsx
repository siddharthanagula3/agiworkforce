import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { spinnerVariants } from '@agiworkforce/ui';
import LoadingSpinner from './loading-spinner';

describe('LoadingSpinner delegates to the shared Spinner primitive', () => {
  it('forwards arbitrary DOM props through to the rendered element', () => {
    render(<LoadingSpinner id="page-spinner" data-testid="spinner" aria-live="polite" />);

    const spinner = screen.getByTestId('spinner');
    expect(spinner).toHaveAttribute('id', 'page-spinner');
    expect(spinner).toHaveAttribute('aria-live', 'polite');
  });

  it('lets a caller override the default accessible name', () => {
    render(<LoadingSpinner aria-label="Loading models" />);

    expect(screen.getByRole('status', { name: 'Loading models' })).toBeInTheDocument();
  });

  it('renders the primitive class contract for every size alias', () => {
    render(
      <>
        <LoadingSpinner size="sm" data-testid="sm" />
        <LoadingSpinner size="md" data-testid="md" />
        <LoadingSpinner size="lg" data-testid="lg" />
      </>,
    );

    expect(screen.getByTestId('sm').className).toBe(spinnerVariants({ size: 'sm' }));
    expect(screen.getByTestId('md').className).toBe(spinnerVariants({ size: 'default' }));
    expect(screen.getByTestId('lg').className).toBe(spinnerVariants({ size: 'lg' }));
  });
});

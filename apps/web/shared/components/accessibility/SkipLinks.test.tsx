import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SkipLinks } from './SkipLinks';

describe('SkipLinks', () => {
  it('points the default skip link at the root layout main-content target', () => {
    render(<SkipLinks />);

    const mainLink = screen.getByRole('link', { name: 'Skip to main content' });
    expect(mainLink).toHaveAttribute('href', '#main-content');
    expect(screen.queryByRole('link', { name: 'Skip to navigation' })).not.toBeInTheDocument();
  });
});

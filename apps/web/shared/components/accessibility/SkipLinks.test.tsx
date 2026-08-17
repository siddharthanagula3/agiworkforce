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

  it('offsets the focus ring against the page background, not a hardcoded black', () => {
    render(<SkipLinks />);

    const mainLink = screen.getByRole('link', { name: 'Skip to main content' });
    expect(mainLink.className).toContain('focus:ring-offset-background');
    expect(mainLink.className).not.toContain('ring-offset-black');
  });
});

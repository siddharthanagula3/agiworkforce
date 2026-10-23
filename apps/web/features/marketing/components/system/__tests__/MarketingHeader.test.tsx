import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('@shared/components/agi/AgiMark', () => ({ AgiMark: () => null }));

import { MarketingHeader } from '../MarketingHeader';

describe('MarketingHeader', () => {
  it('offers the Products, Solutions and Resources menus and a Pricing link in one named navigation', () => {
    render(<MarketingHeader />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });

    const triggers = within(nav)
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(triggers).toEqual(['Products', 'Solutions', 'Resources']);
    expect(within(nav).getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/pricing');
  });

  it('shows no language selector or social link on a marketing page', () => {
    render(<MarketingHeader />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /language|english/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /twitter|^x$|github|linkedin/i })).toBeNull();
  });
});

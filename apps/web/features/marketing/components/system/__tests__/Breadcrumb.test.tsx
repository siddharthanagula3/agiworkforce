import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Breadcrumb } from '../Breadcrumb';

describe('Breadcrumb', () => {
  it('links every step but the last, and marks the last as the current page', () => {
    render(
      <Breadcrumb
        items={[
          { label: 'Help', href: '/help' },
          { label: 'Account' },
          { label: 'Reset a password', href: '/help/reset' },
        ]}
      />,
    );
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const items = within(nav).getAllByRole('listitem');

    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/help']);
    expect(items.map((item) => item.textContent)).toEqual(['Help', 'Account', 'Reset a password']);
    expect(items.at(-1)).toHaveAttribute('aria-current', 'page');
    expect(items.slice(0, -1).some((item) => item.hasAttribute('aria-current'))).toBe(false);
  });
});

import { render, screen } from '@testing-library/react';
import { PRODUCT_BRAND } from '@agiworkforce/types';
import { describe, expect, it } from 'vitest';

import { SidebarWordmark } from '../SidebarWordmark';

const HOME_LINK = `${PRODUCT_BRAND} home`;

describe('SidebarWordmark', () => {
  it('keeps the mark at full size inside a link that does not shrink', () => {
    const { container } = render(<SidebarWordmark />);

    expect(screen.getByRole('link', { name: HOME_LINK })).toHaveClass('shrink-0');
    expect(container.querySelector('img.agi-mark')).toHaveClass('shrink-0');
  });

  it('shows the mark alone, naming the product only to assistive technology', () => {
    render(<SidebarWordmark />);

    expect(screen.getByRole('link', { name: HOME_LINK })).toHaveTextContent('');
    expect(screen.queryByText(PRODUCT_BRAND)).toBeNull();
  });

  it('uses the product typeface rather than a serif override', () => {
    render(<SidebarWordmark />);

    expect(screen.getByRole('link', { name: HOME_LINK }).getAttribute('style')).toBeNull();
  });
});

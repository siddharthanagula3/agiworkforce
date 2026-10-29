import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SidebarWordmark } from '../SidebarWordmark';

describe('SidebarWordmark', () => {
  it('keeps the product name on one line and the mark at full size', () => {
    const { container } = render(<SidebarWordmark />);

    expect(screen.getByText('AGI')).toHaveClass('whitespace-nowrap');
    expect(screen.getByRole('link', { name: 'AGI home' })).toHaveClass('shrink-0');
    expect(container.querySelector('img.agi-mark')).toHaveClass('shrink-0');
  });

  it('shows the name only when its container has room, leaving the mark alone beside window controls', () => {
    render(<SidebarWordmark />);

    expect(screen.getByText('AGI')).toHaveClass('hidden', '@[7rem]:inline');
  });

  it('uses the product typeface rather than a serif override', () => {
    render(<SidebarWordmark />);

    expect(screen.getByText('AGI').getAttribute('style')).toBeNull();
  });
});

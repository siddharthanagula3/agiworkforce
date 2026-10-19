import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SidebarWordmark } from '../SidebarWordmark';

describe('SidebarWordmark', () => {
  it('keeps the product name on one line when the sidebar is narrowed by a window inset', () => {
    const { container } = render(<SidebarWordmark />);

    expect(screen.getByText('AGI Workforce')).toHaveClass('whitespace-nowrap');
    expect(screen.getByRole('link', { name: 'AGI Workforce home' })).toHaveClass('min-w-0');
    expect(container.querySelector('svg')).toHaveClass('shrink-0');
  });
});

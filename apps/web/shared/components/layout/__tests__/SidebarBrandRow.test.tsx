import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/notifications/components/NotificationBell', () => ({
  NotificationBell: () => <button type="button">bell</button>,
}));

import { SidebarBrandRow } from '../SidebarBrandRow';

describe('SidebarBrandRow', () => {
  it('is the container the wordmark measures, so the name steps aside before it reaches the bell', () => {
    render(<SidebarBrandRow />);

    const row = screen.getByRole('link', { name: 'AGI home' }).parentElement;
    expect(row).toHaveClass('@container', 'justify-between');
    expect(row).toContainElement(screen.getByRole('button', { name: 'bell' }));
  });
});

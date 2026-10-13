import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SharedScheduleNotFound from './not-found';

describe('SharedScheduleNotFound', () => {
  it('identifies the visible not-found main around the actual schedule explanation and recovery link', () => {
    render(<SharedScheduleNotFound />);

    const main = screen.getByRole('main');
    expect(main.tagName).toBe('MAIN');
    expect(main).toHaveAttribute('id', 'main-content');
    const states = document.querySelectorAll('[data-route-state="not-found"]');
    expect(states).toHaveLength(1);
    expect(states[0]).toBe(main);
    expect(main).toBeVisible();
    expect(
      within(main).getByRole('heading', { level: 1, name: 'Shared schedule unavailable' }),
    ).toBeVisible();
    expect(within(main).getByText(/revoked or entered incorrectly/i)).toBeVisible();
    expect(within(main).getByRole('link', { name: 'Open AGI' })).toHaveAttribute('href', '/');
  });
});

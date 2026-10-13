import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SharedConversationNotFound from './not-found';

describe('SharedConversationNotFound', () => {
  it('places the unavailable-share heading, explanation and recovery link in one native main', () => {
    render(<SharedConversationNotFound />);

    const main = screen.getByRole('main');
    expect(main.tagName).toBe('MAIN');
    expect(main).toHaveAttribute('id', 'main-content');
    expect(
      within(main).getByRole('heading', { level: 1, name: 'Shared conversation unavailable' }),
    ).toBeVisible();
    expect(
      within(main).getByText(/expired, been revoked, or been entered incorrectly/i),
    ).toBeVisible();
    expect(within(main).getByRole('link', { name: 'Open AGI' })).toHaveAttribute('href', '/');
  });
});

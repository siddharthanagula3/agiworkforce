import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ExpiredShareBanner } from './ExpiredShareBanner';

describe('ExpiredShareBanner', () => {
  it('does not imply that a revoked share is a broken site route', () => {
    render(<ExpiredShareBanner reason="unavailable" />);

    expect(screen.getByRole('heading')).toHaveTextContent('Shared conversation unavailable');
    expect(screen.getByText(/expired, been revoked, or been entered incorrectly/i)).toBeVisible();
  });

  it('describes expiration without claiming one fixed lifetime', () => {
    render(<ExpiredShareBanner />);

    expect(screen.getByRole('heading')).toHaveTextContent('Shared conversation expired');
    expect(screen.queryByText(/7 days/i)).toBeNull();
  });
});

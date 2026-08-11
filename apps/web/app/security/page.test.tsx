import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));

import SecurityPage from './page';

describe('SecurityPage', () => {
  it('exposes the two-line hero as one correctly spaced heading', () => {
    render(<SecurityPage />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Three boundaries, three different answers.',
      }),
    ).toBeVisible();
  });
});

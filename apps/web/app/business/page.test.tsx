import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));
vi.mock('@/features/marketing/components/Reveal', () => ({
  Reveal: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import BusinessPage from './page';

describe('BusinessPage', () => {
  it('renders one visible page-level heading in the hero', () => {
    render(<BusinessPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'AI work your team can govern.' }),
    ).toBeVisible();
  });
});

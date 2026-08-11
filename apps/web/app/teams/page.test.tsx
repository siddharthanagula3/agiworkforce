import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));
vi.mock('@/features/marketing/components/Reveal', () => ({
  Reveal: ({ children }: { children: ReactNode }) => children,
}));

import TeamsPage from './page';

describe('TeamsPage', () => {
  it('routes Team buyers to self-serve seat selection while keeping Enterprise sales separate', () => {
    render(<TeamsPage />);

    expect(screen.getByRole('link', { name: 'Choose Team seats' })).toHaveAttribute(
      'href',
      '/pricing#pricing-team-title',
    );
    expect(screen.getByRole('link', { name: 'Start with 2 seats' })).toHaveAttribute(
      'href',
      '/pricing#pricing-team-title',
    );
    expect(screen.getAllByRole('link', { name: 'Enterprise sales' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Team & Enterprise access/i })).toBeNull();
  });
});

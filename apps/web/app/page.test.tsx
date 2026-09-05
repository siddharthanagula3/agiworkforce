import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/marketing/components/MarketingLanding', () => ({
  MarketingLanding: () => <div data-testid="marketing-landing" />,
}));

import Home from './page';

describe('root page', () => {
  it('renders the marketing landing for the signed-out request', () => {
    render(<Home />);

    expect(screen.getByTestId('marketing-landing')).toBeVisible();
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/marketing/components/landing/LandingPage', () => ({
  LandingPage: () => <div data-testid="landing-page" />,
}));

import Home from './page';

describe('root page', () => {
  it('renders the landing page for the signed-out request', () => {
    render(<Home />);

    expect(screen.getByTestId('landing-page')).toBeVisible();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthShell } from '@/features/marketing/components/AuthShell';

vi.mock('@shared/components/layout/Header', () => ({
  Header: ({ minimal }: { minimal?: boolean }) => (
    <header data-testid="header" data-minimal={String(minimal ?? false)} />
  ),
}));

vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => <footer data-testid="footer" />,
}));

vi.mock('@shared/components/agi/AgiMark', () => ({
  AgiMark: ({ size }: { size?: number }) => <svg data-testid="agi-mark" data-size={size} />,
}));

describe('AuthShell', () => {
  it('renders only the sign-in card as a single centered column', () => {
    render(
      <AuthShell>
        <div data-testid="clerk-card" />
      </AuthShell>,
    );

    const card = screen.getByTestId('clerk-card').closest('.agi-ds-auth-card');
    expect(card).not.toBeNull();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('uses the minimal header so nothing competes with the sign-in form', () => {
    render(
      <AuthShell>
        <div />
      </AuthShell>,
    );

    expect(screen.getByTestId('header')).toHaveAttribute('data-minimal', 'true');
  });

  it('removes marketing chrome for an embedded Desktop sign-in window', () => {
    render(
      <AuthShell embedded>
        <div data-testid="clerk-card" />
      </AuthShell>,
    );

    expect(screen.getByTestId('desktop-auth-shell')).toBeVisible();
    expect(screen.getByTestId('clerk-card')).toBeVisible();
    expect(screen.queryByTestId('header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('footer')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('agi-mark')).toHaveLength(1);
    expect(screen.getByText('AGI Desktop')).toBeInTheDocument();
    expect(screen.getByText('Secure Cloud sign-in')).toBeInTheDocument();
    expect(screen.getByText('Local Mode stays available without an account.')).toBeInTheDocument();
  });
});

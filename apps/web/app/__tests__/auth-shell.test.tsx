import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthShell } from '@/features/marketing/components/AuthShell';
import { SURFACE_STATUS } from '@/lib/marketing-constants';

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

const shellProps = {
  title: 'Welcome back.',
  lede: 'Sign in to pick up your chats, projects, and artifacts.',
  points: ['One account across surfaces', 'Local Mode never requires an account'],
};

describe('AuthShell', () => {
  it('renders the auth card before the brand panel in DOM order', () => {
    render(
      <AuthShell {...shellProps}>
        <div data-testid="clerk-card" />
      </AuthShell>,
    );

    const card = screen.getByTestId('clerk-card').closest('.agi-ds-auth-card');
    const brand = screen.getByRole('complementary', { name: 'Why AGI' });
    expect(card).not.toBeNull();
    expect(card!.compareDocumentPosition(brand) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders title, lede, trust points, and the surface ledger', () => {
    render(
      <AuthShell {...shellProps}>
        <div />
      </AuthShell>,
    );

    expect(screen.getByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument();
    expect(
      screen.getByText('Sign in to pick up your chats, projects, and artifacts.'),
    ).toBeInTheDocument();
    for (const point of shellProps.points) {
      expect(screen.getByText(point)).toBeInTheDocument();
    }
    expect(screen.getByText('What this account gives you today')).toBeInTheDocument();
    const ledger = screen.getByRole('list', { name: 'Surface availability' });
    expect(ledger).toHaveTextContent('Web');
    expect(ledger).toHaveTextContent(
      `${SURFACE_STATUS.web}: sign in here to pick up where you left off.`,
    );
    expect(ledger).toHaveTextContent('CLI');
    expect(ledger).toHaveTextContent(
      `${SURFACE_STATUS.cli}: five signed v1.0.0 archives on /download, same account.`,
    );
    expect(ledger).toHaveTextContent('Desktop');
    expect(ledger).toHaveTextContent(
      'A Linux build exists as a release artifact and is pending its signature check. No macOS or Windows date yet.',
    );
    expect(ledger).toHaveTextContent('Mobile');
    expect(ledger).toHaveTextContent('Not shipped: no listing on the App Store or Google Play.');
  });

  it('uses the minimal header so nothing competes with the sign-in form', () => {
    render(
      <AuthShell {...shellProps}>
        <div />
      </AuthShell>,
    );

    expect(screen.getByTestId('header')).toHaveAttribute('data-minimal', 'true');
  });

  it('removes marketing chrome for an embedded Desktop sign-in window', () => {
    render(
      <AuthShell {...shellProps} embedded>
        <div data-testid="clerk-card" />
      </AuthShell>,
    );

    expect(screen.getByTestId('desktop-auth-shell')).toBeVisible();
    expect(screen.getByTestId('clerk-card')).toBeVisible();
    expect(screen.queryByTestId('header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('footer')).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Why AGI' })).not.toBeInTheDocument();
    expect(screen.getAllByTestId('agi-mark')).toHaveLength(1);
    expect(screen.getByText('AGI Desktop')).toBeInTheDocument();
    expect(screen.getByText('Secure Cloud sign-in')).toBeInTheDocument();
    expect(screen.getByText('Local Mode stays available without an account.')).toBeInTheDocument();
  });
});

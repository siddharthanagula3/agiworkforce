/**
 * AuthShell composition tests (/login and /signup share this shell).
 *
 * The 2026-07 auth-page rework made two structural promises:
 * 1. The Clerk card renders BEFORE the brand panel in the DOM — auth leads
 *    focus order, and the single-column mobile layout stacks the card first
 *    (grid placement moves the brand panel left only on desktop).
 * 2. The brand panel keeps its full content: title, lede, trust points, and
 *    the surface meta line.
 * jsdom has no layout engine, so DOM order is the testable contract behind
 * the responsive stacking; the visual breakpoints live in globals.css.
 */
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

    const card = screen.getByTestId('clerk-card').closest('.agi-auth-card');
    const brand = screen.getByRole('complementary', { name: 'Why AGI' });
    expect(card).not.toBeNull();
    // compareDocumentPosition: FOLLOWING means brand comes after the card.
    expect(card!.compareDocumentPosition(brand) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders title, lede, trust points, and the surface meta line', () => {
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
    expect(screen.getByText('One account. Three surfaces.')).toBeInTheDocument();
    const surfaceList = screen.getByRole('list', { name: 'AGI account surfaces' });
    expect(surfaceList).toHaveTextContent('Web');
    expect(surfaceList).toHaveTextContent('Desktop');
    expect(surfaceList).toHaveTextContent('Mobile');
    expect(screen.getByText('Web · Desktop · Mobile · CLI · Chrome · VS Code')).toBeInTheDocument();
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
    expect(screen.getByText('AGI Desktop')).toBeInTheDocument();
    expect(screen.getByText('Secure Cloud sign-in')).toBeInTheDocument();
    expect(screen.getByText('Local Mode stays available without an account.')).toBeInTheDocument();
  });
});

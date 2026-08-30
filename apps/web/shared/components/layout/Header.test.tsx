import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from './Header';

const clerkState = vi.hoisted(() => ({
  user: null as null | { primaryEmailAddress?: { emailAddress?: string } },
  isLoaded: true,
  signOut: vi.fn(),
  storeLogout: vi.fn(),
}));

vi.mock('@shared/stores/authentication-store', () => ({
  useAuthStore: { getState: () => ({ logout: clerkState.storeLogout }) },
}));

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ user: clerkState.user, isLoaded: clerkState.isLoaded }),
  useClerk: () => ({ signOut: clerkState.signOut }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        agiHome: 'AGI home',
        menuClose: 'Close menu',
        menuOpen: 'Open menu',
        navAgiCode: 'AGI Code',
        navApps: 'Apps',
        navBusiness: 'Business',
        navChat: 'Chat',
        navCompare: 'Compare',
        navContactSales: 'Contact Sales',
        navInstall: 'Install',
        navPricing: 'Pricing',
        navSignIn: 'Sign In',
        navSignOut: 'Sign Out',
      })[key] ?? key,
  }),
}));

describe('Header', () => {
  beforeEach(() => {
    clerkState.user = null;
    clerkState.isLoaded = true;
    clerkState.signOut.mockResolvedValue(undefined);
    vi.clearAllMocks();
  });

  it('exposes the navigation target used by accessible navigation', () => {
    render(<Header />);

    expect(screen.getByRole('navigation', { name: 'Primary' })).toHaveAttribute(
      'id',
      'main-navigation',
    );
  });

  it('closes the mobile menu before signing out', async () => {
    clerkState.user = {
      primaryEmailAddress: { emailAddress: 'user@example.com' },
    };
    const { container } = render(<Header />);

    const openMenuButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Open menu"]',
    );
    expect(openMenuButton).not.toBeNull();
    fireEvent.click(openMenuButton!);

    expect(container.querySelector('button[aria-label="Close menu"]')).not.toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: 'Sign Out' }).at(-1)!);

    await waitFor(() => {
      expect(clerkState.signOut).toHaveBeenCalledWith({ redirectUrl: '/' });
    });
    expect(container.querySelector('button[aria-label="Close menu"]')).toBeNull();
  });

  it('provides an in-drawer close control and restores focus to the opener', async () => {
    render(<Header />);

    const openMenuButton = screen.getByRole('button', { name: 'Open menu' });
    fireEvent.click(openMenuButton);

    const navigationDialog = screen.getByRole('dialog', { name: 'navProducts' });
    expect(navigationDialog).toBeInTheDocument();
    const closeMenuButton = within(navigationDialog).getByRole('button', { name: 'Close menu' });
    expect(closeMenuButton).toHaveFocus();

    fireEvent.click(closeMenuButton);

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'navProducts' })).not.toBeInTheDocument();
      expect(openMenuButton).toHaveFocus();
    });
  });
});

describe('Header sign-out', () => {
  beforeEach(() => {
    clerkState.user = { primaryEmailAddress: { emailAddress: 'someone@example.com' } };
    clerkState.isLoaded = true;
    clerkState.signOut.mockClear();
    clerkState.storeLogout.mockClear();
    clerkState.storeLogout.mockResolvedValue(undefined);
  });

  it('purges this browser of the account it is signing out before Clerk redirects', async () => {
    render(<Header />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Sign Out' })[0]!);

    await waitFor(() => expect(clerkState.signOut).toHaveBeenCalled());
    expect(clerkState.storeLogout).toHaveBeenCalled();
    expect(clerkState.storeLogout.mock.invocationCallOrder[0]!).toBeLessThan(
      clerkState.signOut.mock.invocationCallOrder[0]!,
    );
  });
});

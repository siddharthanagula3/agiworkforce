import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type React from 'react';

import AuthDevicePage from './page';

const authState = vi.hoisted(() => ({
  isLoaded: true,
  isSignedIn: true,
  signOut: vi.fn(),
  user: {
    fullName: 'Ada Lovelace',
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    primaryEmailAddress: { emailAddress: 'ada@example.com' },
    emailAddresses: [{ emailAddress: 'ada@example.com' }],
  },
}));

const searchState = vi.hoisted(() => ({
  userCode: 'ABCD-1234',
  surface: null as string | null,
}));

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({
    isLoaded: authState.isLoaded,
    isSignedIn: authState.isSignedIn,
    user: authState.isSignedIn ? authState.user : null,
  }),
  useClerk: () => ({ signOut: authState.signOut }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => {
      if (key === 'user_code') return searchState.userCode;
      if (key === 'surface') return searchState.surface;
      return null;
    },
  }),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('@shared/components/layout/Header', () => ({
  Header: ({ minimal }: { minimal?: boolean }) => (
    <header data-testid="header" data-minimal={String(minimal ?? false)}>
      Header
    </header>
  ),
}));

vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => <footer>Footer</footer>,
}));

describe('/auth/device page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authState.isLoaded = true;
    authState.isSignedIn = true;
    authState.signOut.mockReset();
    authState.signOut.mockResolvedValue(undefined);
    searchState.userCode = 'ABCD-1234';
    searchState.surface = null;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.startsWith('/api/auth/device/code?')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                user_code: 'ABCD-1234',
                client: { name: 'AGI for VS Code', type: 'vscode' },
                scopes: [
                  {
                    id: 'account:read',
                    label: 'Account identity and plan',
                    description:
                      'Read the account name, email, plan, and usage shown in this client.',
                  },
                  {
                    id: 'managed-cloud:use',
                    label: 'AGI Managed Cloud',
                    description:
                      'Use account-backed AGI Cloud features on this device, subject to plan and workspace permissions.',
                  },
                ],
                expires_at: '2099-08-01T00:00:00.000Z',
              }),
          } as Partial<Response>);
        }
        return Promise.reject(new Error(`Unexpected request: ${url}`));
      }),
    );
  });

  it('does not call protected approval APIs while signed out', () => {
    authState.isSignedIn = false;
    const fetchMock = vi.mocked(fetch);

    render(<AuthDevicePage />);

    expect(screen.getAllByRole('alert')[0]).toHaveTextContent(
      'Sign in before approving this device request.',
    );
    expect(screen.getByRole('button', { name: 'Sign in required' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?redirectTo=%2Fauth%2Fdevice%3Fuser_code%3DABCD-1234',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('formats pasted device codes before submitting', () => {
    searchState.userCode = '';
    render(<AuthDevicePage />);

    fireEvent.change(screen.getByLabelText('Device code'), {
      target: { value: 'abcd1234' },
    });

    expect(screen.getByLabelText('Device code')).toHaveValue('ABCD-1234');
  });

  it('isolates the approval card from the full-bleed marketing section layout', () => {
    render(<AuthDevicePage />);

    const card = screen.getByRole('heading', { name: 'Connect a device.' }).closest('section');

    expect(card).toHaveClass('agi-device-auth-card');
    expect(card).not.toHaveClass('agi-section');
  });

  it('keeps the approval card readable at desktop and narrow viewport widths', () => {
    const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8');
    const rule = css.match(/\[data-design='agi'\] \.agi-device-auth-card\s*\{([\s\S]*?)\}/);
    const declarations = rule?.[1] ?? '';

    expect(declarations).toContain('width: 100%');
    expect(declarations).toContain('max-width: 30rem');
    expect(declarations).toContain('padding: clamp(');
  });

  it('uses focused chrome so navigation does not compete with device approval', () => {
    render(<AuthDevicePage />);

    expect(screen.getByTestId('header')).toHaveAttribute('data-minimal', 'true');
    expect(screen.getByText(/verified requesting app below/i)).toBeVisible();
  });

  it('shows the signed-in identity, verified client, requested scopes, and legal links', async () => {
    render(<AuthDevicePage />);

    expect(screen.getByLabelText('Signed-in account')).toHaveTextContent('Ada Lovelace');
    expect(screen.getByLabelText('Signed-in account')).toHaveTextContent('ada@example.com');
    expect(await screen.findByRole('heading', { name: 'AGI for VS Code' })).toBeVisible();
    expect(screen.getByText('Account identity and plan')).toBeVisible();
    expect(screen.getByText('AGI Managed Cloud')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
      'href',
      '/terms',
    );
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });

  it('signs out before switching to a different account', async () => {
    render(<AuthDevicePage />);

    fireEvent.click(screen.getByRole('button', { name: 'Use a different account' }));

    await waitFor(() => {
      expect(authState.signOut).toHaveBeenCalledWith({
        redirectUrl: '/login?redirectTo=%2Fauth%2Fdevice%3Fuser_code%3DABCD-1234',
      });
    });
  });

  it('renders a dedicated in-app Desktop surface and preserves it through sign-in', () => {
    authState.isSignedIn = false;
    searchState.surface = 'desktop';

    render(<AuthDevicePage />);

    expect(screen.getByTestId('desktop-device-auth-shell')).toBeVisible();
    expect(screen.queryByTestId('header')).not.toBeInTheDocument();
    expect(screen.queryByText('Footer')).not.toBeInTheDocument();
    expect(screen.getByText('Close this window to cancel.')).toBeVisible();
    expect(screen.queryByRole('link', { name: /compare plans/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?surface=desktop&redirectTo=%2Fauth%2Fdevice%3Fuser_code%3DABCD-1234%26surface%3Ddesktop',
    );
  });

  it('directs the user back to the requesting app after approval', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.startsWith('/api/auth/device/code?')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                user_code: 'ABCD-1234',
                client: { name: 'AGI for VS Code', type: 'vscode' },
                scopes: [
                  { id: 'account:read', label: 'Account identity', description: 'Read identity.' },
                ],
                expires_at: '2099-08-01T00:00:00.000Z',
              }),
          } as Partial<Response>);
        }
        if (url === '/api/csrf') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ token: 'csrf-token' }),
          } as Partial<Response>);
        }
        if (url === '/api/auth/device/approve') {
          return Promise.resolve({ ok: true } as Partial<Response>);
        }
        return Promise.reject(new Error(`Unexpected request: ${url}`));
      }),
    );

    render(<AuthDevicePage />);
    await screen.findByRole('heading', { name: 'AGI for VS Code' });
    fireEvent.click(screen.getByRole('button', { name: 'Approve device' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Return to the app that opened this page; sign-in will finish automatically.',
      );
    });
  });

  it('renders structured approval errors without object text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.startsWith('/api/auth/device/code?')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                user_code: 'ABCD-1234',
                client: { name: 'AGI for VS Code', type: 'vscode' },
                scopes: [
                  { id: 'account:read', label: 'Account identity', description: 'Read identity.' },
                ],
                expires_at: '2099-08-01T00:00:00.000Z',
              }),
          } as Partial<Response>);
        }
        if (url === '/api/csrf') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ token: 'csrf-token' }),
          } as Partial<Response>);
        }

        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: { message: 'Code not found or expired' } }),
        } as Partial<Response>);
      }),
    );

    render(<AuthDevicePage />);
    await screen.findByRole('heading', { name: 'AGI for VS Code' });
    fireEvent.click(screen.getByRole('button', { name: 'Approve device' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Code not found or expired');
    });
    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument();
  });
});

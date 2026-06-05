import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';

import AuthDevicePage from './page';

const authState = vi.hoisted(() => ({
  isLoaded: true,
  isSignedIn: true,
}));

const searchState = vi.hoisted(() => ({
  userCode: 'ABCD-1234',
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: authState.isLoaded, isSignedIn: authState.isSignedIn }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === 'user_code' ? searchState.userCode : null),
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

vi.mock('@/components/layout/Header', () => ({
  Header: () => <header>Header</header>,
}));

vi.mock('@/components/marketing/MarketingFooter', () => ({
  MarketingFooter: () => <footer>Footer</footer>,
}));

describe('/auth/device page', () => {
  beforeEach(() => {
    authState.isLoaded = true;
    authState.isSignedIn = true;
    searchState.userCode = 'ABCD-1234';
    vi.restoreAllMocks();
  });

  it('does not call protected approval APIs while signed out', () => {
    authState.isSignedIn = false;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

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

  it('renders structured approval errors without object text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Approve device' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Code not found or expired');
    });
    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument();
  });
});

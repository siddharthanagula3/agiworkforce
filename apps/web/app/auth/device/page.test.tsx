import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
  });

  it('directs the user back to the requesting app after approval', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: 'csrf-token' }),
        } as Partial<Response>)
        .mockResolvedValueOnce({
          ok: true,
        } as Partial<Response>),
    );

    render(<AuthDevicePage />);
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

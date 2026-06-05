import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';

import { VerifyDeviceClient } from './verify-client';

const authState = vi.hoisted(() => ({
  isLoaded: true,
  isSignedIn: true,
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: authState.isLoaded, isSignedIn: authState.isSignedIn }),
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

describe('VerifyDeviceClient', () => {
  beforeEach(() => {
    authState.isLoaded = true;
    authState.isSignedIn = true;
    vi.restoreAllMocks();
  });

  it('requires sign-in before showing device approval actions', () => {
    authState.isSignedIn = false;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<VerifyDeviceClient code="ABCD1234ABCD1234" />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Sign in before approving or denying this device request.',
    );
    expect(screen.getByRole('link', { name: 'Sign in to continue' })).toHaveAttribute(
      'href',
      '/login?redirectTo=%2Fverify%3Fcode%3DABCD1234ABCD1234',
    );
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders structured API errors without leaking object text', async () => {
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
          json: () => Promise.resolve({ error: { message: 'Authentication required' } }),
        } as Partial<Response>);
      }),
    );

    render(<VerifyDeviceClient code="ABCD1234ABCD1234" />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Authentication required');
    });
    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument();
  });
});

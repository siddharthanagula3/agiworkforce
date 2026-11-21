import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const flowProps = vi.hoisted(() => vi.fn());
const mocks = vi.hoisted(() => ({
  identity: vi.fn(async (): Promise<{ subject: string | null }> => ({ subject: null })),
  redirect: vi.fn(),
}));

vi.mock('@/lib/server/identity', () => ({ getRequestIdentity: () => mocks.identity() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    mocks.redirect(url);
    throw new Error(`redirect:${url}`);
  },
}));

vi.mock('@/features/auth/AuthFlow', () => ({
  AuthFlow: (props: Record<string, unknown>) => {
    flowProps(props);
    return <div data-testid="auth-flow" />;
  },
}));

vi.mock('@/features/auth/AuthLayout', () => ({
  AuthLayout: ({ embedded, children }: { embedded?: boolean; children: ReactNode }) => (
    <div data-testid="auth-layout" data-embedded={String(embedded ?? false)}>
      {children}
    </div>
  ),
}));

import LoginPage from '../login/page';
import SignupPage from './page';

function lastFlowProps(): Record<string, unknown> {
  return flowProps.mock.lastCall?.[0] as Record<string, unknown>;
}

function lastRedirects(): Record<string, string> {
  return lastFlowProps()['redirects'] as Record<string, string>;
}

describe('/signup', () => {
  beforeEach(() => {
    flowProps.mockClear();
    mocks.redirect.mockClear();
    mocks.identity.mockResolvedValue({ subject: null });
  });

  it('shows the same screen as /login, with the same ways in', async () => {
    const searchParams = Promise.resolve({ redirectTo: '/chat' });
    render(await LoginPage({ searchParams }));
    const { redirects: _loginRedirects, hostWayIn: _loginHost, ...fromLogin } = lastFlowProps();
    render(await SignupPage({ searchParams }));
    const { redirects: _signupRedirects, hostWayIn: _signupHost, ...fromSignup } = lastFlowProps();

    expect(fromSignup).toEqual(fromLogin);
    expect(lastFlowProps()).not.toHaveProperty('mode');
    expect(lastFlowProps()).not.toHaveProperty('optedOutBySignal');
  });

  it('sends an already-signed-in visitor through the existing terms-aware login gate', async () => {
    mocks.identity.mockResolvedValue({ subject: 'user_1' });

    await expect(
      SignupPage({ searchParams: Promise.resolve({ redirectTo: '/chat' }) }),
    ).rejects.toThrow('redirect:/login/complete?redirectTo=%2Fchat');
    expect(mocks.redirect).toHaveBeenCalledWith('/login/complete?redirectTo=%2Fchat');
    expect(flowProps).not.toHaveBeenCalled();
  });

  it('renders the form when the identity read fails', async () => {
    mocks.identity.mockRejectedValue(new Error('no session context'));

    render(await SignupPage({ searchParams: Promise.resolve({ redirectTo: '/chat' }) }));

    expect(screen.getByTestId('auth-flow')).toBeInTheDocument();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('finishes a new account at sign-up completion and an existing one at login completion', async () => {
    render(await SignupPage({ searchParams: Promise.resolve({ redirectTo: '/chat' }) }));

    expect(lastRedirects()).toEqual({
      signInCompleteUrl: '/login/complete?redirectTo=%2Fchat',
      signUpCompleteUrl: '/signup/complete?redirectTo=%2Fchat',
      ssoCallbackUrl: '/auth/sso-callback?redirectTo=%2Fchat',
    });
  });

  it('offers at least one provider, sourced from the shared catalogue', async () => {
    render(await SignupPage({ searchParams: Promise.resolve({ redirectTo: '/chat' }) }));

    const providers = lastFlowProps()['providers'] as { id: string; label: string }[];
    expect(providers.length).toBeGreaterThan(0);
    for (const provider of providers) {
      expect(provider.label.length).toBeGreaterThan(0);
    }
  });

  it('keeps account creation inside the embedded Desktop flow', async () => {
    const redirectTo = '/auth/device?user_code=ABCD-1234&surface=desktop';
    render(
      await SignupPage({
        searchParams: Promise.resolve({ redirectTo, surface: 'desktop' }),
      }),
    );

    expect(screen.getByTestId('auth-layout')).toHaveAttribute('data-embedded', 'true');
    expect(lastRedirects()).toEqual({
      signInCompleteUrl:
        '/login/complete?redirectTo=%2Fauth%2Fdevice%3Fuser_code%3DABCD-1234%26surface%3Ddesktop&surface=desktop',
      signUpCompleteUrl:
        '/signup/complete?redirectTo=%2Fauth%2Fdevice%3Fuser_code%3DABCD-1234%26surface%3Ddesktop',
      ssoCallbackUrl:
        '/auth/sso-callback?redirectTo=%2Fauth%2Fdevice%3Fuser_code%3DABCD-1234%26surface%3Ddesktop&surface=desktop',
    });
  });

  it('falls back to the chat destination when no target is given', async () => {
    render(await SignupPage({ searchParams: Promise.resolve({}) }));

    expect(lastRedirects()['signUpCompleteUrl']).toBe('/signup/complete?redirectTo=%2Fchat');
  });
});

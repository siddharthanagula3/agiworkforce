import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const flowProps = vi.hoisted(() => vi.fn());

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

import SignupPage from './page';

function lastRedirects(): Record<string, string> {
  const props = flowProps.mock.lastCall?.[0] as Record<string, unknown>;
  return props['redirects'] as Record<string, string>;
}

describe('/signup', () => {
  beforeEach(() => {
    flowProps.mockClear();
  });

  it('mounts the sign-up flow, which records the accepted terms version', async () => {
    render(await SignupPage({ searchParams: Promise.resolve({ redirectTo: '/chat' }) }));

    expect(screen.getByTestId('auth-flow')).toBeInTheDocument();
    expect(flowProps).toHaveBeenCalledWith(expect.objectContaining({ mode: 'signup' }));
    expect(lastRedirects()['completeUrl']).toBe('/signup/complete?redirectTo=%2Fchat');
  });

  it('offers at least one provider, sourced from the shared catalogue', async () => {
    render(await SignupPage({ searchParams: Promise.resolve({ redirectTo: '/chat' }) }));

    const props = flowProps.mock.lastCall?.[0] as Record<string, unknown>;
    const providers = props['providers'] as { id: string; label: string }[];
    expect(providers.length).toBeGreaterThan(0);
    for (const provider of providers) {
      expect(provider.label.length).toBeGreaterThan(0);
    }
  });

  it('keeps account creation and the return to sign-in inside the embedded Desktop flow', async () => {
    const redirectTo = '/auth/device?user_code=ABCD-1234&surface=desktop';
    render(
      await SignupPage({
        searchParams: Promise.resolve({ redirectTo, surface: 'desktop' }),
      }),
    );

    expect(screen.getByTestId('auth-layout')).toHaveAttribute('data-embedded', 'true');
    expect(lastRedirects()).toEqual({
      completeUrl:
        '/signup/complete?redirectTo=%2Fauth%2Fdevice%3Fuser_code%3DABCD-1234%26surface%3Ddesktop',
      switchUrl:
        '/login?surface=desktop&redirectTo=%2Fauth%2Fdevice%3Fuser_code%3DABCD-1234%26surface%3Ddesktop',
      ssoCallbackUrl:
        '/auth/sso-callback?redirectTo=%2Fauth%2Fdevice%3Fuser_code%3DABCD-1234%26surface%3Ddesktop&surface=desktop',
    });
  });

  it('falls back to the chat destination when no target is given', async () => {
    render(await SignupPage({ searchParams: Promise.resolve({}) }));

    expect(lastRedirects()['completeUrl']).toBe('/signup/complete?redirectTo=%2Fchat');
  });
});

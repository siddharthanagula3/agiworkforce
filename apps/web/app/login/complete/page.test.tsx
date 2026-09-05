import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  accepted: vi.fn(),
  redirect: vi.fn(),
  recorder: vi.fn(),
  continue: vi.fn(),
  gate: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: () => mocks.auth() }));
vi.mock('./StaleSessionRecovery', () => ({
  StaleSessionRecovery: (props: { loginUrl: string; alreadyRetried: boolean }) => (
    <div
      data-testid="stale-session-recovery"
      data-login-url={props.loginUrl}
      data-already-retried={String(props.alreadyRetried)}
    />
  ),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    mocks.redirect(url);
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock('@/lib/server/terms', () => ({
  hasAcceptedCurrentTerms: (userId: string) => mocks.accepted(userId),
}));
vi.mock('../../signup/TermsGate', async (importOriginal) => ({
  ...(await importOriginal()),
  TermsGate: ({ children, ...props }: { children: ReactNode }) => {
    mocks.gate(props);
    return <div data-testid="terms-gate">{children}</div>;
  },
}));
vi.mock('../../signup/complete/RecordTermsAcceptance', () => ({
  RecordTermsAcceptance: (props: Record<string, unknown>) => {
    mocks.recorder(props);
    return <div data-testid="terms-recorder" />;
  },
  ContinueWithCurrentTerms: (props: Record<string, unknown>) => {
    mocks.continue(props);
    return <div data-testid="terms-continue" />;
  },
}));

import LoginCompletePage from './page';

describe('/login/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user-1' });
    mocks.accepted.mockResolvedValue(false);
  });

  it('does not rewrite a current durable acceptance', async () => {
    mocks.accepted.mockResolvedValue(true);

    render(await LoginCompletePage({ searchParams: Promise.resolve({ redirectTo: '/chat' }) }));

    expect(mocks.accepted).toHaveBeenCalledWith('user-1');
    expect(mocks.recorder).not.toHaveBeenCalled();
    expect(mocks.continue).toHaveBeenCalledWith({ redirectTo: '/chat' });
  });

  it('requires missing or outdated acceptance on the login surface', async () => {
    render(await LoginCompletePage({ searchParams: Promise.resolve({ redirectTo: '/chat' }) }));

    expect(screen.getByTestId('terms-gate')).toBeInTheDocument();
    expect(screen.getByTestId('terms-recorder')).toBeInTheDocument();
    expect(mocks.recorder).toHaveBeenCalledWith({ redirectTo: '/chat', surface: 'web-login' });
    expect(mocks.gate).toHaveBeenCalledWith(
      expect.objectContaining({ restorePreAuthMarker: false }),
    );
  });

  // Redirecting straight back to /login is what produced an infinite loop:
  // /login renders <SignIn forceRedirectUrl="/login/complete">, so a browser
  // holding a session the server rejects bounces between the two forever.
  it('clears a stale browser session instead of bouncing back to /login', async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    render(
      await LoginCompletePage({
        searchParams: Promise.resolve({
          redirectTo: '/auth/device?user_code=ABCD',
          surface: 'desktop',
        }),
      }),
    );

    const recovery = screen.getByTestId('stale-session-recovery');
    expect(recovery).toHaveAttribute(
      'data-login-url',
      '/login?redirectTo=%2Fauth%2Fdevice%3Fuser_code%3DABCD&surface=desktop&authRetry=1',
    );
    expect(recovery).toHaveAttribute('data-already-retried', 'false');
    expect(mocks.accepted).not.toHaveBeenCalled();
  });

  it('stops after one attempt rather than looping again', async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    render(
      await LoginCompletePage({
        searchParams: Promise.resolve({ redirectTo: '/chat', authRetry: '1' }),
      }),
    );

    expect(screen.getByTestId('stale-session-recovery')).toHaveAttribute(
      'data-already-retried',
      'true',
    );
  });

  it('re-sanitizes the final destination', async () => {
    mocks.accepted.mockResolvedValue(true);

    render(
      await LoginCompletePage({
        searchParams: Promise.resolve({ redirectTo: 'https://evil.example/steal' }),
      }),
    );

    expect(mocks.continue).toHaveBeenCalledWith({ redirectTo: '/' });
  });
});

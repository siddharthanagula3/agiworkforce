import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  accepted: vi.fn(),
  acceptedAny: vi.fn(),
  must: vi.fn(),
  redirect: vi.fn(),
  recorder: vi.fn(),
  continue: vi.fn(),
  gate: vi.fn(),
  access: vi.fn(),
  email: vi.fn(),
  latestConsent: vi.fn(),
  headers: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: () => mocks.auth() }));
vi.mock('@/features/support/lib/ticket-client', () => ({
  readSuspensionAppeal: vi.fn(async () => null),
  submitSuspensionAppeal: vi.fn(async () => null),
}));
vi.mock('@/lib/auth/account-lifecycle', () => ({
  accountAccessForSignIn: (userId: string) => mocks.access(userId),
}));
vi.mock('@/lib/auth/email-confirmation', async (importOriginal) => ({
  ...(await importOriginal()),
  readPrimaryEmailState: (userId: string) => mocks.email(userId),
}));
vi.mock('@/features/auth/ConfirmEmailStep', () => ({
  ConfirmEmailStep: ({ footer }: { footer: ReactNode }) => (
    <div data-testid="confirm-email-step">{footer}</div>
  ),
}));
vi.mock('./StaleSessionRecovery', () => ({
  StaleSessionRecovery: (props: { loginUrl: string; alreadyRetried: boolean }) => (
    <div
      data-testid="stale-session-recovery"
      data-login-url={props.loginUrl}
      data-already-retried={String(props.alreadyRetried)}
    />
  ),
}));
vi.mock('./TermsReviewSignOut', () => ({
  TermsReviewSignOut: () => <button type="button">Sign out</button>,
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    mocks.redirect(url);
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock('next/headers', async (importOriginal) => ({
  ...(await importOriginal()),
  headers: () => mocks.headers(),
}));
vi.mock('@/lib/server/consent-records', async (importOriginal) => ({
  ...(await importOriginal()),
  readLatestConsent: (userId: string, purpose: string) => mocks.latestConsent(userId, purpose),
}));
vi.mock('@/lib/server/terms', () => ({
  hasAcceptedCurrentTerms: (userId: string) => mocks.accepted(userId),
  mustAcceptTerms: (userId: string) => mocks.must(userId),
  hasAcceptedAnyTerms: (userId: string) => mocks.acceptedAny(userId),
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

import { PRODUCT_UPDATES_CONSENT_PURPOSE } from '@/lib/consent-purposes';
import { GLOBAL_PRIVACY_CONTROL_HEADER } from '@/lib/consent-signals';
import LoginCompletePage from './page';
import {
  accountAccessDecision,
  ACCOUNT_DENIAL_NOTICE,
  ACCOUNT_STATUSES,
  type AccountAccessDenied,
  type AccountStatus,
} from '@/lib/auth/account-status';

const DENIALS = ACCOUNT_STATUSES.map((status) => ({
  status,
  decision: accountAccessDecision(status),
})).filter(
  (entry): entry is { status: AccountStatus; decision: AccountAccessDenied } =>
    !entry.decision.allowed,
);

describe('/login/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user-1' });
    mocks.accepted.mockResolvedValue(false);
    mocks.must.mockImplementation(async (userId: string) => !(await mocks.accepted(userId)));
    mocks.acceptedAny.mockResolvedValue(true);
    mocks.access.mockResolvedValue({ allowed: true });
    mocks.email.mockResolvedValue({ confirmed: true, email: 'person@example.com' });
    mocks.latestConsent.mockResolvedValue(null);
    mocks.headers.mockResolvedValue(new Headers());
  });

  it('lets an account on an older valid version continue without a click-through', async () => {
    mocks.must.mockResolvedValue(false);

    render(await LoginCompletePage({ searchParams: Promise.resolve({ redirectTo: '/chat' }) }));

    expect(mocks.recorder).not.toHaveBeenCalled();
    expect(mocks.continue).toHaveBeenCalledWith({ redirectTo: '/chat' });
  });

  it('offers the published revision to an account that asked to review it', async () => {
    mocks.must.mockResolvedValue(false);

    render(
      await LoginCompletePage({
        searchParams: Promise.resolve({ redirectTo: '/chat', review: 'terms' }),
      }),
    );

    expect(screen.getByTestId('terms-recorder')).toBeInTheDocument();
    expect(mocks.must).not.toHaveBeenCalled();
  });

  it('does not rewrite a current durable acceptance', async () => {
    mocks.accepted.mockResolvedValue(true);

    render(await LoginCompletePage({ searchParams: Promise.resolve({ redirectTo: '/chat' }) }));

    expect(mocks.accepted).toHaveBeenCalledWith('user-1');
    expect(mocks.recorder).not.toHaveBeenCalled();
    expect(mocks.continue).toHaveBeenCalledWith({ redirectTo: '/chat' });
  });

  it('keeps the desktop window layout on the terms step', async () => {
    const { container } = render(
      await LoginCompletePage({
        searchParams: Promise.resolve({ redirectTo: '/chat', surface: 'desktop' }),
      }),
    );

    expect(screen.getByTestId('terms-recorder')).toBeInTheDocument();
    expect(container.querySelector('[data-embedded="true"]')).not.toBeNull();
  });

  it('requires missing or outdated acceptance on the login surface', async () => {
    render(await LoginCompletePage({ searchParams: Promise.resolve({ redirectTo: '/chat' }) }));

    expect(screen.getByTestId('terms-gate')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Finish signing in' })).toBeInTheDocument();
    expect(screen.getByTestId('terms-recorder')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(mocks.recorder).toHaveBeenCalledWith({
      redirectTo: '/chat',
      surface: 'web-login',
    });
    expect(mocks.gate).toHaveBeenCalledWith(
      expect.objectContaining({
        restorePreAuthMarker: false,
        confirmationLabel: 'Continue',
        confirmAge: false,
      }),
    );
  });

  it('asks an account that never accepted the terms for its age on the same first screen', async () => {
    mocks.acceptedAny.mockResolvedValue(false);

    render(await LoginCompletePage({ searchParams: Promise.resolve({ redirectTo: '/chat' }) }));

    expect(mocks.acceptedAny).toHaveBeenCalledWith('user-1');
    expect(mocks.gate).toHaveBeenCalledWith(
      expect.objectContaining({ confirmationLabel: 'Continue', confirmAge: true }),
    );
    expect(mocks.recorder).toHaveBeenCalledWith({
      redirectTo: '/chat',
      surface: 'web-login',
    });
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

  it.each(DENIALS)(
    'stops a $status account at the reason instead of at the next 403',
    async ({ decision }) => {
      mocks.access.mockResolvedValue(decision);
      mocks.accepted.mockResolvedValue(true);

      render(await LoginCompletePage({ searchParams: Promise.resolve({ redirectTo: '/chat' }) }));

      expect(screen.getByTestId('account-access-notice')).toHaveTextContent(decision.message);
      if (decision.reason === 'suspended') {
        expect(
          await screen.findByLabelText('Why should the suspension be lifted?'),
        ).toBeInTheDocument();
      } else {
        expect(document.querySelector('[data-account-denial]')).toHaveAttribute(
          'href',
          decision.recoveryPath ?? '/login?redirectTo=%2Fchat',
        );
      }
      expect(mocks.continue).not.toHaveBeenCalled();
      expect(screen.queryByTestId('terms-gate')).toBeNull();
      expect(mocks.accepted).not.toHaveBeenCalled();
    },
  );

  it('gives each reason its own heading and sentence, so a lockout never reads as a suspension', () => {
    const reasons = new Set(DENIALS.map(({ decision }) => decision.reason));
    const headings = new Set(
      DENIALS.map(({ decision }) => ACCOUNT_DENIAL_NOTICE[decision.reason].title),
    );
    const messages = new Set(DENIALS.map(({ decision }) => decision.message));

    expect(reasons.size).toBeGreaterThan(2);
    expect(headings.size).toBe(reasons.size);
    expect(messages.size).toBe(reasons.size);
  });

  it('asks an account whose address was never proved to confirm it before terms or the app', async () => {
    mocks.email.mockResolvedValue({ confirmed: false, email: 'victim@corp.example' });
    mocks.accepted.mockResolvedValue(true);

    render(await LoginCompletePage({ searchParams: Promise.resolve({ redirectTo: '/chat' }) }));

    const step = screen.getByTestId('confirm-email-step');
    expect(mocks.email).toHaveBeenCalledWith('user-1');
    expect(step).toContainElement(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.queryByTestId('terms-gate')).toBeNull();
    expect(mocks.recorder).not.toHaveBeenCalled();
    expect(mocks.continue).not.toHaveBeenCalled();
    expect(mocks.accepted).not.toHaveBeenCalled();
  });

  it('keeps the desktop window layout on the confirmation step', async () => {
    mocks.email.mockResolvedValue({ confirmed: false, email: 'victim@corp.example' });

    const { container } = render(
      await LoginCompletePage({
        searchParams: Promise.resolve({ redirectTo: '/chat', surface: 'desktop' }),
      }),
    );

    expect(screen.getByTestId('confirm-email-step')).toBeInTheDocument();
    expect(container.querySelector('[data-embedded="true"]')).not.toBeNull();
  });

  it('states an account denial before asking anything about the address', async () => {
    mocks.access.mockResolvedValue(accountAccessDecision('locked'));
    mocks.email.mockResolvedValue({ confirmed: false, email: 'victim@corp.example' });

    render(await LoginCompletePage({ searchParams: Promise.resolve({ redirectTo: '/chat' }) }));

    expect(screen.getByTestId('account-access-notice')).toBeInTheDocument();
    expect(screen.queryByTestId('confirm-email-step')).toBeNull();
    expect(mocks.email).not.toHaveBeenCalled();
  });

  it('lets a scheduled deletion sign in, because cancelling one is done signed in', async () => {
    mocks.access.mockResolvedValue(accountAccessDecision('deletion_scheduled'));
    mocks.accepted.mockResolvedValue(true);

    render(await LoginCompletePage({ searchParams: Promise.resolve({ redirectTo: '/chat' }) }));

    expect(screen.queryByTestId('account-access-notice')).toBeNull();
    expect(mocks.continue).toHaveBeenCalledWith({ redirectTo: '/chat' });
  });

  describe('product updates on the first acceptance', () => {
    function decision(granted: boolean) {
      return {
        purpose: PRODUCT_UPDATES_CONSENT_PURPOSE.id,
        granted,
        noticeVersion: '2026-09-29',
        surface: 'web-consent-centre',
        recordedAt: '2026-10-01T00:00:00.000Z',
      };
    }

    async function renderTermsStep(params: Record<string, string> = {}) {
      render(
        await LoginCompletePage({
          searchParams: Promise.resolve({ redirectTo: '/chat', ...params }),
        }),
      );
    }

    function gateProps(): Record<string, unknown> {
      return mocks.gate.mock.lastCall?.[0] as Record<string, unknown>;
    }

    it('asks an account that never accepted the terms and has no decision on record', async () => {
      mocks.acceptedAny.mockResolvedValue(false);

      await renderTermsStep();

      expect(mocks.latestConsent).toHaveBeenCalledWith(
        'user-1',
        PRODUCT_UPDATES_CONSENT_PURPOSE.id,
      );
      expect(gateProps()).toMatchObject({
        confirmAge: true,
        offerProductUpdates: true,
        optedOutBySignal: false,
      });
      expect(mocks.recorder).toHaveBeenCalledWith({ redirectTo: '/chat', surface: 'web-login' });
    });

    it.each([
      ['granted', true],
      ['refused or withdrew', false],
    ])('never asks an account that already %s', async (_case, granted) => {
      mocks.acceptedAny.mockResolvedValue(false);
      mocks.latestConsent.mockResolvedValue(decision(granted));

      await renderTermsStep();

      expect(gateProps()).toMatchObject({ confirmAge: true, offerProductUpdates: false });
      expect(mocks.headers).not.toHaveBeenCalled();
    });

    it('does not ask when the ledger cannot be read, rather than assume nobody asked', async () => {
      mocks.acceptedAny.mockResolvedValue(false);
      mocks.latestConsent.mockRejectedValue(new Error('ledger unavailable'));

      await renderTermsStep();

      expect(screen.getByTestId('terms-gate')).toBeInTheDocument();
      expect(gateProps()).toMatchObject({ offerProductUpdates: false, optedOutBySignal: false });
    });

    it('does not ask an existing account that is accepting a revision', async () => {
      mocks.acceptedAny.mockResolvedValue(true);

      await renderTermsStep();

      expect(gateProps()).toMatchObject({ confirmAge: false, offerProductUpdates: false });
      expect(mocks.latestConsent).not.toHaveBeenCalled();
    });

    it('does not ask an account that chose to review the published revision early', async () => {
      mocks.must.mockResolvedValue(false);
      mocks.acceptedAny.mockResolvedValue(true);

      await renderTermsStep({ review: 'terms' });

      expect(screen.getByTestId('terms-recorder')).toBeInTheDocument();
      expect(gateProps()).toMatchObject({ offerProductUpdates: false });
      expect(mocks.latestConsent).not.toHaveBeenCalled();
    });

    it('tells the box when the request carried Global Privacy Control', async () => {
      mocks.acceptedAny.mockResolvedValue(false);
      mocks.headers.mockResolvedValue(new Headers({ [GLOBAL_PRIVACY_CONTROL_HEADER]: '1' }));

      await renderTermsStep();

      expect(gateProps()).toMatchObject({ offerProductUpdates: true, optedOutBySignal: true });
    });

    it('reads no ledger for an account that needs no terms step at all', async () => {
      mocks.accepted.mockResolvedValue(true);

      await renderTermsStep();

      expect(mocks.continue).toHaveBeenCalledWith({ redirectTo: '/chat' });
      expect(mocks.latestConsent).not.toHaveBeenCalled();
    });
  });
});

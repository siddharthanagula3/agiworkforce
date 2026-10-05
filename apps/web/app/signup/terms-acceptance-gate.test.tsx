import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  ACCOUNT_AGE_CONFIRMATION_LABEL,
  ACCOUNT_SIGNUP_CONSENT_REQUIRED_MESSAGE,
} from '@agiworkforce/types';

import { PRODUCT_UPDATES_CONSENT_PURPOSE } from '@/lib/consent-purposes';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import { PRODUCT_UPDATES_CHOICE_STORAGE_KEY } from './signupAttemptMarkers';
import { TERMS_GATE_STORAGE_KEY } from './TermsGate';

const signUpState = vi.hoisted(() => ({
  status: 'missing_requirements',
  emailAddress: 'person@example.com',
  missingFields: [] as string[],
  unverifiedFields: ['email_address'],
  create: vi.fn(),
  verifications: {
    emailAddress: { status: null },
    sendEmailCode: vi.fn(),
    verifyEmailCode: vi.fn(),
  },
  sso: vi.fn(),
  finalize: vi.fn(),
  reset: vi.fn(),
}));

const signInState = vi.hoisted(() => ({
  status: 'needs_identifier',
  identifier: null,
  supportedFirstFactors: [],
  supportedSecondFactors: [],
  create: vi.fn(),
  password: vi.fn(),
  emailCode: { sendCode: vi.fn(), verifyCode: vi.fn() },
  resetPasswordEmailCode: { sendCode: vi.fn(), verifyCode: vi.fn(), submitPassword: vi.fn() },
  mfa: {
    sendPhoneCode: vi.fn(),
    verifyTOTP: vi.fn(),
    verifyPhoneCode: vi.fn(),
    verifyBackupCode: vi.fn(),
  },
  sso: vi.fn(),
  finalize: vi.fn(),
  reset: vi.fn(),
}));

const clerkState = vi.hoisted(() => ({
  loaded: true,
  on: vi.fn((_event: string, listener: () => void, options?: { notify?: boolean }) => {
    if (options?.notify) listener();
  }),
  off: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  AuthenticateWithRedirectCallback: () => null,
  useClerk: () => clerkState,
  useSignIn: () => ({ signIn: signInState, errors: null, fetchStatus: 'idle' }),
  useSignUp: () => ({ signUp: signUpState, errors: null, fetchStatus: 'idle' }),
}));

import { AuthFlow } from '@/features/auth/AuthFlow';

const REDIRECTS = {
  completeUrl: '/signup/complete?redirectTo=%2Fchat',
  switchUrl: '/login',
  ssoCallbackUrl: '/auth/sso-callback?redirectTo=%2Fchat',
};

const PROVIDERS = [{ id: 'google' as const, label: 'Google' }];

const CONSENT_BOX = new RegExp(`^${ACCOUNT_AGE_CONFIRMATION_LABEL}, agree to the Terms of Use`);

function renderSignup() {
  render(<AuthFlow mode="signup" providers={PROVIDERS} redirects={REDIRECTS} />);
}

async function renderConfirmedSignup() {
  renderSignup();
  await userEvent.click(screen.getByRole('checkbox', { name: CONSENT_BOX }));
}

function productUpdatesBox(): HTMLElement {
  return screen.getByRole('checkbox', { name: PRODUCT_UPDATES_CONSENT_PURPOSE.label });
}

function carriedChoice(): string | null {
  return window.localStorage.getItem(PRODUCT_UPDATES_CHOICE_STORAGE_KEY);
}

function leaveChoiceFromAnEarlierAttempt(): void {
  window.localStorage.setItem(PRODUCT_UPDATES_CHOICE_STORAGE_KEY, POLICY_LAST_UPDATED.privacy);
}

/**
 * Founder decision 2026-10-04, replacing the 2026-09-06 passive sentence: one
 * box carries the age confirmation and the agreement, and no sign-up method
 * starts until it is ticked. The durable record is still written server-side
 * by /signup/complete against the policy version.
 */
describe('/signup agreement', () => {
  beforeEach(() => {
    window.localStorage.clear();
    signUpState.create.mockReset().mockResolvedValue({ error: null });
    signUpState.verifications.sendEmailCode.mockReset().mockResolvedValue({ error: null });
    signUpState.sso.mockReset().mockResolvedValue({ error: null });
  });

  it('shows one required box that carries the age confirmation and the agreement, and one optional box', () => {
    renderSignup();

    const box = screen.getByRole('checkbox', { name: CONSENT_BOX });
    expect(within(screen.getByTestId('auth-signup-consent')).getAllByRole('checkbox')).toEqual([
      box,
    ]);
    expect(screen.getAllByRole('checkbox')).toEqual([box, productUpdatesBox()]);
    expect(box).not.toBeChecked();
    expect(productUpdatesBox()).not.toBeChecked();
    expect(screen.queryByText(/By signing up/)).toBeNull();
  });

  it('writes no marker and calls no provider while the box is unticked', async () => {
    renderSignup();

    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    await userEvent.type(screen.getByLabelText('Email address'), 'person@example.com{Enter}');

    expect(screen.getByRole('alert')).toHaveTextContent(ACCOUNT_SIGNUP_CONSENT_REQUIRED_MESSAGE);
    expect(signUpState.sso).not.toHaveBeenCalled();
    expect(signUpState.create).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBeNull();
  });

  it('creates the account with the agreement recorded when the email is submitted', async () => {
    await renderConfirmedSignup();

    await userEvent.type(screen.getByLabelText('Email address'), 'person@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(signUpState.create).toHaveBeenCalledWith({
        emailAddress: 'person@example.com',
        legalAccepted: true,
      }),
    );
    expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBe(POLICY_LAST_UPDATED.terms);
  });

  it('hands a provider sign-up over with the agreement recorded', async () => {
    await renderConfirmedSignup();

    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() =>
      expect(signUpState.sso).toHaveBeenCalledWith(
        expect.objectContaining({ legalAccepted: true }),
      ),
    );
    expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBe(POLICY_LAST_UPDATED.terms);
  });

  it('does not leave an acceptance marker behind after signup initiation fails', async () => {
    window.localStorage.setItem(TERMS_GATE_STORAGE_KEY, POLICY_LAST_UPDATED.terms);
    signUpState.create.mockResolvedValue({
      error: { errors: [{ code: 'form_identifier_exists' }] },
    });
    await renderConfirmedSignup();

    await userEvent.type(screen.getByLabelText('Email address'), 'existing@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(signUpState.create).toHaveBeenCalled());
    expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBeNull();
  });

  it('recovers from a rejected email signup request without claiming agreement was recorded', async () => {
    signUpState.create.mockRejectedValue(new TypeError('Failed to fetch'));
    await renderConfirmedSignup();

    await userEvent.type(screen.getByLabelText('Email address'), 'person@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByText(
        'We could not reach the server. Check your connection and try again.',
      ),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('starts nothing from Try again once the box is unticked, and retries once it is ticked again', async () => {
    signUpState.create.mockRejectedValue(new TypeError('Failed to fetch'));
    await renderConfirmedSignup();
    const box = screen.getByRole('checkbox', { name: CONSENT_BOX });

    await userEvent.type(screen.getByLabelText('Email address'), 'person@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(signUpState.create).toHaveBeenCalledTimes(1);

    signUpState.create.mockResolvedValue({ error: null });
    await userEvent.click(box);
    expect(box).not.toBeChecked();
    await userEvent.click(retry);

    expect(signUpState.create).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBeNull();
    expect(within(screen.getByTestId('auth-signup-consent')).getByRole('alert')).toHaveTextContent(
      ACCOUNT_SIGNUP_CONSENT_REQUIRED_MESSAGE,
    );
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(box).toHaveFocus();

    await userEvent.click(box);
    await userEvent.click(retry);

    await waitFor(() => expect(signUpState.create).toHaveBeenCalledTimes(2));
    expect(signUpState.create).toHaveBeenLastCalledWith({
      emailAddress: 'person@example.com',
      legalAccepted: true,
    });
    await waitFor(() =>
      expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBe(POLICY_LAST_UPDATED.terms),
    );
  });

  it('clears the signup marker when a provider handoff is refused', async () => {
    signUpState.sso.mockResolvedValue({
      error: { errors: [{ code: 'oauth_access_denied' }] },
    });
    await renderConfirmedSignup();

    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() => expect(signUpState.sso).toHaveBeenCalled());
    await waitFor(() => expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBeNull());
  });

  it('clears the signup marker and offers a retry when the provider handoff throws', async () => {
    signUpState.sso.mockRejectedValue(new TypeError('Failed to fetch'));
    await renderConfirmedSignup();

    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() => expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBeNull());
    expect(
      screen.getByText('We could not reach the server. Check your connection and try again.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
  });
});

/**
 * Founder request 2026-10-04: product-update email is agreed at sign-up, in a
 * separate optional box. The choice is carried beside the terms marker, with
 * the privacy notice version that was on screen, and written by
 * /signup/complete in the request that records the terms.
 */
describe('/signup product updates choice', () => {
  beforeEach(() => {
    window.localStorage.clear();
    signUpState.create.mockReset().mockResolvedValue({ error: null });
    signUpState.verifications.sendEmailCode.mockReset().mockResolvedValue({ error: null });
    signUpState.sso.mockReset().mockResolvedValue({ error: null });
  });

  it('is unticked on arrival even when an earlier visit left a choice in the browser', () => {
    leaveChoiceFromAnEarlierAttempt();
    renderSignup();

    expect(productUpdatesBox()).not.toBeChecked();
  });

  it('writes nothing when the optional box is ticked but no attempt is admitted', async () => {
    renderSignup();

    await userEvent.click(productUpdatesBox());
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    await userEvent.type(screen.getByLabelText('Email address'), 'person@example.com{Enter}');

    expect(signUpState.sso).not.toHaveBeenCalled();
    expect(signUpState.create).not.toHaveBeenCalled();
    expect(carriedChoice()).toBeNull();
    expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBeNull();
  });

  it('carries a ticked choice past the email step with the notice version on screen', async () => {
    await renderConfirmedSignup();
    await userEvent.click(productUpdatesBox());

    await userEvent.type(screen.getByLabelText('Email address'), 'person@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(carriedChoice()).toBe(POLICY_LAST_UPDATED.privacy));
    expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBe(POLICY_LAST_UPDATED.terms);
    expect(signUpState.create).toHaveBeenCalledWith({
      emailAddress: 'person@example.com',
      legalAccepted: true,
    });
  });

  it('carries a ticked choice into a provider round trip', async () => {
    await renderConfirmedSignup();
    await userEvent.click(productUpdatesBox());

    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() => expect(signUpState.sso).toHaveBeenCalled());
    expect(carriedChoice()).toBe(POLICY_LAST_UPDATED.privacy);
    expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBe(POLICY_LAST_UPDATED.terms);
  });

  it('admits an email sign-up with the box unticked and removes a choice an earlier attempt left', async () => {
    leaveChoiceFromAnEarlierAttempt();
    await renderConfirmedSignup();

    await userEvent.type(screen.getByLabelText('Email address'), 'second@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBe(POLICY_LAST_UPDATED.terms),
    );
    expect(signUpState.create).toHaveBeenCalledTimes(1);
    expect(carriedChoice()).toBeNull();
  });

  it('admits a provider sign-up with the box unticked and removes a choice an earlier attempt left', async () => {
    leaveChoiceFromAnEarlierAttempt();
    await renderConfirmedSignup();

    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() => expect(signUpState.sso).toHaveBeenCalled());
    expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBe(POLICY_LAST_UPDATED.terms);
    expect(carriedChoice()).toBeNull();
  });

  it('drops a ticked choice with the terms marker when the email sign-up is refused', async () => {
    signUpState.create.mockResolvedValue({
      error: { errors: [{ code: 'form_identifier_exists' }] },
    });
    await renderConfirmedSignup();
    await userEvent.click(productUpdatesBox());

    await userEvent.type(screen.getByLabelText('Email address'), 'existing@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(signUpState.create).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled());
    expect(carriedChoice()).toBeNull();
    expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBeNull();
  });

  it('drops a ticked choice with the terms marker when the provider handoff is refused', async () => {
    signUpState.sso.mockResolvedValue({
      error: { errors: [{ code: 'oauth_access_denied' }] },
    });
    await renderConfirmedSignup();
    await userEvent.click(productUpdatesBox());

    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() => expect(signUpState.sso).toHaveBeenCalled());
    await waitFor(() => expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBeNull());
    expect(carriedChoice()).toBeNull();
  });

  it('carries the choice as it stands when Try again is pressed, not as it stood at the failed attempt', async () => {
    signUpState.create.mockRejectedValue(new TypeError('Failed to fetch'));
    await renderConfirmedSignup();
    await userEvent.click(productUpdatesBox());

    await userEvent.type(screen.getByLabelText('Email address'), 'person@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(carriedChoice()).toBeNull();

    signUpState.create.mockResolvedValue({ error: null });
    await userEvent.click(productUpdatesBox());
    expect(productUpdatesBox()).not.toBeChecked();
    await userEvent.click(retry);

    await waitFor(() =>
      expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBe(POLICY_LAST_UPDATED.terms),
    );
    expect(signUpState.create).toHaveBeenCalledTimes(2);
    expect(carriedChoice()).toBeNull();
  });
});

describe('/login and a marker the sign-up page left behind', () => {
  function renderLogin() {
    render(
      <AuthFlow
        mode="login"
        providers={PROVIDERS}
        redirects={{ ...REDIRECTS, completeUrl: '/login/complete?redirectTo=%2Fchat' }}
      />,
    );
  }

  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(TERMS_GATE_STORAGE_KEY, POLICY_LAST_UPDATED.terms);
    signInState.create.mockReset().mockResolvedValue({ error: null });
    signInState.emailCode.sendCode.mockReset().mockResolvedValue({ error: null });
    signInState.sso.mockReset().mockResolvedValue({ error: null });
  });

  it('drops it when a provider sign-in starts, so an account that sign-in creates is asked its age', async () => {
    renderLogin();

    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() => expect(signInState.sso).toHaveBeenCalled());
    expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBeNull();
  });

  it('drops it when an email sign-in starts, which an organization connection can turn into an account', async () => {
    renderLogin();

    await userEvent.type(screen.getByLabelText('Email address'), 'person@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(signInState.create).toHaveBeenCalled());
    expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBeNull();
  });

  it.each([
    [
      'a provider sign-in',
      async () => userEvent.click(screen.getByRole('button', { name: 'Continue with Google' })),
      () => signInState.sso,
    ],
    [
      'an email sign-in',
      async () => {
        await userEvent.type(screen.getByLabelText('Email address'), 'person@example.com');
        await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
      },
      () => signInState.create,
    ],
  ])(
    'drops a product updates choice an abandoned sign-up left, so %s never inherits it',
    async (_case, start, reached) => {
      leaveChoiceFromAnEarlierAttempt();
      renderLogin();

      await start();

      await waitFor(() => expect(reached()).toHaveBeenCalled());
      expect(carriedChoice()).toBeNull();
      expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBeNull();
    },
  );
});

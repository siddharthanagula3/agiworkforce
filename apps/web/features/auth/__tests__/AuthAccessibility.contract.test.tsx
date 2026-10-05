import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ACCOUNT_AGE_CONFIRMATION_LABEL } from '@agiworkforce/types';

const client = vi.hoisted(() => ({
  isReady: true,
  startWithEmail: vi.fn(),
  submitPassword: vi.fn(),
  submitCode: vi.fn(),
  resendCode: vi.fn(),
  submitSecondFactor: vi.fn(),
  switchSecondFactor: vi.fn(),
  submitNewPassword: vi.fn(),
  startPasswordReset: vi.fn(),
  startMethod: vi.fn(),
  startProvider: vi.fn(),
  signInWithPasskey: vi.fn(),
  restart: vi.fn(),
}));

vi.mock('../identityAuthAdapter', () => ({
  useIdentityAuthClient: () => client,
  IdentityBotProtection: () => <div data-testid="bot-protection" />,
}));

import { AuthCodeStep } from '../AuthCodeStep';
import { AuthFlow } from '../AuthFlow';
import { AUTH_CODE_LENGTH, AUTH_RESEND_COOLDOWN_SECONDS } from '../authContract';
import type {
  AuthCodePurpose,
  AuthMode,
  AuthPasswordPurpose,
  AuthProvider,
  AuthResult,
  AuthStep,
} from '../authContract';

const PROVIDERS: readonly AuthProvider[] = [{ id: 'google', label: 'Google' }];
const EMAIL = 'person@example.com';
const REDIRECTS = {
  completeUrl: '/login/complete',
  switchUrl: '/signup',
  ssoCallbackUrl: '/auth/sso-callback',
};

type StepVariant =
  | Exclude<AuthStep['kind'], 'code' | 'new_password'>
  | `code:${AuthCodePurpose}`
  | `new_password:${AuthPasswordPurpose}`;

/**
 * Typed by step kind and purpose, so a step or purpose added to the contract cannot skip these checks.
 */
const STEPS: Readonly<
  Record<
    StepVariant,
    {
      mode: AuthMode;
      step: AuthStep;
      heading: string;
      field: string | null;
      back: string | null;
    }
  >
> = {
  email: {
    mode: 'login',
    step: { kind: 'email' },
    heading: 'Welcome back',
    field: 'Email address',
    back: null,
  },
  password: {
    mode: 'login',
    step: { kind: 'password', email: EMAIL, methods: ['email_code'] },
    heading: 'Enter your password',
    field: 'Password',
    back: 'Edit',
  },
  'code:sign_in': {
    mode: 'login',
    step: { kind: 'code', email: EMAIL, purpose: 'sign_in', methods: ['password'] },
    heading: 'Check your inbox',
    field: 'Code',
    back: 'Edit',
  },
  'code:sign_up': {
    mode: 'signup',
    step: { kind: 'code', email: EMAIL, purpose: 'sign_up', methods: [] },
    heading: 'Check your inbox',
    field: 'Code',
    back: 'Edit',
  },
  'code:reset': {
    mode: 'login',
    step: { kind: 'code', email: EMAIL, purpose: 'reset', methods: ['password'] },
    heading: 'Check your inbox',
    field: 'Code',
    back: 'Edit',
  },
  'code:device': {
    mode: 'login',
    step: { kind: 'code', email: EMAIL, purpose: 'device', methods: [] },
    heading: 'Verify this device',
    field: 'Code',
    back: 'Edit',
  },
  second_factor: {
    mode: 'login',
    step: {
      kind: 'second_factor',
      factor: { kind: 'authenticator', label: 'Authenticator app', hint: null },
      alternatives: [{ kind: 'backup_code', label: 'Backup code', hint: null }],
    },
    heading: 'Confirm it is you',
    field: 'Authenticator app',
    back: 'Use a different email',
  },
  'new_password:reset': {
    mode: 'login',
    step: { kind: 'new_password', email: EMAIL, purpose: 'reset' },
    heading: 'Set a new password',
    field: 'New password',
    back: null,
  },
  'new_password:sign_up': {
    mode: 'signup',
    step: { kind: 'new_password', email: EMAIL, purpose: 'sign_up' },
    heading: 'Create a password',
    field: 'Password',
    back: 'Edit',
  },
  notice: {
    mode: 'login',
    step: { kind: 'notice', notice: 'link_expired', retryAfterSeconds: null },
    heading: 'This link expired',
    field: null,
    back: 'Start again',
  },
};

const VARIANTS = Object.keys(STEPS) as StepVariant[];

const VARIANTS_WITH_A_FIELD: readonly StepVariant[] = VARIANTS.filter(
  (variant) => STEPS[variant].field !== null,
);

function renderFlow(mode: AuthMode = 'login') {
  return render(
    <AuthFlow mode={mode} providers={PROVIDERS} redirects={REDIRECTS} passkeySignIn={false} />,
  );
}

const CONSENT_BOX = new RegExp(`^${ACCOUNT_AGE_CONFIRMATION_LABEL}, agree to the Terms of Use`);

async function submitEmail() {
  await userEvent.type(screen.getByLabelText('Email address'), EMAIL);
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

async function openStep(variant: StepVariant) {
  const { mode, step } = STEPS[variant];
  const container = renderFlow(mode);
  if (step.kind === 'email') return container;

  if (mode === 'signup') {
    await userEvent.click(screen.getByRole('checkbox', { name: CONSENT_BOX }));
  }
  client.startWithEmail.mockResolvedValue({ status: 'next', step } as AuthResult);
  await submitEmail();
  await waitFor(() => expect(client.startWithEmail).toHaveBeenCalled());
  return container;
}

function focusableIn(root: HTMLElement): HTMLElement[] {
  const candidates = root.querySelectorAll<HTMLElement>(
    'a[href], button, input, select, textarea, [tabindex]',
  );
  return [...candidates].filter(
    (element) =>
      !element.closest('[hidden]') &&
      !element.hasAttribute('disabled') &&
      element.getAttribute('tabindex') !== '-1' &&
      element.getAttribute('aria-hidden') !== 'true',
  );
}

function accessibleName(element: HTMLElement): string {
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    return labelledBy
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim();
  }
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();
  if (element instanceof HTMLInputElement) {
    const label = element.id ? document.querySelector(`label[for="${element.id}"]`) : null;
    return label?.textContent?.trim() ?? '';
  }
  return element.textContent?.trim() ?? '';
}

beforeEach(() => {
  for (const fn of Object.values(client)) {
    if (typeof fn === 'function' && 'mockReset' in fn) {
      fn.mockReset();
      fn.mockResolvedValue({ status: 'complete' } as AuthResult);
    }
  }
  Reflect.deleteProperty(window, 'PublicKeyCredential');
  window.localStorage.clear();
});

describe('every authentication step', () => {
  for (const kind of VARIANTS) {
    it(`${kind}: opens under its own heading, which names the step`, async () => {
      const { container } = await openStep(kind);
      const { heading } = STEPS[kind];

      expect(within(container).getByRole('heading', { level: 1, name: heading })).toBeVisible();
      expect(within(container).getByRole('region', { name: heading })).toBeInTheDocument();
    });

    const back = STEPS[kind].back;
    if (back) {
      it(`${kind}: offers a named way back to the address`, async () => {
        const { container } = await openStep(kind);

        await userEvent.click(within(container).getByRole('button', { name: back }));

        expect(client.restart).toHaveBeenCalledTimes(1);
        expect(await within(container).findByLabelText('Email address')).toBeInTheDocument();
      });
    }

    it(`${kind}: names every control it offers`, async () => {
      const { container } = await openStep(kind);

      const controls = focusableIn(container);
      expect(controls.length).toBeGreaterThan(0);
      for (const control of controls) {
        expect(accessibleName(control), control.outerHTML.slice(0, 120)).not.toBe('');
      }
    });

    it(`${kind}: puts nothing ahead of the document order in the tab sequence`, async () => {
      const { container } = await openStep(kind);

      for (const element of container.querySelectorAll('[tabindex]')) {
        expect(Number(element.getAttribute('tabindex'))).toBeLessThanOrEqual(0);
      }
    });

    it(`${kind}: is reachable in document order with the keyboard alone`, async () => {
      const { container } = await openStep(kind);
      const expected = focusableIn(container);

      (document.activeElement as HTMLElement | null)?.blur();
      for (const control of expected) {
        await userEvent.tab();
        expect(document.activeElement).toBe(control);
      }
    });
  }
});

describe('a step that owns a field', () => {
  for (const kind of VARIANTS_WITH_A_FIELD) {
    it(`${kind}: labels its field`, async () => {
      const { container } = await openStep(kind);

      expect(within(container).getByLabelText(STEPS[kind].field ?? '')).toBeEnabled();
    });

    it(`${kind}: keeps one polite status region mounted for the wait it may start`, async () => {
      const { container } = await openStep(kind);

      const regions = within(container).getAllByTestId('auth-phase');
      expect(regions).toHaveLength(1);
      expect(regions[0]).toHaveAttribute('role', 'status');
      expect(regions[0]).toHaveAttribute('aria-live', 'polite');
    });
  }
});

describe('a failure on a step that owns a field', () => {
  for (const kind of VARIANTS_WITH_A_FIELD) {
    it(`${kind}: ties the message to the field and moves focus to it`, async () => {
      await openStep(kind);

      const input = document.querySelector('input:not([hidden])');
      expect(input).not.toBeNull();

      const failure: AuthResult = {
        status: 'failed',
        kind: 'credentials_invalid',
        message: 'That did not work.',
        field:
          kind === 'email'
            ? 'email'
            : kind === 'password' || kind.startsWith('new_password')
              ? 'password'
              : 'code',
      };
      for (const fn of [
        client.startWithEmail,
        client.submitPassword,
        client.submitCode,
        client.submitSecondFactor,
        client.submitNewPassword,
      ]) {
        fn.mockResolvedValue(failure);
      }

      await userEvent.type(input!, kind === 'email' ? EMAIL : '123456');
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

      const errored = await waitFor(() => {
        const candidate = document.querySelector('input[aria-invalid="true"]');
        expect(candidate).not.toBeNull();
        return candidate as HTMLInputElement;
      });

      const describedBy = errored.getAttribute('aria-describedby') ?? '';
      const descriptions = describedBy
        .split(' ')
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent ?? '');
      expect(descriptions.join(' | ')).toContain('That did not work.');
      await waitFor(() => expect(document.activeElement).toBe(errored));
    });
  }
});

describe('the code step', () => {
  it('takes the whole code in one labelled field the browser can autofill', async () => {
    await openStep('code:sign_in');

    const field = screen.getByLabelText('Code') as HTMLInputElement;
    expect(field.getAttribute('autocomplete')).toBe('one-time-code');
    expect(field.getAttribute('inputmode')).toBe('numeric');
    expect(field.maxLength).toBe(AUTH_CODE_LENGTH);
    expect(document.querySelectorAll('input')).toHaveLength(1);
  });

  it('holds the resend control only while its own cooldown runs', async () => {
    await openStep('code:sign_in');

    const resend = screen.getByRole('button', { name: /resend/i });
    expect(resend).toBeDisabled();
    expect(resend).toHaveAccessibleName(new RegExp(String(AUTH_RESEND_COOLDOWN_SECONDS)));
  });

  it('offers a fresh code rather than ending the attempt when the first one runs out', async () => {
    const onResend = vi.fn();
    render(
      <AuthCodeStep
        email={EMAIL}
        phase="idle"
        error={null}
        fieldError={null}
        resendBlockedSeconds={0}
        onSubmit={vi.fn()}
        onResend={onResend}
        onEditEmail={vi.fn()}
      />,
    );

    const resend = await screen.findByRole('button', { name: 'Resend code' });
    expect(resend).toBeEnabled();

    await userEvent.click(resend);
    expect(onResend).toHaveBeenCalledTimes(1);
  });

  it('extends the wait to whatever the limiter asked for rather than its own cooldown', async () => {
    const longerThanTheCooldown = AUTH_RESEND_COOLDOWN_SECONDS + 45;
    render(
      <AuthCodeStep
        email={EMAIL}
        phase="idle"
        error={null}
        fieldError={null}
        resendBlockedSeconds={longerThanTheCooldown}
        onSubmit={vi.fn()}
        onResend={vi.fn()}
        onEditEmail={vi.fn()}
      />,
    );

    const resend = await screen.findByRole('button', { name: /resend/i });
    expect(resend).toBeDisabled();
    expect(resend).toHaveAccessibleName(new RegExp(String(longerThanTheCooldown)));
  });
});

describe('signup bot protection', () => {
  it('leaves the email field first in the tab order and takes no focus of its own', async () => {
    const { container } = renderFlow('signup');

    expect(screen.getByTestId('bot-protection')).toBeInTheDocument();
    expect(
      focusableIn(container).some((element) => element.dataset['testid'] === 'bot-protection'),
    ).toBe(false);

    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.tab();
    expect(document.activeElement).toBe(focusableIn(container)[0]);
  });
});

describe('a status message', () => {
  it('sits in a region that was already mounted before it had anything to say', async () => {
    const { container } = await openStep('email');

    const status = within(container).getByTestId('auth-phase');
    expect(status).toHaveAttribute('role', 'status');
    expect(status.textContent).toBe('');
  });
});

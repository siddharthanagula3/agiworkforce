import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';

import {
  ACCOUNT_AGE_CONFIRMATION_LABEL,
  ACCOUNT_AGE_REQUIREMENT_NOTICE,
  ACCOUNT_SIGNUP_CONSENT_REQUIRED_MESSAGE,
} from '@agiworkforce/types';

import { MARKETING_EMAIL_CONSENT_PURPOSE } from '@/lib/consent-purposes';
import { GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE } from '@/lib/consent-signals';

import { AuthEmailStep } from '../AuthEmailStep';
import type { AuthProvider } from '../authContract';

const PROVIDERS: readonly AuthProvider[] = [
  { id: 'google', label: 'Google' },
  { id: 'github', label: 'GitHub' },
];

const CONSENT_SENTENCE = `${ACCOUNT_AGE_CONFIRMATION_LABEL}, agree to the Terms of Use, and acknowledge the Privacy Policy.`;

function renderStep(overrides: Partial<Parameters<typeof AuthEmailStep>[0]> = {}) {
  const props = {
    mode: 'login' as const,
    providers: PROVIDERS,
    switchUrl: '/signup',
    ready: true,
    phase: 'idle' as const,
    error: null,
    fieldError: null,
    switchOffered: false,
    providerPending: null,
    onSubmit: vi.fn(),
    onStartProvider: vi.fn(),
    ...overrides,
  };
  render(<AuthEmailStep {...props} />);
  return props;
}

function consentBox(): HTMLInputElement {
  return screen.getByRole('checkbox', { name: CONSENT_SENTENCE }) as HTMLInputElement;
}

function marketingEmailBox(): HTMLInputElement {
  return screen.getByRole('checkbox', {
    name: MARKETING_EMAIL_CONSENT_PURPOSE.label,
  }) as HTMLInputElement;
}

function signalGlobalPrivacyControl(): void {
  Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value: true });
}

function expectRefused(): void {
  const box = consentBox();
  expect(screen.getByRole('alert')).toHaveTextContent(ACCOUNT_SIGNUP_CONSENT_REQUIRED_MESSAGE);
  expect(box).toHaveAttribute('aria-invalid', 'true');
  expect(box).toHaveAccessibleDescription(
    `${ACCOUNT_SIGNUP_CONSENT_REQUIRED_MESSAGE} ${ACCOUNT_AGE_REQUIREMENT_NOTICE}`,
  );
  expect(box).toHaveFocus();
}

describe('AuthEmailStep', () => {
  it('asks for an email and one provider button per configured provider', () => {
    renderStep();

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByText('Log in to AGI Workforce.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toHaveAttribute(
      'placeholder',
      'you@example.com',
    );
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with GitHub' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/signup');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('auth-legal-footer')).toBeInTheDocument();
    expect(screen.queryByTestId('auth-data-use-notice')).toBeNull();
  });

  it('submits the trimmed email', async () => {
    const props = renderStep();

    await userEvent.type(screen.getByLabelText('Email address'), '  person@example.com  ');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(props.onSubmit).toHaveBeenCalledWith('person@example.com');
  });

  it('carries the agreement in the one consent box on sign up, with no passive sentence', () => {
    renderStep({ mode: 'signup' });

    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(
      screen.getByText('Get started with AGI Workforce and put AI to work for you.'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toEqual([consentBox(), marketingEmailBox()]);
    expect(within(screen.getByTestId('auth-signup-consent')).getAllByRole('checkbox')).toEqual([
      consentBox(),
    ]);
    expect(consentBox()).not.toBeChecked();
    expect(screen.queryByText(/By signing up/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Terms of Use' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });

  it('keeps the detailed age rule as the description of the box until it is ticked', async () => {
    renderStep({ mode: 'signup' });
    const box = consentBox();

    expect(box).toHaveAccessibleDescription(ACCOUNT_AGE_REQUIREMENT_NOTICE);
    expect(screen.queryByRole('alert')).toBeNull();

    await userEvent.click(box);

    expect(box).toBeChecked();
    expect(box).not.toHaveAccessibleDescription();
  });

  it('refuses the email form until the box is ticked, then lets it through', async () => {
    const props = renderStep({ mode: 'signup' });

    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    await userEvent.type(screen.getByLabelText('Email address'), 'person@example.com{Enter}');

    expect(props.onSubmit).not.toHaveBeenCalled();
    expectRefused();

    await userEvent.click(consentBox());

    expect(screen.queryByRole('alert')).toBeNull();
    expect(consentBox()).not.toHaveAttribute('aria-invalid');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(props.onSubmit).toHaveBeenCalledWith('person@example.com');
  });

  it('refuses the Continue button as it refuses Enter', async () => {
    const props = renderStep({ mode: 'signup' });

    await userEvent.type(screen.getByLabelText('Email address'), 'person@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(props.onSubmit).not.toHaveBeenCalled();
    expectRefused();
  });

  for (const provider of PROVIDERS) {
    it(`refuses ${provider.label} until the box is ticked, then starts it`, async () => {
      const props = renderStep({ mode: 'signup' });
      const button = screen.getByRole('button', { name: `Continue with ${provider.label}` });

      expect(button).toBeEnabled();
      await userEvent.click(button);

      expect(props.onStartProvider).not.toHaveBeenCalled();
      expectRefused();

      await userEvent.click(consentBox());
      await userEvent.click(button);

      expect(props.onStartProvider).toHaveBeenCalledWith(provider.id);
    });
  }

  it('refuses a passkey start on sign up the same way', async () => {
    Object.defineProperty(window, 'PublicKeyCredential', {
      configurable: true,
      value: function PublicKeyCredential() {},
    });
    const onStartPasskey = vi.fn();
    renderStep({ mode: 'signup', passkeySignIn: true, onStartPasskey });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign in with a passkey or security key' }),
    );

    expect(onStartPasskey).not.toHaveBeenCalled();
    expectRefused();
    Reflect.deleteProperty(window, 'PublicKeyCredential');
  });

  it('keeps the refusal until the box is ticked, not until the next attempt', async () => {
    const props = renderStep({ mode: 'signup' });

    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue with GitHub' }));

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(props.onStartProvider).not.toHaveBeenCalled();

    await userEvent.click(consentBox());
    await userEvent.click(consentBox());

    expect(consentBox()).not.toBeChecked();
    expect(screen.queryByRole('alert')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Continue with GitHub' }));
    expect(props.onStartProvider).not.toHaveBeenCalled();
    expectRefused();
  });

  it('refuses a retry once the box is unticked again, then lets a ticked retry through', async () => {
    const onRetry = vi.fn();
    renderStep({
      mode: 'signup',
      error: 'We could not reach the server. Check your connection and try again.',
      retryOffered: true,
      onRetry,
    });
    const retry = screen.getByRole('button', { name: 'Try again' });
    const consent = within(screen.getByTestId('auth-signup-consent'));

    expect(retry).toBeEnabled();
    await userEvent.click(retry);

    expect(onRetry).not.toHaveBeenCalled();
    expect(consent.getByRole('alert')).toHaveTextContent(ACCOUNT_SIGNUP_CONSENT_REQUIRED_MESSAGE);
    expect(consentBox()).toHaveAttribute('aria-invalid', 'true');
    expect(consentBox()).toHaveAccessibleDescription(
      `${ACCOUNT_SIGNUP_CONSENT_REQUIRED_MESSAGE} ${ACCOUNT_AGE_REQUIREMENT_NOTICE}`,
    );
    expect(consentBox()).toHaveFocus();

    await userEvent.click(consentBox());
    expect(consent.queryByRole('alert')).toBeNull();
    await userEvent.click(retry);

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('retries a failed sign-in without asking for a box that screen does not have', async () => {
    const onRetry = vi.fn();
    renderStep({ retryOffered: true, onRetry });

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps every policy reachable from the sign-up screen, each exactly once', async () => {
    renderStep({ mode: 'signup' });
    await userEvent.click(screen.getByText('Data use details'));

    const expected: ReadonlyArray<[string, string]> = [
      ['Terms of Use', '/terms'],
      ['Privacy Policy', '/privacy'],
      ['Data Use Guidelines', '/data-use'],
      ['Help', '/help'],
      ['Privacy', '/privacy'],
      ['Terms', '/terms'],
      ['Contact', '/contact'],
    ];
    for (const [name, href] of expected) {
      const links = screen.getAllByRole('link', { name });
      expect(links, name).toHaveLength(1);
      expect(links[0]).toHaveAttribute('href', href);
    }
    expect(screen.queryByRole('link', { name: 'Acceptable Use Policy' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Age requirements' })).toBeNull();
  });

  it('states the free-model training notice once, above the account switch', () => {
    renderStep({ mode: 'signup' });

    const notice = screen.getByTestId('auth-data-use-notice');
    expect(notice).toHaveTextContent(
      'Some free-model providers may use your content to train AI models.',
    );
    const switchLink = screen.getByRole('link', { name: 'Log in' });
    expect(
      notice.compareDocumentPosition(switchLink) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('asks nothing about age when signing in', () => {
    renderStep();

    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
    expect(screen.queryByText(ACCOUNT_AGE_REQUIREMENT_NOTICE, { exact: false })).toBeNull();
  });

  it('shows a sign up failure inline rather than as a banner', () => {
    renderStep({ mode: 'signup', error: 'Could not create the account.' });

    expect(screen.getByRole('alert')).toHaveTextContent('Could not create the account.');
  });

  it('shows an unknown email inline against the field, with the way out', () => {
    renderStep({ fieldError: 'No account uses this email.', switchOffered: true });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('No account uses this email. Sign up instead.');
    expect(screen.getByRole('link', { name: 'Sign up instead.' })).toHaveAttribute(
      'href',
      '/signup',
    );
    expect(screen.getByLabelText('Email address')).toHaveAttribute('aria-invalid', 'true');
  });

  it('waits for the identity client before letting the form submit', () => {
    renderStep({ ready: false });

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('still holds the sign-up controls while a request is in flight or the client is loading', () => {
    renderStep({ mode: 'signup', ready: false });
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
    expect(consentBox()).toBeEnabled();
  });

  describe('sign-in with the password on the same screen', () => {
    const EMAIL = 'person@example.com';
    const PASSWORD = 'correct horse battery';

    function renderSignIn(overrides: Partial<Parameters<typeof AuthEmailStep>[0]> = {}) {
      return renderStep({
        onSubmitPassword: vi.fn(),
        onForgotPassword: vi.fn(),
        ...overrides,
      });
    }

    function passwordField(): HTMLInputElement {
      return screen.getByLabelText('Password') as HTMLInputElement;
    }

    it('puts the password under the address in the same form, with its reveal and recovery controls', () => {
      renderSignIn();

      const email = screen.getByLabelText('Email address');
      const password = passwordField();
      const form = email.closest('form') as HTMLFormElement;
      const controls = [...form.querySelectorAll('input, button')];

      expect(controls).toEqual([
        email,
        password,
        screen.getByRole('button', { name: 'Show password' }),
        screen.getByRole('button', { name: 'Forgot password?' }),
        screen.getByRole('button', { name: 'Continue' }),
      ]);
      expect(password).toHaveAttribute('type', 'password');
      expect(password).toHaveAttribute('name', 'password');
      expect(password).toHaveAttribute('autocomplete', 'current-password');
      expect(password).not.toBeRequired();
      expect(email).toBeRequired();
      expect(email).toHaveFocus();
    });

    it('makes no promise the product does not keep', () => {
      renderSignIn();

      expect(screen.queryByRole('checkbox')).toBeNull();
      expect(screen.queryByText(/remember/i)).toBeNull();
    });

    it('asks a new account for no password on its first screen', () => {
      renderSignIn({ mode: 'signup' });

      expect(screen.queryByLabelText('Password')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Show password' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Forgot password?' })).toBeNull();
    });

    it('submits the address and the password together when both are filled', async () => {
      const props = renderSignIn();

      await userEvent.type(screen.getByLabelText('Email address'), `  ${EMAIL}  `);
      await userEvent.type(passwordField(), PASSWORD);
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

      expect(props.onSubmitPassword).toHaveBeenCalledTimes(1);
      expect(props.onSubmitPassword).toHaveBeenCalledWith(EMAIL, PASSWORD);
      expect(props.onSubmit).not.toHaveBeenCalled();
    });

    it('submits both on Enter from the password field', async () => {
      const props = renderSignIn();

      await userEvent.type(screen.getByLabelText('Email address'), EMAIL);
      await userEvent.type(passwordField(), `${PASSWORD}{Enter}`);

      expect(props.onSubmitPassword).toHaveBeenCalledWith(EMAIL, PASSWORD);
      expect(props.onSubmit).not.toHaveBeenCalled();
    });

    it('sends the password exactly as typed, spaces included', async () => {
      const props = renderSignIn();

      await userEvent.type(screen.getByLabelText('Email address'), EMAIL);
      await userEvent.type(passwordField(), '  two spaces each side  ');
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

      expect(props.onSubmitPassword).toHaveBeenCalledWith(EMAIL, '  two spaces each side  ');
    });

    it('keeps the email-first submit when the password is left empty', async () => {
      const props = renderSignIn();

      await userEvent.type(screen.getByLabelText('Email address'), `${EMAIL}{Enter}`);

      expect(props.onSubmit).toHaveBeenCalledTimes(1);
      expect(props.onSubmit).toHaveBeenCalledWith(EMAIL);
      expect(props.onSubmitPassword).not.toHaveBeenCalled();
    });

    it('goes back to the email-first submit once a typed password is deleted', async () => {
      const props = renderSignIn();

      await userEvent.type(screen.getByLabelText('Email address'), EMAIL);
      await userEvent.type(passwordField(), PASSWORD);
      await userEvent.clear(passwordField());
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

      expect(props.onSubmit).toHaveBeenCalledWith(EMAIL);
      expect(props.onSubmitPassword).not.toHaveBeenCalled();
    });

    it('ties a refused password to the password field and leaves the address alone', () => {
      renderSignIn({ passwordError: 'The email and password do not match an account.' });

      const password = passwordField();
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('The email and password do not match an account.');
      expect(password).toHaveAttribute('aria-invalid', 'true');
      expect(password.getAttribute('aria-describedby')?.split(' ')).toContain(alert.id);
      expect(password).toHaveFocus();
      expect(screen.getByLabelText('Email address')).not.toHaveAttribute('aria-invalid');
      expect(screen.queryByRole('link', { name: 'Sign up instead.' })).toBeNull();
    });

    it('keeps what was typed in both fields when the password is refused', async () => {
      const props = {
        mode: 'login' as const,
        providers: PROVIDERS,
        switchUrl: '/signup',
        ready: true,
        phase: 'idle' as const,
        error: null,
        fieldError: null,
        switchOffered: false,
        providerPending: null,
        onSubmit: vi.fn(),
        onSubmitPassword: vi.fn(),
        onForgotPassword: vi.fn(),
        onStartProvider: vi.fn(),
      };
      const { rerender } = render(<AuthEmailStep {...props} />);
      await userEvent.type(screen.getByLabelText('Email address'), EMAIL);
      await userEvent.type(passwordField(), 'not the password');

      rerender(<AuthEmailStep {...props} phase="checking_account" />);
      expect(passwordField()).toBeDisabled();
      rerender(
        <AuthEmailStep
          {...props}
          passwordError="The email and password do not match an account."
        />,
      );

      expect(screen.getByLabelText('Email address')).toHaveValue(EMAIL);
      expect(passwordField()).toHaveValue('not the password');
      expect(passwordField()).toBeEnabled();
      expect(passwordField()).toHaveFocus();
    });

    it('keeps an unknown address on the address field, not on the password', () => {
      renderSignIn({ fieldError: 'No account uses this email.', switchOffered: true });

      expect(screen.getByLabelText('Email address')).toHaveAttribute('aria-invalid', 'true');
      expect(passwordField()).not.toHaveAttribute('aria-invalid');
      expect(screen.getByRole('link', { name: 'Sign up instead.' })).toBeInTheDocument();
    });

    it('starts recovery for the typed address from the link beside the password', async () => {
      const props = renderSignIn();

      await userEvent.type(screen.getByLabelText('Email address'), `  ${EMAIL} `);
      await userEvent.type(passwordField(), PASSWORD);
      await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));

      expect(props.onForgotPassword).toHaveBeenCalledTimes(1);
      expect(props.onForgotPassword).toHaveBeenCalledWith(EMAIL);
      expect(props.onSubmit).not.toHaveBeenCalled();
      expect(props.onSubmitPassword).not.toHaveBeenCalled();
    });

    it('keeps the recovery link from submitting the form it sits in', () => {
      renderSignIn();

      const link = screen.getByRole('button', { name: 'Forgot password?' });
      expect(link).toHaveAttribute('type', 'button');
      expect(within(link.closest('form') as HTMLFormElement).getByLabelText('Password')).toBe(
        passwordField(),
      );
    });

    it.each([
      ['no address', ''],
      ['something that is not an address', 'not-an-address'],
    ])('asks for the address instead of starting recovery with %s', async (_case, typed) => {
      const props = renderSignIn();
      const email = screen.getByLabelText('Email address');
      if (typed) await userEvent.type(email, typed);
      await userEvent.type(passwordField(), PASSWORD);

      await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));

      expect(props.onForgotPassword).not.toHaveBeenCalled();
      expect(email).toHaveFocus();
    });

    it('holds the password field and the recovery link while a request is in flight', () => {
      renderSignIn({ phase: 'checking_account' });

      expect(passwordField()).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeDisabled();
    });

    it('holds the recovery link until the identity client is ready', () => {
      renderSignIn({ ready: false });

      expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeDisabled();
    });

    it('drops the typed password when the screen switches between signing in and signing up', async () => {
      const props = {
        providers: PROVIDERS,
        ready: true,
        phase: 'idle' as const,
        error: null,
        fieldError: null,
        switchOffered: false,
        providerPending: null,
        onSubmit: vi.fn(),
        onSubmitPassword: vi.fn(),
        onForgotPassword: vi.fn(),
        onStartProvider: vi.fn(),
      };
      const { rerender } = render(<AuthEmailStep {...props} mode="login" switchUrl="/signup" />);
      await userEvent.type(passwordField(), PASSWORD);
      expect(passwordField()).toHaveValue(PASSWORD);

      rerender(<AuthEmailStep {...props} mode="signup" switchUrl="/login" />);
      expect(screen.queryByLabelText('Password')).toBeNull();
      rerender(<AuthEmailStep {...props} mode="login" switchUrl="/signup" />);

      expect(passwordField()).toHaveValue('');
      await userEvent.type(screen.getByLabelText('Email address'), `${EMAIL}{Enter}`);
      expect(props.onSubmit).toHaveBeenCalledWith(EMAIL);
      expect(props.onSubmitPassword).not.toHaveBeenCalled();
    });

    it('keeps an address and a password the browser filled before the screen hydrated', async () => {
      const props = {
        mode: 'login' as const,
        providers: PROVIDERS,
        switchUrl: '/signup',
        ready: true,
        phase: 'idle' as const,
        error: null,
        fieldError: null,
        switchOffered: false,
        providerPending: null,
        onSubmit: vi.fn(),
        onSubmitPassword: vi.fn(),
        onForgotPassword: vi.fn(),
        onStartProvider: vi.fn(),
      };
      const container = document.createElement('div');
      document.body.appendChild(container);
      container.innerHTML = renderToString(<AuthEmailStep {...props} />);
      container.querySelector<HTMLInputElement>('input[name="email"]')!.value = EMAIL;
      container.querySelector<HTMLInputElement>('input[name="password"]')!.value = PASSWORD;

      render(<AuthEmailStep {...props} />, { container, hydrate: true });

      await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled());
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

      expect(screen.getByLabelText('Email address')).toHaveValue(EMAIL);
      expect(passwordField()).toHaveValue(PASSWORD);
      expect(props.onSubmitPassword).toHaveBeenCalledWith(EMAIL, PASSWORD);
      expect(props.onSubmit).not.toHaveBeenCalled();
    });

    it('declares a form a script-less submit could never write into the address bar', () => {
      renderSignIn();

      expect(passwordField().closest('form')).toHaveAttribute('method', 'post');
    });

    it('keeps the screen as it was where no password handler is given', () => {
      renderStep();

      expect(screen.queryByLabelText('Password')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Forgot password?' })).toBeNull();
    });
  });

  describe('passkey sign-in', () => {
    function withPasskeySupport(supported: boolean) {
      if (supported) {
        Object.defineProperty(window, 'PublicKeyCredential', {
          configurable: true,
          value: function PublicKeyCredential() {},
        });
      } else {
        Reflect.deleteProperty(window, 'PublicKeyCredential');
      }
    }

    it('offers a passkey when it is configured and the browser supports it', async () => {
      withPasskeySupport(true);
      const onStartPasskey = vi.fn();
      renderStep({ passkeySignIn: true, onStartPasskey });

      await userEvent.click(
        await screen.findByRole('button', { name: 'Sign in with a passkey or security key' }),
      );

      expect(onStartPasskey).toHaveBeenCalledTimes(1);
      withPasskeySupport(false);
    });

    it('hides the passkey control when the deployment has not turned passkeys on', () => {
      withPasskeySupport(true);
      renderStep({ passkeySignIn: false, onStartPasskey: vi.fn() });

      expect(
        screen.queryByRole('button', { name: 'Sign in with a passkey or security key' }),
      ).toBeNull();
      withPasskeySupport(false);
    });

    it('hides the passkey control in a browser without passkey support', () => {
      withPasskeySupport(false);
      renderStep({ passkeySignIn: true, onStartPasskey: vi.fn() });

      expect(
        screen.queryByRole('button', { name: 'Sign in with a passkey or security key' }),
      ).toBeNull();
    });
  });
});

describe('the optional marketing email box on sign up', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'globalPrivacyControl');
  });

  it('sits directly under the required box as a real label, unticked and never required', () => {
    renderStep({ mode: 'signup' });
    const box = marketingEmailBox();

    expect(box).not.toBeChecked();
    expect(box).not.toBeRequired();
    expect(box).not.toHaveAttribute('aria-required');
    expect(box).not.toHaveAttribute('aria-invalid');
    expect(box).not.toHaveAccessibleDescription();
    expect(box.closest('label')).toHaveTextContent(MARKETING_EMAIL_CONSENT_PURPOSE.label);
    expect(box.closest('label')).toHaveAttribute('for', box.id);

    const required = screen.getByTestId('auth-signup-consent');
    const optional = screen.getByTestId('auth-marketing-email-consent');
    expect(required.nextElementSibling).toBe(optional);
    expect(optional.nextElementSibling).toBe(screen.getByTestId('auth-data-use-notice'));
  });

  it('follows the required box and its two policy links in keyboard order', async () => {
    renderStep({ mode: 'signup' });

    consentBox().focus();
    await userEvent.tab();
    expect(screen.getByRole('link', { name: 'Terms of Use' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveFocus();
    await userEvent.tab();

    expect(marketingEmailBox()).toHaveFocus();
    await userEvent.keyboard(' ');
    expect(marketingEmailBox()).toBeChecked();
    expect(consentBox()).not.toBeChecked();
  });

  it('is not on the sign-in screen', () => {
    renderStep();

    expect(screen.queryByTestId('auth-marketing-email-consent')).toBeNull();
  });

  it('starts unticked on every mount, whatever the last visit chose', async () => {
    const first = render(
      <AuthEmailStep
        mode="signup"
        providers={PROVIDERS}
        switchUrl="/login"
        ready
        phase="idle"
        error={null}
        fieldError={null}
        switchOffered={false}
        providerPending={null}
        onSubmit={vi.fn()}
        onStartProvider={vi.fn()}
      />,
    );
    await userEvent.click(marketingEmailBox());
    expect(marketingEmailBox()).toBeChecked();
    first.unmount();

    renderStep({ mode: 'signup' });

    expect(marketingEmailBox()).not.toBeChecked();
  });

  it.each([
    ['left unticked', false],
    ['ticked', true],
  ])('admits an attempt with the box %s and reports that choice', async (_case, ticked) => {
    const onSignupAdmitted = vi.fn();
    const onStartProvider = vi.fn();
    renderStep({ mode: 'signup', onSignupAdmitted, onStartProvider });

    await userEvent.click(consentBox());
    if (ticked) await userEvent.click(marketingEmailBox());
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    expect(onStartProvider).toHaveBeenCalledWith('google');
    expect(onSignupAdmitted).toHaveBeenCalledTimes(1);
    expect(onSignupAdmitted).toHaveBeenCalledWith({ marketingEmail: ticked });
    expect(onSignupAdmitted.mock.invocationCallOrder[0] ?? Number.NaN).toBeLessThan(
      onStartProvider.mock.invocationCallOrder[0] ?? Number.NaN,
    );
  });

  it('never stands in for the required box, and leaves its refusal as it was', async () => {
    const onSignupAdmitted = vi.fn();
    const props = renderStep({ mode: 'signup', onSignupAdmitted });

    await userEvent.click(marketingEmailBox());
    await userEvent.type(screen.getByLabelText('Email address'), 'person@example.com{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    expect(props.onSubmit).not.toHaveBeenCalled();
    expect(props.onStartProvider).not.toHaveBeenCalled();
    expect(onSignupAdmitted).not.toHaveBeenCalled();
    expectRefused();
    expect(marketingEmailBox()).toBeChecked();
    expect(marketingEmailBox()).not.toHaveAttribute('aria-invalid');

    await userEvent.click(marketingEmailBox());

    expect(within(screen.getByTestId('auth-signup-consent')).getByRole('alert')).toHaveTextContent(
      ACCOUNT_SIGNUP_CONSENT_REQUIRED_MESSAGE,
    );
    expect(consentBox()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByTestId('auth-marketing-email-consent')).not.toContainElement(
      screen.getByRole('alert'),
    );
  });

  it('reports the choice as it stands at each attempt, not as it stood at the first', async () => {
    const onSignupAdmitted = vi.fn();
    const onRetry = vi.fn();
    renderStep({
      mode: 'signup',
      error: 'We could not reach the server. Check your connection and try again.',
      retryOffered: true,
      onRetry,
      onSignupAdmitted,
    });

    await userEvent.click(consentBox());
    await userEvent.click(marketingEmailBox());
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await userEvent.click(marketingEmailBox());
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onSignupAdmitted.mock.calls).toEqual([
      [{ marketingEmail: true }],
      [{ marketingEmail: false }],
    ]);
  });

  it('is held while a request is in flight, as the required box is', () => {
    renderStep({ mode: 'signup', phase: 'checking_account' });

    expect(consentBox()).toBeDisabled();
    expect(marketingEmailBox()).toBeDisabled();
  });

  it.each([
    ['the browser property', () => signalGlobalPrivacyControl(), {}],
    ['the request header', () => undefined, { optedOutBySignal: true }],
  ])(
    'cannot be ticked under Global Privacy Control read from %s, and says why',
    async (_source, signal, overrides) => {
      signal();
      const onSignupAdmitted = vi.fn();
      const props = renderStep({ mode: 'signup', onSignupAdmitted, ...overrides });
      const box = marketingEmailBox();

      expect(box).toHaveAttribute('aria-disabled', 'true');
      expect(box).not.toBeChecked();
      expect(box).toHaveAccessibleDescription(GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE);
      expect(screen.getByText(GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE)).toBeVisible();

      await userEvent.click(box);
      await userEvent.click(screen.getByText(MARKETING_EMAIL_CONSENT_PURPOSE.label));
      await userEvent.click(consentBox());
      await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

      expect(box).not.toBeChecked();
      expect(props.onStartProvider).toHaveBeenCalledWith('google');
      expect(onSignupAdmitted).toHaveBeenCalledWith({ marketingEmail: false });
    },
  );

  it('lets the keyboard reach a box held under Global Privacy Control, so its reason is read out, and Space leaves it empty', async () => {
    renderStep({ mode: 'signup', optedOutBySignal: true });

    consentBox().focus();
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();

    expect(marketingEmailBox()).toHaveFocus();
    expect(marketingEmailBox()).toHaveAccessibleDescription(
      GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE,
    );
    await userEvent.keyboard(' ');
    expect(marketingEmailBox()).not.toBeChecked();
    expect(marketingEmailBox().closest('label')).toHaveClass('cursor-not-allowed');
    expect(marketingEmailBox().closest('label')).not.toHaveClass('cursor-pointer');
  });

  it('comes back unticked when the screen returns to sign up without remounting', async () => {
    const onSignupAdmitted = vi.fn();
    const props = {
      providers: PROVIDERS,
      ready: true,
      phase: 'idle' as const,
      error: null,
      fieldError: null,
      switchOffered: false,
      providerPending: null,
      onSubmit: vi.fn(),
      onStartProvider: vi.fn(),
      onSignupAdmitted,
    };
    const { rerender } = render(<AuthEmailStep {...props} mode="signup" switchUrl="/login" />);
    await userEvent.click(marketingEmailBox());
    expect(marketingEmailBox()).toBeChecked();

    rerender(<AuthEmailStep {...props} mode="login" switchUrl="/signup" />);
    rerender(<AuthEmailStep {...props} mode="signup" switchUrl="/login" />);

    expect(marketingEmailBox()).not.toBeChecked();
    await userEvent.click(consentBox());
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(onSignupAdmitted).toHaveBeenCalledWith({ marketingEmail: false });
  });

  it('says nothing about the signal when the browser sends none', () => {
    renderStep({ mode: 'signup' });

    expect(marketingEmailBox()).toBeEnabled();
    expect(marketingEmailBox()).not.toHaveAttribute('aria-disabled');
    expect(screen.queryByText(GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE)).toBeNull();
  });
});

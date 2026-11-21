import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';

import { ACCOUNT_AGE_FIELD_LABEL } from '@agiworkforce/types';

import { MARKETING_EMAIL_CONSENT_PURPOSE } from '@/lib/consent-purposes';

import { AuthEmailStep } from '../AuthEmailStep';
import type { AuthProvider } from '../authContract';

const PROVIDERS: readonly AuthProvider[] = [
  { id: 'google', label: 'Google' },
  { id: 'github', label: 'GitHub' },
];

const HEADING = 'Log in or sign up';
const AGREEMENT_SENTENCE = 'By continuing, you agree to our Terms and Privacy Policy.';
const EMAIL = 'person@example.com';
const PASSKEY_BUTTON = 'Sign in with a passkey or security key';

function stepProps(overrides: Partial<Parameters<typeof AuthEmailStep>[0]> = {}) {
  return {
    providers: PROVIDERS,
    ready: true,
    phase: 'idle' as const,
    error: null,
    fieldError: null,
    providerPending: null,
    onSubmit: vi.fn(),
    onStartProvider: vi.fn(),
    ...overrides,
  };
}

function renderStep(overrides: Partial<Parameters<typeof AuthEmailStep>[0]> = {}) {
  const props = stepProps(overrides);
  render(<AuthEmailStep {...props} />);
  return props;
}

function withPasskeySupport(supported: boolean): void {
  if (supported) {
    Object.defineProperty(window, 'PublicKeyCredential', {
      configurable: true,
      value: function PublicKeyCredential() {},
    });
  } else {
    Reflect.deleteProperty(window, 'PublicKeyCredential');
  }
}

function follows(first: Element, second: Element): boolean {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

afterEach(() => {
  withPasskeySupport(false);
});

describe('the one screen for logging in and signing up', () => {
  it('shows the heading, the providers, the divider, the address, Continue, the agreement and the footer, in that order', () => {
    renderStep();

    const heading = screen.getByRole('heading', { name: HEADING });
    const google = screen.getByRole('button', { name: 'Continue with Google' });
    const github = screen.getByRole('button', { name: 'Continue with GitHub' });
    const divider = screen.getByText('or');
    const address = screen.getByLabelText('Email address');
    const submit = screen.getByRole('button', { name: 'Continue' });
    const agreement = screen.getByTestId('auth-signup-agreement');
    const footer = screen.getByTestId('auth-legal-footer');

    const order = [heading, google, github, divider, address, submit, agreement, footer];
    for (let index = 1; index < order.length; index += 1) {
      expect(follows(order[index - 1]!, order[index]!), `item ${index}`).toBe(true);
    }
    expect(address).toHaveAttribute('placeholder', 'you@example.com');
  });

  it('carries no sentence beyond its agreement line: no subtitle, no switch line, no notice', () => {
    renderStep();

    const step = screen.getByRole('region', { name: HEADING });
    const paragraphs = within(step).queryAllByRole('paragraph');
    expect(paragraphs).toEqual([screen.getByTestId('auth-signup-agreement')]);
    expect(screen.queryByText(/Already have an account/)).toBeNull();
    expect(screen.queryByText(/Don.t have an account/)).toBeNull();
    expect(screen.queryByRole('link', { name: /^(Sign up|Log in)$/ })).toBeNull();
    expect(screen.queryByTestId('auth-data-use-notice')).toBeNull();
    expect(screen.queryByText(/train/i)).toBeNull();
  });

  it('asks for no password, no age and no marketing email choice', () => {
    renderStep();

    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Forgot password?' })).toBeNull();
    expect(screen.queryByLabelText(ACCOUNT_AGE_FIELD_LABEL)).toBeNull();
    expect(screen.queryByTestId('auth-age-field')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText(MARKETING_EMAIL_CONSENT_PURPOSE.label)).toBeNull();
    expect(screen.getAllByRole('textbox')).toEqual([screen.getByLabelText('Email address')]);
  });

  it('states the agreement under Continue as one line of fine print, with no box to tick', () => {
    renderStep();

    const agreement = screen.getByTestId('auth-signup-agreement');
    expect(agreement).toHaveTextContent(AGREEMENT_SENTENCE);
    expect(agreement.tagName).toBe('P');
    expect(agreement).toHaveClass('text-xs');
    expect(screen.getAllByText(/By continuing/)).toHaveLength(1);
    expect(within(agreement).getByRole('link', { name: 'Terms' })).toHaveAttribute(
      'href',
      '/terms',
    );
    expect(within(agreement).getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });

  it('gives Continue and every provider button the agreement as their description', async () => {
    withPasskeySupport(true);
    renderStep({ passkeySignIn: true, onStartPasskey: vi.fn() });

    const described = [
      screen.getByRole('button', { name: 'Continue' }),
      screen.getByRole('button', { name: 'Continue with Google' }),
      screen.getByRole('button', { name: 'Continue with GitHub' }),
      await screen.findByRole('button', { name: PASSKEY_BUTTON }),
    ];
    for (const control of described) {
      expect(control).toHaveAccessibleDescription(AGREEMENT_SENTENCE);
    }
  });

  it('keeps the footer links as they were, and links each policy once from the agreement', () => {
    renderStep();

    const linksIn = (region: HTMLElement) =>
      within(region)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]);

    expect(linksIn(screen.getByTestId('auth-legal-footer'))).toEqual([
      ['Help', '/help'],
      ['Privacy', '/privacy'],
      ['Terms', '/terms'],
      ['Contact', '/contact'],
    ]);
    expect(linksIn(screen.getByTestId('auth-signup-agreement'))).toEqual([
      ['Terms', '/terms'],
      ['Privacy Policy', '/privacy'],
    ]);
  });

  it('submits the trimmed email from Continue and from Enter', async () => {
    const props = renderStep();

    await userEvent.type(screen.getByLabelText('Email address'), `  ${EMAIL}  `);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.type(screen.getByLabelText('Email address'), '{Enter}');

    expect(props.onSubmit).toHaveBeenNthCalledWith(1, EMAIL);
    expect(props.onSubmit).toHaveBeenNthCalledWith(2, EMAIL);
  });

  it('starts each provider from its own button', async () => {
    const props = renderStep();

    await userEvent.click(screen.getByRole('button', { name: 'Continue with GitHub' }));

    expect(props.onStartProvider).toHaveBeenCalledWith('github');
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('shows no divider when there is no other way in above the address', () => {
    renderStep({ providers: [] });

    expect(screen.queryByText('or')).toBeNull();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
  });

  it('shows a failure inline rather than as a banner', () => {
    renderStep({ error: 'Could not continue.' });

    expect(screen.getByRole('alert')).toHaveTextContent('Could not continue.');
  });

  it('ties an address problem to the address field, with no way to switch screens', () => {
    renderStep({ fieldError: 'Enter a valid email address.' });

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(screen.getByLabelText('Email address')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('link', { name: /instead/ })).toBeNull();
  });

  it('waits for the identity client before letting the form or a provider start', () => {
    renderStep({ ready: false });

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
  });

  it('holds every control while a request is in flight', () => {
    renderStep({ phase: 'checking_account' });

    expect(screen.getByLabelText('Email address')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
  });

  it('offers a retry for the attempt that failed, and not once the address has changed', async () => {
    const onRetry = vi.fn();
    const onSubmit = vi.fn();
    const { rerender } = render(<AuthEmailStep {...stepProps({ onSubmit })} />);
    await userEvent.type(screen.getByLabelText('Email address'), `${EMAIL}{Enter}`);
    rerender(<AuthEmailStep {...stepProps({ onSubmit, retryOffered: true, onRetry })} />);

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    await userEvent.type(screen.getByLabelText('Email address'), 'x');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('keeps an address the browser filled before the screen hydrated', async () => {
    const props = stepProps();
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = renderToString(<AuthEmailStep {...props} />);
    container.querySelector<HTMLInputElement>('input[name="email"]')!.value = EMAIL;

    render(<AuthEmailStep {...props} />, { container, hydrate: true });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByLabelText('Email address')).toHaveValue(EMAIL);
    expect(props.onSubmit).toHaveBeenCalledWith(EMAIL);
  });

  it('declares a form a script-less submit could never write into the address bar', () => {
    renderStep();

    expect(screen.getByLabelText('Email address').closest('form')).toHaveAttribute(
      'method',
      'post',
    );
  });
});

describe('passkey sign-in on the combined screen', () => {
  it('offers a passkey above the divider when it is configured and the browser supports it', async () => {
    withPasskeySupport(true);
    const onStartPasskey = vi.fn();
    renderStep({ passkeySignIn: true, onStartPasskey });

    const passkey = await screen.findByRole('button', { name: PASSKEY_BUTTON });
    expect(follows(passkey, screen.getByText('or'))).toBe(true);
    await userEvent.click(passkey);

    expect(onStartPasskey).toHaveBeenCalledTimes(1);
  });

  it('keeps the divider for a passkey when no provider is configured', async () => {
    withPasskeySupport(true);
    renderStep({ providers: [], passkeySignIn: true, onStartPasskey: vi.fn() });

    await screen.findByRole('button', { name: PASSKEY_BUTTON });
    expect(screen.getByText('or')).toBeInTheDocument();
  });

  it('hides the passkey control when the deployment has not turned passkeys on', () => {
    withPasskeySupport(true);
    renderStep({ passkeySignIn: false, onStartPasskey: vi.fn() });

    expect(screen.queryByRole('button', { name: PASSKEY_BUTTON })).toBeNull();
  });

  it('hides the passkey control in a browser without passkey support', () => {
    renderStep({ passkeySignIn: true, onStartPasskey: vi.fn() });

    expect(screen.queryByRole('button', { name: PASSKEY_BUTTON })).toBeNull();
  });
});

describe('a host-provided way in', () => {
  it('sits above the provider buttons, so it is not below the fold', () => {
    renderStep({
      hostWayIn: (
        <button type="button" data-testid="host-way-in">
          Continue in your browser
        </button>
      ),
    });

    const hostWayIn = screen.getByTestId('host-way-in');
    expect(follows(hostWayIn, screen.getByRole('button', { name: /Google/ }))).toBe(true);
    expect(follows(hostWayIn, screen.getByLabelText('Email address'))).toBe(true);
  });
});

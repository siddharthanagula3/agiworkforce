import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ACCOUNT_AGE_FIELD_LABEL, ACCOUNT_MINIMUM_AGE } from '@agiworkforce/types';

const client = vi.hoisted(() => ({
  isReady: true,
  startWithEmail: vi.fn(),
  signInWithPassword: vi.fn(),
  submitPassword: vi.fn(),
  submitCode: vi.fn(),
  resendCode: vi.fn(),
  submitSecondFactor: vi.fn(),
  switchSecondFactor: vi.fn(),
  submitNewPassword: vi.fn(),
  startPasswordReset: vi.fn(),
  startPasswordResetFor: vi.fn(),
  startMethod: vi.fn(),
  startProvider: vi.fn(),
  signInWithPasskey: vi.fn(),
  restart: vi.fn(),
}));

vi.mock('../identityAuthAdapter', () => ({
  useIdentityAuthClient: () => client,
  useIdentityTicketSignIn: () => ({ ready: true, signInWithTicket: vi.fn() }),
  IdentityBotProtection: () => null,
  IdentitySsoCallback: () => null,
}));

vi.mock('../useCountdown', () => ({
  useCountdown: () => [0, () => undefined],
}));

import {
  AuthSceneBridgeProvider,
  createSceneStore,
  SCENE_SERVER_SNAPSHOT,
  type SceneStore,
} from '@agiworkforce/ui/auth-scene';

import { AuthFlow } from '../AuthFlow';
import { AUTH_ERROR_SOURCE_COPY } from '@/lib/auth/error-taxonomy.copy';
import type { AuthMode, AuthProvider, AuthResult } from '../authContract';

const PROVIDERS: readonly AuthProvider[] = [{ id: 'google', label: 'Google' }];
const EMAIL = 'person@example.com';
const PASSWORD = 'correct horse battery';
const CODE = '123456';
const LAST_METHOD_KEY = 'agiworkforce-auth-last-method';
const REDIRECTS = {
  completeUrl: '/login/complete',
  switchUrl: '/signup',
  ssoCallbackUrl: '/auth/sso-callback',
};

const WRONG_PASSWORD: AuthResult = {
  status: 'failed',
  kind: 'credentials_invalid',
  message: AUTH_ERROR_SOURCE_COPY.credentials_invalid.message,
  field: 'password',
};

const PASSWORDLESS_CODE: AuthResult = {
  status: 'next',
  step: {
    kind: 'code',
    email: EMAIL,
    purpose: 'sign_in',
    methods: ['email_code'],
    passwordless: true,
  },
};

function held<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function renderFlow(mode: AuthMode = 'login', store: SceneStore = createSceneStore()) {
  render(
    <AuthSceneBridgeProvider value={store}>
      <AuthFlow mode={mode} providers={PROVIDERS} redirects={REDIRECTS} />
    </AuthSceneBridgeProvider>,
  );
  return store;
}

function emailField(): HTMLInputElement {
  return screen.getByLabelText('Email address') as HTMLInputElement;
}

function passwordField(): HTMLInputElement {
  return screen.getByLabelText('Password') as HTMLInputElement;
}

async function submitBoth(password = PASSWORD) {
  await userEvent.type(emailField(), EMAIL);
  await userEvent.type(passwordField(), password);
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

beforeEach(() => {
  client.isReady = true;
  for (const fn of Object.values(client)) {
    if (typeof fn === 'function' && 'mockReset' in fn) {
      fn.mockReset();
      fn.mockResolvedValue({ status: 'complete' } as AuthResult);
    }
  }
  window.localStorage.clear();
});

describe('sign-in with the address and the password on one screen', () => {
  it('sends both in one action, says the account is being checked, then that it is signing in', async () => {
    const gate = held<AuthResult>();
    client.signInWithPassword.mockReturnValue(gate.promise);
    renderFlow();

    await submitBoth();

    expect(client.signInWithPassword).toHaveBeenCalledTimes(1);
    expect(client.signInWithPassword).toHaveBeenCalledWith(EMAIL, PASSWORD);
    expect(client.startWithEmail).not.toHaveBeenCalled();
    expect(client.submitPassword).not.toHaveBeenCalled();
    expect(screen.getByTestId('auth-phase')).toHaveTextContent('Checking your account');
    expect(passwordField()).toBeDisabled();

    gate.resolve({ status: 'complete' });

    await waitFor(() =>
      expect(screen.getByTestId('auth-phase')).toHaveTextContent('Signing you in'),
    );
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });

  it('refuses a wrong password on the same screen, against the password field', async () => {
    client.signInWithPassword.mockResolvedValue(WRONG_PASSWORD);
    renderFlow();

    await submitBoth('not the password');

    const password = passwordField();
    await waitFor(() => expect(password).toHaveAttribute('aria-invalid', 'true'));
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent(AUTH_ERROR_SOURCE_COPY.credentials_invalid.message);
    expect(password.getAttribute('aria-describedby')?.split(' ')).toContain(alerts[0]!.id);
    expect(emailField()).not.toHaveAttribute('aria-invalid');
    expect(emailField()).toHaveValue(EMAIL);
    expect(password).toHaveValue('not the password');
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Enter your password' })).toBeNull();
    await waitFor(() => expect(password).toHaveFocus());
  });

  it('takes the refusal back when the next attempt starts, and sends the corrected password', async () => {
    client.signInWithPassword.mockResolvedValueOnce(WRONG_PASSWORD);
    const gate = held<AuthResult>();
    client.signInWithPassword.mockReturnValueOnce(gate.promise);
    renderFlow();
    await submitBoth('not the password');
    await screen.findByRole('alert');

    await userEvent.clear(passwordField());
    await userEvent.type(passwordField(), `${PASSWORD}{Enter}`);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(client.signInWithPassword).toHaveBeenLastCalledWith(EMAIL, PASSWORD);
    gate.resolve({ status: 'complete' });
  });

  it('keeps a failure about the address on the address, though a password was typed', async () => {
    client.signInWithPassword.mockResolvedValue({
      status: 'failed',
      kind: 'identifier_not_found',
      message: AUTH_ERROR_SOURCE_COPY.identifier_not_found.message,
      field: 'email',
      switchMode: true,
    });
    renderFlow();

    await submitBoth();

    await waitFor(() => expect(emailField()).toHaveAttribute('aria-invalid', 'true'));
    expect(passwordField()).not.toHaveAttribute('aria-invalid');
    expect(screen.getByRole('link', { name: 'Sign up instead.' })).toHaveAttribute(
      'href',
      '/signup',
    );
  });

  it('takes an account without a password to its code step and says why a code is asked for', async () => {
    client.signInWithPassword.mockResolvedValue(PASSWORDLESS_CODE);
    client.resendCode.mockResolvedValue({ status: 'sent' });
    renderFlow();

    await submitBoth();

    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument();
    expect(
      screen.getByText(`This account does not use a password, so we emailed a code to ${EMAIL}`),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Resend code' }));
    await waitFor(() => expect(client.resendCode).toHaveBeenCalledWith('sign_in'));
    await userEvent.type(screen.getByLabelText('Code'), CODE);
    await waitFor(() => expect(client.submitCode).toHaveBeenCalledWith(CODE, 'sign_in'));
  });

  it('says nothing about a password on a code step that no typed password led to', async () => {
    client.startWithEmail.mockResolvedValue({
      status: 'next',
      step: { kind: 'code', email: EMAIL, purpose: 'sign_in', methods: ['email_code'] },
    });
    renderFlow();

    await userEvent.type(emailField(), `${EMAIL}{Enter}`);

    await screen.findByLabelText('Code');
    expect(screen.getByText(`We sent a code to ${EMAIL}`)).toBeInTheDocument();
    expect(screen.queryByText(/does not use a password/)).toBeNull();
  });

  it('keeps the email-first path for an empty password, and remembers no method for it', async () => {
    client.startWithEmail.mockResolvedValue({
      status: 'next',
      step: { kind: 'password', email: EMAIL, methods: ['password', 'email_code'] },
    });
    renderFlow();

    await userEvent.type(emailField(), EMAIL);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('heading', { name: 'Enter your password' })).toBeInTheDocument();
    expect(client.startWithEmail).toHaveBeenCalledTimes(1);
    expect(client.startWithEmail).toHaveBeenCalledWith(EMAIL);
    expect(client.signInWithPassword).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(LAST_METHOD_KEY)).toBeNull();
  });

  it('remembers the password as the last method once one is submitted', async () => {
    renderFlow();

    await submitBoth();

    await waitFor(() => expect(client.signInWithPassword).toHaveBeenCalledTimes(1));
    expect(window.localStorage.getItem(LAST_METHOD_KEY)).toBe('method:password');
  });

  it('offers the same attempt again after the network drops', async () => {
    client.signInWithPassword.mockResolvedValueOnce({
      status: 'failed',
      kind: 'network_unreachable',
      message: AUTH_ERROR_SOURCE_COPY.network_unreachable.message,
    });
    renderFlow();
    await submitBoth();

    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(client.signInWithPassword).toHaveBeenCalledTimes(2));
    expect(client.signInWithPassword).toHaveBeenLastCalledWith(EMAIL, PASSWORD);
    expect(passwordField()).not.toHaveAttribute('aria-invalid');
  });

  it.each([
    ['the password', () => userEvent.type(passwordField(), ' staple'), EMAIL, `${PASSWORD} staple`],
    ['the address', () => userEvent.type(emailField(), '.uk'), `${EMAIL}.uk`, PASSWORD],
  ])(
    'withdraws the retry once %s is edited, so what was typed before is never sent again',
    async (_field, edit, sentEmail, sentPassword) => {
      client.signInWithPassword.mockResolvedValueOnce({
        status: 'failed',
        kind: 'network_unreachable',
        message: AUTH_ERROR_SOURCE_COPY.network_unreachable.message,
      });
      renderFlow();
      await submitBoth();
      await screen.findByRole('button', { name: 'Try again' });

      await edit();

      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
      await waitFor(() => expect(client.signInWithPassword).toHaveBeenCalledTimes(2));
      expect(client.signInWithPassword).toHaveBeenLastCalledWith(sentEmail, sentPassword);
    },
  );

  it('remembers the password as the last method when the provider checked it and refused it', async () => {
    client.signInWithPassword.mockResolvedValue(WRONG_PASSWORD);
    renderFlow();

    await submitBoth();

    await screen.findByRole('alert');
    expect(window.localStorage.getItem(LAST_METHOD_KEY)).toBe('method:password');
  });

  it.each([
    ['an account that has none', PASSWORDLESS_CODE],
    [
      'a request that never arrived',
      {
        status: 'failed',
        kind: 'network_unreachable',
        message: AUTH_ERROR_SOURCE_COPY.network_unreachable.message,
      } as AuthResult,
    ],
    [
      'an address with no account',
      {
        status: 'failed',
        kind: 'identifier_not_found',
        message: AUTH_ERROR_SOURCE_COPY.identifier_not_found.message,
        field: 'email',
        switchMode: true,
      } as AuthResult,
    ],
  ])('remembers no method for a password typed for %s', async (_case, result) => {
    client.signInWithPassword.mockResolvedValue(result);
    renderFlow();

    await submitBoth();

    await waitFor(() => expect(client.signInWithPassword).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('auth-phase')).toHaveTextContent(''));
    expect(window.localStorage.getItem(LAST_METHOD_KEY)).toBeNull();
  });

  it('shows a failure about a password on sign-up, where no password field can carry it', async () => {
    client.startWithEmail.mockResolvedValue({
      status: 'failed',
      kind: 'unexpected',
      message: 'This sign-up needs a password.',
      field: 'password',
    });
    renderFlow('signup');
    await userEvent.type(
      screen.getByLabelText(ACCOUNT_AGE_FIELD_LABEL),
      String(ACCOUNT_MINIMUM_AGE),
    );

    await userEvent.type(emailField(), EMAIL);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This sign-up needs a password.');
    expect(emailField()).not.toHaveAttribute('aria-invalid');
  });

  it('starts recovery for the typed address and says a code is on its way', async () => {
    const gate = held<AuthResult>();
    client.startPasswordResetFor.mockReturnValue(gate.promise);
    renderFlow();
    await userEvent.type(emailField(), EMAIL);

    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));

    expect(client.startPasswordResetFor).toHaveBeenCalledTimes(1);
    expect(client.startPasswordResetFor).toHaveBeenCalledWith(EMAIL);
    expect(client.startPasswordReset).not.toHaveBeenCalled();
    expect(client.startWithEmail).not.toHaveBeenCalled();
    expect(screen.getByTestId('auth-phase')).toHaveTextContent('Sending your code');

    gate.resolve({
      status: 'next',
      step: { kind: 'code', email: EMAIL, purpose: 'reset', methods: ['password'] },
    });

    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Code'), CODE);
    await waitFor(() => expect(client.submitCode).toHaveBeenCalledWith(CODE, 'reset'));
  });

  it('starts no recovery until an address is typed', async () => {
    renderFlow();

    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));

    expect(client.startPasswordResetFor).not.toHaveBeenCalled();
    expect(emailField()).toHaveFocus();
  });

  it('forgets the typed password once the step changes', async () => {
    client.signInWithPassword.mockResolvedValue(PASSWORDLESS_CODE);
    renderFlow();
    await submitBoth();
    await screen.findByLabelText('Code');

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(await screen.findByLabelText('Email address')).toHaveValue('');
    expect(passwordField()).toHaveValue('');
    expect(passwordField()).toHaveAttribute('type', 'password');
  });

  it('keeps the password out of the address bar and out of browser storage', async () => {
    client.signInWithPassword.mockResolvedValue(WRONG_PASSWORD);
    const before = window.location.href;
    renderFlow();

    await submitBoth();
    await screen.findByRole('alert');

    expect(window.location.href).toBe(before);
    const stored = [window.localStorage, window.sessionStorage].flatMap((storage) =>
      Array.from({ length: storage.length }, (_unused, index) => {
        const key = storage.key(index) ?? '';
        return `${key}=${storage.getItem(key) ?? ''}`;
      }),
    );
    expect(stored.join('\n')).not.toContain(PASSWORD);
    expect(document.cookie).not.toContain(PASSWORD);
  });

  it('asks a new account for no password on its first screen', () => {
    renderFlow('signup');

    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Forgot password?' })).toBeNull();
  });
});

describe('what the one-screen sign-in tells the scene', () => {
  function listenTo(store: SceneStore): string[] {
    const heard: string[] = [];
    const sources = new Map<string, string>();
    const sourceName = (source: string): string => {
      const known = sources.get(source);
      if (known) return known;
      const name = `${source.slice(0, source.indexOf(':'))}#${sources.size}`;
      sources.set(source, name);
      return name;
    };
    const fieldName = (element: HTMLInputElement | null): string =>
      element === null ? 'none' : `input[name=${element.name}]`;
    const { setPrivacy, setFocusTarget, watchBox, noteCaret, setMood, celebrate } = store;

    vi.spyOn(store, 'setPrivacy').mockImplementation((source, active) => {
      heard.push(`privacy ${sourceName(source)} ${String(active)}`);
      setPrivacy(source, active);
    });
    vi.spyOn(store, 'setFocusTarget').mockImplementation((element) => {
      heard.push(`focus ${fieldName(element)}`);
      setFocusTarget(element);
    });
    vi.spyOn(store, 'watchBox').mockImplementation((read) => {
      heard.push(read ? 'watch box' : 'watch none');
      watchBox(read);
    });
    vi.spyOn(store, 'noteCaret').mockImplementation((element) => {
      heard.push(`caret ${fieldName(element)}`);
      noteCaret(element);
    });
    vi.spyOn(store, 'setMood').mockImplementation((mood) => {
      heard.push(`mood ${mood}`);
      setMood(mood);
    });
    vi.spyOn(store, 'celebrate').mockImplementation(() => {
      heard.push('celebrate');
      celebrate();
    });
    return heard;
  }

  async function typeRevealHideAndBeRefused(password: string): Promise<string[]> {
    client.signInWithPassword.mockResolvedValue(WRONG_PASSWORD);
    const store = createSceneStore();
    const heard = listenTo(store);
    renderFlow('login', store);

    await userEvent.type(emailField(), EMAIL);
    await userEvent.type(passwordField(), password);
    const reveal = screen.getByRole('button', { name: 'Show password' });
    await userEvent.click(reveal);
    expect(passwordField()).toHaveAttribute('type', 'text');
    await userEvent.click(reveal);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(passwordField()).toHaveFocus());
    expect(client.signInWithPassword).toHaveBeenLastCalledWith(EMAIL, password);

    cleanup();
    return heard;
  }

  it('hears the password field on the first screen exactly as it hears the password step', async () => {
    const firstScreen = renderFlow();
    await userEvent.click(passwordField());
    expect(passwordField()).toHaveFocus();
    const heardOnTheFirstScreen = firstScreen.getSnapshot();
    cleanup();

    client.startWithEmail.mockResolvedValue({
      status: 'next',
      step: { kind: 'password', email: EMAIL, methods: [] },
    });
    const passwordStep = renderFlow();
    await userEvent.type(emailField(), `${EMAIL}{Enter}`);
    await screen.findByRole('heading', { name: 'Enter your password' });
    await waitFor(() => expect(passwordField()).toHaveFocus());

    expect(heardOnTheFirstScreen).not.toEqual(SCENE_SERVER_SNAPSHOT);
    expect(heardOnTheFirstScreen.attention).toBe('masked');
    expect(heardOnTheFirstScreen.privacy).toBe(false);
    expect(passwordStep.getSnapshot()).toEqual(heardOnTheFirstScreen);
  });

  it('hears the reveal button on the first screen, and lets go when the password is hidden and left', async () => {
    const store = renderFlow();
    await userEvent.type(passwordField(), PASSWORD);

    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    await userEvent.click(emailField());
    expect(store.getSnapshot().privacy).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    await userEvent.click(emailField());
    expect(store.getSnapshot().privacy).toBe(false);
  });

  it('waits while both are checked and shows concern for a refused password', async () => {
    const gate = held<AuthResult>();
    client.signInWithPassword.mockReturnValue(gate.promise);
    const store = renderFlow();

    await submitBoth();
    expect(store.getSnapshot().mood).toBe('pending');

    gate.resolve(WRONG_PASSWORD);
    await screen.findByRole('alert');
    expect(store.getSnapshot().mood).toBe('error');
    await waitFor(() => expect(passwordField()).toHaveFocus());
    expect(store.getSnapshot().attention).toBe('masked');
    expect(store.readLeaningIn()).toBe(false);
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });

  it('celebrates when the address and the password open the session', async () => {
    const store = renderFlow();
    const celebrate = vi.spyOn(store, 'celebrate');

    await submitBoth();

    await waitFor(() => expect(celebrate).toHaveBeenCalledTimes(1));
    expect(client.signInWithPassword).toHaveBeenCalledWith(EMAIL, PASSWORD);
  });

  it('tells the scene nothing that depends on what the password is or how long it is', async () => {
    const short = 'Zq9';
    const long = 'a much longer passphrase, with 46 characters!!';

    const heardForShort = await typeRevealHideAndBeRefused(short);
    const heardForLong = await typeRevealHideAndBeRefused(long);

    expect(heardForLong).toEqual(heardForShort);
    expect(heardForShort).toContain('caret input[name=email]');
    expect(heardForShort).toContain('watch box');
    expect(heardForShort.some((entry) => /^privacy toggle#\d+ true$/.test(entry))).toBe(true);
    expect(heardForShort.some((entry) => /^privacy reveal#\d+ true$/.test(entry))).toBe(true);
    expect(heardForShort.some((entry) => /caret input\[name=password\]/.test(entry))).toBe(false);
    expect(heardForShort).toContain('mood error');
    for (const entry of [...heardForShort, ...heardForLong]) {
      expect(entry).not.toContain('name=password');
      expect(entry).not.toContain(short);
      expect(entry).not.toContain(long);
    }
  });
});

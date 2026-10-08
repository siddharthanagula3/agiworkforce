import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ACCOUNT_AGE_FIELD_LABEL, ACCOUNT_MINIMUM_AGE } from '@agiworkforce/types';

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
} from '@agiworkforce/ui/auth-scene';

import { MARKETING_EMAIL_CONSENT_PURPOSE } from '@/lib/consent-purposes';

import { AuthFlow } from '../AuthFlow';
import type { AuthProvider, AuthResult } from '../authContract';

const PROVIDERS: readonly AuthProvider[] = [{ id: 'google', label: 'Google' }];
const EMAIL = 'person@example.com';
const CODE = '123456';
const REDIRECTS = {
  completeUrl: '/login/complete',
  switchUrl: '/signup',
  ssoCallbackUrl: '/auth/sso-callback',
};

function held<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function renderFlow(mode: 'login' | 'signup' = 'login') {
  const store = createSceneStore();
  render(
    <AuthSceneBridgeProvider value={store}>
      <AuthFlow mode={mode} providers={PROVIDERS} redirects={REDIRECTS} />
    </AuthSceneBridgeProvider>,
  );
  return store;
}

function ageField(): HTMLInputElement {
  return screen.getByLabelText(ACCOUNT_AGE_FIELD_LABEL) as HTMLInputElement;
}

function marketingEmailBox(): HTMLElement {
  return screen.getByRole('checkbox', { name: MARKETING_EMAIL_CONSENT_PURPOSE.label });
}

async function submitEmail() {
  await userEvent.type(screen.getByLabelText('Email address'), EMAIL);
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

describe('what the form tells the scene', () => {
  it('celebrates a finalised session and not a resent code', async () => {
    client.startWithEmail.mockResolvedValue({
      status: 'next',
      step: { kind: 'code', email: EMAIL, purpose: 'sign_in', methods: [] },
    });
    client.resendCode.mockResolvedValue({ status: 'sent' });
    const store = renderFlow();
    const celebrate = vi.spyOn(store, 'celebrate');

    await submitEmail();
    await screen.findByLabelText('Code');

    await userEvent.click(screen.getByRole('button', { name: 'Resend code' }));
    await waitFor(() => expect(client.resendCode).toHaveBeenCalledTimes(1));
    expect(celebrate).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Code'), CODE);
    await waitFor(() => expect(client.submitCode).toHaveBeenCalledWith(CODE, 'sign_in'));
    await waitFor(() => expect(celebrate).toHaveBeenCalledTimes(1));
  });

  it('reports waiting while a request is in flight and sympathy once it fails', async () => {
    const gate = held<AuthResult>();
    client.startWithEmail.mockReturnValue(gate.promise);
    const store = renderFlow();

    await submitEmail();
    expect(store.getSnapshot().mood).toBe('pending');

    gate.resolve({
      status: 'failed',
      kind: 'unexpected',
      message: 'Something went wrong. Try again.',
    });
    await screen.findByRole('alert');
    expect(store.getSnapshot().mood).toBe('error');

    await userEvent.clear(screen.getByLabelText('Email address'));
    await userEvent.type(screen.getByLabelText('Email address'), EMAIL);
    client.startWithEmail.mockResolvedValue({
      status: 'next',
      step: { kind: 'code', email: EMAIL, purpose: 'sign_in', methods: [] },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByLabelText('Code');
    expect(store.getSnapshot().mood).toBe('neutral');
  });

  it('shows sympathy for a refused sign-up attempt and recovers once the age is eligible', async () => {
    const store = renderFlow('signup');
    expect(store.getSnapshot().mood).toBe('neutral');

    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    expect(client.startProvider).not.toHaveBeenCalled();
    expect(store.getSnapshot().mood).toBe('error');

    await userEvent.type(ageField(), '1');
    expect(store.getSnapshot().mood).toBe('error');
    await userEvent.type(ageField(), '5');
    expect(store.getSnapshot().mood).toBe('neutral');
  });

  it('is handed the age field to follow, as it is the address, and never what the field holds', async () => {
    const store = renderFlow('signup');
    const handed = [
      vi.spyOn(store, 'setFocusTarget'),
      vi.spyOn(store, 'noteCaret'),
      vi.spyOn(store, 'watchBox'),
      vi.spyOn(store, 'setPrivacy'),
    ];

    await userEvent.type(ageField(), '57');

    const [setFocusTarget, noteCaret, watchBox, setPrivacy] = handed;
    expect(noteCaret).toHaveBeenCalledWith(ageField());
    expect(watchBox).not.toHaveBeenCalled();
    expect(setPrivacy).not.toHaveBeenCalled();
    for (const call of [...(setFocusTarget?.mock.calls ?? []), ...(noteCaret?.mock.calls ?? [])]) {
      expect(call).toHaveLength(1);
      expect(call[0] === null || call[0] instanceof HTMLInputElement).toBe(true);
    }
  });

  it('hears nothing from the optional box, and never takes it as an answer to a refusal', async () => {
    const store = renderFlow('signup');
    const heard = vi.fn();
    store.subscribe(heard);
    const bridge = [
      vi.spyOn(store, 'setPrivacy'),
      vi.spyOn(store, 'setFocusTarget'),
      vi.spyOn(store, 'watchBox'),
      vi.spyOn(store, 'noteCaret'),
      vi.spyOn(store, 'setMood'),
      vi.spyOn(store, 'celebrate'),
    ];
    const resting = store.getSnapshot();

    await userEvent.click(marketingEmailBox());
    await userEvent.click(marketingEmailBox());

    expect(bridge.map((spy) => spy.mock.calls.length).every((calls) => calls === 0)).toBe(true);
    expect(heard).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toEqual(resting);

    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(store.getSnapshot().mood).toBe('error');

    await userEvent.click(marketingEmailBox());
    expect(store.getSnapshot().mood).toBe('error');
    expect(client.startProvider).not.toHaveBeenCalled();
  });

  it('hears the create-password field exactly as it hears the sign-in password field', async () => {
    client.startWithEmail.mockResolvedValue({
      status: 'next',
      step: { kind: 'password', email: EMAIL, methods: [] },
    });
    const signIn = renderFlow();
    await submitEmail();
    await waitFor(() => expect(screen.getByLabelText('Password')).toHaveFocus());
    const heard = signIn.getSnapshot();
    cleanup();

    client.startWithEmail.mockResolvedValue({
      status: 'next',
      step: { kind: 'new_password', email: EMAIL, purpose: 'sign_up' },
    });
    const signUp = renderFlow('signup');
    await userEvent.type(ageField(), String(ACCOUNT_MINIMUM_AGE));
    await submitEmail();
    await screen.findByRole('heading', { name: 'Create a password' });
    await waitFor(() => expect(screen.getByLabelText('Password')).toHaveFocus());

    expect(heard).not.toEqual(SCENE_SERVER_SNAPSHOT);
    expect(signUp.getSnapshot()).toEqual(heard);
  });
});

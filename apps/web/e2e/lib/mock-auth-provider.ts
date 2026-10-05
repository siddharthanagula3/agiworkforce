import type { Page } from '@playwright/test';

import { AUTH_PASSWORD_MIN_LENGTH } from '../../features/auth/authContract';

export const MOCK_CODE_ACCOUNT = 'code-user@example.invalid';
export const MOCK_PASSWORD_ACCOUNT = 'password-user@example.invalid';
export const MOCK_ACCOUNT_PASSWORD = 'the one password this fixture accepts';
export const MOCK_SIGNUP_CODE_ONLY_ACCOUNT = 'new-code-only@example.invalid';
export const MOCK_SIGNUP_PASSWORD_ACCOUNT = 'new-needs-password@example.invalid';
export const MOCK_EMAILED_CODE = '123456';
export const MOCK_SHORT_PASSWORD_REFUSAL = `Passwords must be ${AUTH_PASSWORD_MIN_LENGTH} characters or more.`;
const MOCK_CODE_CHECK_MS = 300;

export interface MockAuthProviderCalls {
  signInCreate: number;
  signUpCreate: number;
  signUpSso: number;
}

export interface MockAuthProviderProgress {
  signInCodeChecks: number;
  signUpCodeChecks: number;
  signUpPasswords: number;
  signUpFinalizes: number;
}

export interface MockAuthProviderSignIn {
  passwordChecks: number;
  sessionsOpened: number;
  resetCodesSent: number;
}

declare global {
  interface Window {
    __agiMockAuthProviderCalls?: MockAuthProviderCalls;
    __agiMockAuthProviderProgress?: MockAuthProviderProgress;
    __agiMockAuthProviderSignIn?: MockAuthProviderSignIn;
  }
}

/** How many times the page reached the stubbed provider, by entry point. */
export async function mockAuthProviderCalls(page: Page): Promise<MockAuthProviderCalls> {
  return page.evaluate(
    () => window.__agiMockAuthProviderCalls ?? { signInCreate: 0, signUpCreate: 0, signUpSso: 0 },
  );
}

/** How far a started sign-in or sign-up went: codes checked, passwords set, sessions asked for. */
export async function mockAuthProviderProgress(page: Page): Promise<MockAuthProviderProgress> {
  return page.evaluate(
    () =>
      window.__agiMockAuthProviderProgress ?? {
        signInCodeChecks: 0,
        signUpCodeChecks: 0,
        signUpPasswords: 0,
        signUpFinalizes: 0,
      },
  );
}

/** What a password sign-in reached: passwords the provider was asked to check, sessions, reset codes. */
export async function mockAuthProviderSignIn(page: Page): Promise<MockAuthProviderSignIn> {
  return page.evaluate(
    () =>
      window.__agiMockAuthProviderSignIn ?? {
        passwordChecks: 0,
        sessionsOpened: 0,
        resetCodesSent: 0,
      },
  );
}

// This fixture exercises our auth UI against a signed-out provider boundary.
// It cannot create a session or authorize an application API request.
export async function mockAuthProvider(
  page: Page,
  {
    loadDelayMs = 100,
    signUpNetworkFailures = 0,
  }: { loadDelayMs?: number; signUpNetworkFailures?: number } = {},
): Promise<void> {
  await page.route('**/clerk.browser.js*', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: '' }),
  );
  await page.route('**/ui.browser.js*', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: '' }),
  );
  await page.addInitScript(
    ({
      loadDelayMs,
      signUpNetworkFailures,
      codeAccount,
      passwordAccount,
      accountPassword,
      signUpCodeOnlyAccount,
      signUpPasswordAccount,
      codeCheckMs,
      emailedCode,
      minimumPasswordLength,
      shortPasswordRefusal,
    }) => {
      const wrongCode = { code: 'form_code_incorrect', meta: { paramName: 'code' } };
      let signUpNetworkFailuresLeft = signUpNetworkFailures;
      const calls = { signInCreate: 0, signUpCreate: 0, signUpSso: 0 };
      window.__agiMockAuthProviderCalls = calls;
      const progress = {
        signInCodeChecks: 0,
        signUpCodeChecks: 0,
        signUpPasswords: 0,
        signUpFinalizes: 0,
      };
      window.__agiMockAuthProviderProgress = progress;
      const passwordSignIn = { passwordChecks: 0, sessionsOpened: 0, resetCodesSent: 0 };
      window.__agiMockAuthProviderSignIn = passwordSignIn;
      const signIn = {
        status: 'needs_first_factor',
        identifier: null as string | null,
        supportedFirstFactors: [{ strategy: 'password' }],
        async create({ identifier }: { identifier: string }) {
          calls.signInCreate += 1;
          signIn.status = 'needs_first_factor';
          if (identifier === passwordAccount) {
            signIn.identifier = identifier;
            signIn.supportedFirstFactors = [{ strategy: 'password' }];
            return { error: null };
          }
          if (identifier === codeAccount) {
            signIn.identifier = identifier;
            signIn.supportedFirstFactors = [{ strategy: 'email_code' }];
            return { error: null };
          }
          signIn.identifier = null;
          return {
            error: {
              code: 'form_identifier_not_found',
              meta: { paramName: 'identifier' },
            },
          };
        },
        async password({ password }: { password: string }) {
          passwordSignIn.passwordChecks += 1;
          if (signIn.identifier !== passwordAccount) {
            return { error: { code: 'strategy_for_user_invalid' } };
          }
          if (password !== accountPassword) {
            return {
              error: {
                code: 'form_password_incorrect',
                meta: { paramName: 'password' },
              },
            };
          }
          signIn.status = 'complete';
          return { error: null };
        },
        resetPasswordEmailCode: {
          async sendCode() {
            passwordSignIn.resetCodesSent += 1;
            return { error: null };
          },
        },
        emailCode: {
          async sendCode() {
            return { error: null };
          },
          async verifyCode({ code }: { code: string }) {
            progress.signInCodeChecks += 1;
            await new Promise((resolve) => setTimeout(resolve, codeCheckMs));
            if (code !== emailedCode) return { error: wrongCode };
            signIn.status = 'complete';
            return { error: null };
          },
        },
        async finalize() {
          if (signIn.identifier !== passwordAccount) {
            return { error: new TypeError('Failed to fetch') };
          }
          passwordSignIn.sessionsOpened += 1;
          return { error: null };
        },
        async reset() {
          signIn.status = 'needs_first_factor';
          signIn.identifier = null;
          signIn.supportedFirstFactors = [{ strategy: 'password' }];
          return { error: null };
        },
      };
      const signUp = {
        status: 'missing_requirements',
        emailAddress: null as string | null,
        missingFields: [] as string[],
        createdSessionId: null as string | null,
        verifications: {
          emailAddress: { status: null as string | null },
          async sendEmailCode() {
            return { error: null };
          },
          async verifyEmailCode({ code }: { code: string }) {
            progress.signUpCodeChecks += 1;
            if (code !== emailedCode) return { error: wrongCode };
            signUp.verifications.emailAddress.status = 'verified';
            if (signUp.missingFields.length === 0) signUp.status = 'complete';
            return { error: null };
          },
        },
        async create({
          emailAddress,
          legalAccepted,
        }: {
          emailAddress: string;
          legalAccepted?: boolean;
        }) {
          calls.signUpCreate += 1;
          if (legalAccepted !== true) {
            return { error: { code: 'form_param_missing', meta: { paramName: 'legal_accepted' } } };
          }
          if (signUpNetworkFailuresLeft > 0) {
            signUpNetworkFailuresLeft -= 1;
            return { error: new TypeError('Failed to fetch') };
          }
          if (emailAddress === signUpCodeOnlyAccount || emailAddress === signUpPasswordAccount) {
            signUp.status = 'missing_requirements';
            signUp.emailAddress = emailAddress;
            signUp.missingFields = emailAddress === signUpPasswordAccount ? ['password'] : [];
            signUp.verifications.emailAddress.status = null;
            return { error: null };
          }
          return {
            error: {
              code: 'form_identifier_exists',
              meta: { paramName: 'email_address' },
            },
          };
        },
        async password({ password }: { password: string }) {
          progress.signUpPasswords += 1;
          if (password.length < minimumPasswordLength) {
            return {
              error: {
                code: 'form_password_length_too_short',
                longMessage: shortPasswordRefusal,
                meta: { paramName: 'password' },
              },
            };
          }
          signUp.missingFields = signUp.missingFields.filter((field) => field !== 'password');
          const addressProven = signUp.verifications.emailAddress.status === 'verified';
          if (addressProven && signUp.missingFields.length === 0) signUp.status = 'complete';
          return { error: null };
        },
        async finalize() {
          progress.signUpFinalizes += 1;
          return { error: null };
        },
        async reset() {
          signUp.status = 'missing_requirements';
          signUp.emailAddress = null;
          signUp.missingFields = [];
          signUp.verifications.emailAddress.status = null;
          return { error: null };
        },
        async sso() {
          calls.signUpSso += 1;
          return { error: { code: 'oauth_access_denied' } };
        },
      };
      const signInSnapshot = { signIn, errors: {}, fetchStatus: 'idle' };
      const signUpSnapshot = { signUp, errors: {}, fetchStatus: 'idle' };
      const resources = { client: { sessions: [] }, session: null, user: null, organization: null };
      const listeners = new Set<(status: string) => void>();
      Object.defineProperty(window, '__internal_ClerkUICtor', { value: class {} });
      Object.defineProperty(window, 'Clerk', {
        configurable: true,
        value: {
          loaded: false,
          status: 'loading',
          async load() {
            await new Promise((resolve) => setTimeout(resolve, loadDelayMs));
            this.loaded = true;
            this.status = 'ready';
            for (const listener of listeners) listener('ready');
          },
          on(event: string, listener: (status: string) => void, options?: { notify?: boolean }) {
            if (event === 'status') {
              listeners.add(listener);
              if (options?.notify) queueMicrotask(() => listener(this.status));
            }
          },
          off(_event: string, listener: (status: string) => void) {
            listeners.delete(listener);
          },
          ...resources,
          __internal_lastEmittedResources: resources,
          addListener(listener: (value: typeof resources) => void) {
            listener(resources);
            return () => {};
          },
          __internal_state: {
            signInSignal: () => signInSnapshot,
            signUpSignal: () => signUpSnapshot,
            __internal_effect: () => () => {},
          },
        },
      });
    },
    {
      loadDelayMs,
      signUpNetworkFailures,
      codeAccount: MOCK_CODE_ACCOUNT,
      passwordAccount: MOCK_PASSWORD_ACCOUNT,
      accountPassword: MOCK_ACCOUNT_PASSWORD,
      signUpCodeOnlyAccount: MOCK_SIGNUP_CODE_ONLY_ACCOUNT,
      signUpPasswordAccount: MOCK_SIGNUP_PASSWORD_ACCOUNT,
      codeCheckMs: MOCK_CODE_CHECK_MS,
      emailedCode: MOCK_EMAILED_CODE,
      minimumPasswordLength: AUTH_PASSWORD_MIN_LENGTH,
      shortPasswordRefusal: MOCK_SHORT_PASSWORD_REFUSAL,
    },
  );
}

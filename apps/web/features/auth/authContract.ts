import type { AuthProvider, AuthProviderId } from '@agiworkforce/client-runtime';

import type { AuthErrorKind, AuthNoticeKind } from '@/lib/auth/error-taxonomy';

export type { AuthProvider, AuthProviderId };

export type AuthFieldName = 'email' | 'password' | 'code';

export type AuthCodePurpose = 'sign_in' | 'sign_up' | 'reset' | 'device';

export type AuthCodeScreen = AuthCodePurpose | 'confirm_email' | 'passwordless';

export type AuthPasswordPurpose = 'reset' | 'sign_up';

export type AuthSecondFactorKind = 'authenticator' | 'text_message' | 'email' | 'backup_code';

export type AuthMethodId = 'password' | 'email_code' | 'passkey';

export type AuthPhase =
  | 'idle'
  | 'checking_account'
  | 'sending_code'
  | 'verifying'
  | 'passkey_requested'
  | 'signing_in'
  | 'redirecting'
  | 'enterprise_redirecting'
  | 'enterprise_browser'
  | 'browser';

export interface AuthSecondFactor {
  kind: AuthSecondFactorKind;
  label: string;
  hint: string | null;
}

export type AuthStep =
  | { kind: 'email' }
  | { kind: 'password'; email: string; methods: readonly AuthMethodId[] }
  | {
      kind: 'code';
      email: string;
      purpose: AuthCodePurpose;
      methods: readonly AuthMethodId[];
    }
  | {
      kind: 'second_factor';
      factor: AuthSecondFactor;
      alternatives: readonly AuthSecondFactor[];
    }
  | { kind: 'new_password'; email: string; purpose: AuthPasswordPurpose }
  | { kind: 'notice'; notice: AuthNoticeKind; retryAfterSeconds: number | null };

export interface AuthFailure {
  status: 'failed';
  kind: AuthErrorKind;
  message: string;
  field?: AuthFieldName;
  retryAfterSeconds?: number;
}

export type AuthResult =
  | { status: 'complete' }
  | { status: 'sent' }
  | {
      status: 'redirecting';
      phase?: Extract<AuthPhase, 'enterprise_redirecting' | 'enterprise_browser' | 'browser'>;
    }
  | { status: 'next'; step: AuthStep }
  | AuthFailure;

export interface AuthRedirects {
  signInCompleteUrl: string;
  signUpCompleteUrl: string;
  ssoCallbackUrl: string;
}

export interface AuthClient {
  isReady: boolean;
  startWithEmail: (email: string) => Promise<AuthResult>;
  submitPassword: (password: string) => Promise<AuthResult>;
  submitCode: (code: string, purpose: AuthCodePurpose) => Promise<AuthResult>;
  resendCode: (purpose: AuthCodePurpose) => Promise<AuthResult>;
  submitSecondFactor: (code: string, factor: AuthSecondFactor) => Promise<AuthResult>;
  switchSecondFactor: (factor: AuthSecondFactor) => Promise<AuthResult>;
  submitNewPassword: (password: string, purpose: AuthPasswordPurpose) => Promise<AuthResult>;
  startPasswordReset: () => Promise<AuthResult>;
  startMethod: (method: AuthMethodId) => Promise<AuthResult>;
  startProvider: (provider: AuthProviderId) => Promise<AuthResult>;
  signInWithPasskey: () => Promise<AuthResult>;
  readProviderReturn: () => AuthResult | null;
  restart: () => Promise<void>;
}

export const AUTH_CODE_LENGTH = 6;
export const AUTH_RESEND_COOLDOWN_SECONDS = 30;
export const AUTH_PASSWORD_MIN_LENGTH = 8;

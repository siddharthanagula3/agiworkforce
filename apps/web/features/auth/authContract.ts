import type { AuthProvider, AuthProviderId } from '@agiworkforce/client-runtime';

export type { AuthProvider, AuthProviderId };

export type AuthMode = 'login' | 'signup';

export type AuthFieldName = 'email' | 'password' | 'code';

export type AuthCodePurpose = 'sign_in' | 'sign_up' | 'reset';

export type AuthSecondFactorKind = 'authenticator' | 'text_message' | 'backup_code';

export interface AuthSecondFactor {
  kind: AuthSecondFactorKind;
  label: string;
  hint: string | null;
}

export type AuthStep =
  | { kind: 'email' }
  | { kind: 'password'; email: string }
  | { kind: 'code'; email: string; purpose: AuthCodePurpose }
  | { kind: 'second_factor'; factor: AuthSecondFactor }
  | { kind: 'new_password'; email: string };

export type AuthResult =
  | { status: 'complete' }
  | { status: 'redirecting' }
  | { status: 'next'; step: AuthStep }
  | { status: 'failed'; message: string; field?: AuthFieldName; switchMode?: boolean };

export interface AuthRedirects {
  completeUrl: string;
  switchUrl: string;
  ssoCallbackUrl: string;
}

export interface AuthClient {
  isReady: boolean;
  startWithEmail: (email: string, termsAccepted: boolean) => Promise<AuthResult>;
  submitPassword: (password: string) => Promise<AuthResult>;
  submitCode: (code: string, purpose: AuthCodePurpose) => Promise<AuthResult>;
  resendCode: (purpose: AuthCodePurpose) => Promise<AuthResult>;
  submitSecondFactor: (code: string, factor: AuthSecondFactor) => Promise<AuthResult>;
  submitNewPassword: (password: string) => Promise<AuthResult>;
  startPasswordReset: () => Promise<AuthResult>;
  startEmailCode: () => Promise<AuthResult>;
  startProvider: (provider: AuthProviderId, termsAccepted: boolean) => Promise<AuthResult>;
  restart: () => Promise<void>;
}

export const AUTH_CODE_LENGTH = 6;
export const AUTH_RESEND_COOLDOWN_SECONDS = 30;

export const NO_ACCOUNT_FOR_EMAIL = 'No account uses this email.';
export const ACCOUNT_ALREADY_EXISTS = 'This email already has an account.';
export const TERMS_NOT_ACCEPTED = 'Accept the terms to create an account.';
export const UNEXPECTED_FAILURE = 'Something went wrong. Try again.';

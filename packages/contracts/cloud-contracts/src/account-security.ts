import { z } from 'zod';

export const ACCOUNT_SECURITY_PATH = '/api/account-security';
export const ACCOUNT_SECURITY_CREDENTIALS_PATH = '/api/account-security/credentials';
export const ACCOUNT_SECURITY_CREDENTIAL_OPTIONS_PATH = '/api/account-security/credentials/options';
export const ACCOUNT_SECURITY_ENROLLMENT_PATH = '/api/account-security/enrollment';
export const ACCOUNT_SECURITY_ENROLLMENT_CODE_PATH = '/api/account-security/enrollment/code';
export const ACCOUNT_SECURITY_ENROLLMENT_UNDO_PATH = '/api/account-security/enrollment/undo';
export const ACCOUNT_SECURITY_RECOVERY_KEYS_PATH = '/api/account-security/recovery-keys';
export const ACCOUNT_SECURITY_VERIFICATION_PATH = '/api/account-security/verification';
export const ACCOUNT_SECURITY_VERIFICATION_OPTIONS_PATH =
  '/api/account-security/verification/options';
export const ACCOUNT_SECURITY_RECOVERY_PATH = '/api/account-security/recovery';
export const ACCOUNT_SECURITY_HANDOFF_PATH = '/api/account-security/handoff';
export const ACCOUNT_SECURITY_HANDOFF_OPTIONS_PATH = '/api/account-security/handoff/options';
export const ACCOUNT_SECURITY_HANDOFF_VERIFICATION_PATH =
  '/api/account-security/handoff/verification';
export const ACCOUNT_SECURITY_HANDOFF_COMPLETION_PATH = '/api/account-security/handoff/completion';

export const ACCOUNT_SECURITY_VERIFY_PAGE_PATH = '/login/verify';
export const ACCOUNT_SECURITY_UNDO_PAGE_PATH = '/login/not-me';
export const ACCOUNT_SECURITY_SETTINGS_PATH = '/settings?section=security';

export function accountSecurityCredentialPath(credentialId: string): string {
  return `${ACCOUNT_SECURITY_CREDENTIALS_PATH}/${encodeURIComponent(credentialId)}`;
}

export function accountSecurityVerifyPageHref(redirectTo: string): string {
  return `${ACCOUNT_SECURITY_VERIFY_PAGE_PATH}?redirectTo=${encodeURIComponent(redirectTo)}`;
}

export function accountSecurityHandoffPageHref(handoff: string): string {
  return `${ACCOUNT_SECURITY_VERIFY_PAGE_PATH}?handoff=${encodeURIComponent(handoff)}`;
}

export function accountSecurityUndoPageHref(token: string): string {
  return `${ACCOUNT_SECURITY_UNDO_PAGE_PATH}#${encodeURIComponent(token)}`;
}

export const PASSKEY_REQUIRED_REASON = 'passkey_required';

export const ACCOUNT_SECURITY_POLICY = {
  minimumSignInMethods: 2,
  recoveryKeyCount: 10,
  recoveryHoldHours: 48,
  verificationLifetimeHours: 7 * 24,
  pendingRecoveryKeysMinutes: 30,
  ceremonyMinutes: 5,
  handoffMinutes: 10,
  enrollmentCodeMinutes: 10,
  enrollmentCodeAttempts: 5,
  enrollmentCodeLockoutMinutes: 60,
  undoHours: 48,
  emailChangeCooldownDays: 7,
} as const;

export const ACCOUNT_SECURITY_ENROLLMENT_CODE_LENGTH = 6;

export const ACCOUNT_SECURITY_CREDENTIAL_NAME_MAX_LENGTH = 64;

export const ACCOUNT_SECURITY_HANDOFF_CLIENTS = ['desktop', 'mobile'] as const;
export type AccountSecurityHandoffClient = (typeof ACCOUNT_SECURITY_HANDOFF_CLIENTS)[number];

export const MOBILE_APP_DEEP_LINK_SCHEME = 'agiworkforce';
export const ACCOUNT_SECURITY_HANDOFF_RETURN_PATH = 'account-security/verified';

export type AccountSecurityCredentialKind = 'passkey' | 'security_key';

export interface AccountSecurityCredential {
  id: string;
  name: string;
  kind: AccountSecurityCredentialKind;
  worksAcrossDevices: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export type AccountSecurityUnavailableReason = 'organization_managed' | 'claimed_domain';

export interface AccountSecurityRecoveryHold {
  startedAt: string;
  unlocksAt: string;
  startedOnThisSession: boolean;
}

export type AccountSecurityStatus =
  | { state: 'unavailable'; reason: AccountSecurityUnavailableReason }
  | { state: 'available'; credentials: AccountSecurityCredential[] }
  | {
      state: 'enrolled';
      enrolledAt: string;
      verifiedUntil: string;
      credentials: AccountSecurityCredential[];
      recoveryKeysRemaining: number;
      recovery: AccountSecurityRecoveryHold | null;
    }
  | { state: 'verification_required'; recovery: AccountSecurityRecoveryHold | null };

export interface AccountSecurityRecoveryKeysResponse {
  recoveryKeys: string[];
  expiresAt: string;
}

export interface AccountSecurityEnrollmentCodeResponse {
  sentTo: string;
  expiresAt: string;
}

export interface AccountSecurityEnrollmentResponse {
  enrolledAt: string;
  verifiedUntil: string;
  sessionsSignedOut: number;
  devicesSignedOut: number;
}

export interface AccountSecurityUndoResponse {
  sessionsSignedOut: number;
  passwordReset: boolean;
}

export interface AccountSecurityVerificationResponse {
  verifiedUntil: string;
}

export interface AccountSecurityRecoveryStartedResponse {
  recovery: AccountSecurityRecoveryHold;
}

export interface AccountSecurityHandoffResponse {
  url: string;
  expiresAt: string;
}

export interface AccountSecurityHandoffVerifiedResponse {
  returnUrl: string;
}

const webAuthnResponseSchema = z.record(z.string(), z.unknown());

const handoffTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const AccountSecurityRegistrationRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(ACCOUNT_SECURITY_CREDENTIAL_NAME_MAX_LENGTH),
    response: webAuthnResponseSchema,
  })
  .strict();

export const AccountSecurityAssertionRequestSchema = z
  .object({ response: webAuthnResponseSchema })
  .strict();

export const AccountSecurityRecoveryKeysSavedSchema = z
  .object({ recoveryKeysSaved: z.literal(true) })
  .strict();

export const AccountSecurityEnrollmentRequestSchema = z
  .object({
    recoveryKeysSaved: z.literal(true),
    emailCode: z.string().length(ACCOUNT_SECURITY_ENROLLMENT_CODE_LENGTH).regex(/^\d+$/),
    response: webAuthnResponseSchema,
  })
  .strict();

export const AccountSecurityUndoRequestSchema = z.object({ token: handoffTokenSchema }).strict();

export const AccountSecurityRecoveryStartRequestSchema = z
  .object({ recoveryKey: z.string().trim().min(1).max(64) })
  .strict();

export const AccountSecurityHandoffRequestSchema = z
  .object({
    client: z.enum(ACCOUNT_SECURITY_HANDOFF_CLIENTS),
    codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();

export const AccountSecurityHandoffOptionsRequestSchema = z
  .object({ handoff: handoffTokenSchema })
  .strict();

export const AccountSecurityHandoffVerificationRequestSchema = z
  .object({ handoff: handoffTokenSchema, response: webAuthnResponseSchema })
  .strict();

export const AccountSecurityHandoffCompletionRequestSchema = z
  .object({
    handoff: handoffTokenSchema,
    code: handoffTokenSchema,
    codeVerifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
  })
  .strict();

export type AccountSecurityRegistrationRequest = z.infer<
  typeof AccountSecurityRegistrationRequestSchema
>;
export type AccountSecurityEnrollmentRequest = z.infer<
  typeof AccountSecurityEnrollmentRequestSchema
>;
export type AccountSecurityHandoffRequest = z.infer<typeof AccountSecurityHandoffRequestSchema>;
export type AccountSecurityHandoffCompletionRequest = z.infer<
  typeof AccountSecurityHandoffCompletionRequestSchema
>;

export function readPasskeyRequired(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return false;
  const details = (error as { details?: unknown }).details;
  return (
    !!details &&
    typeof details === 'object' &&
    (details as { reason?: unknown }).reason === PASSKEY_REQUIRED_REASON
  );
}

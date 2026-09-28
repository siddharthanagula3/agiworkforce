'use client';

import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import {
  ACCOUNT_SECURITY_CREDENTIAL_OPTIONS_PATH,
  ACCOUNT_SECURITY_CREDENTIALS_PATH,
  ACCOUNT_SECURITY_ENROLLMENT_CODE_PATH,
  ACCOUNT_SECURITY_ENROLLMENT_PATH,
  ACCOUNT_SECURITY_ENROLLMENT_UNDO_PATH,
  ACCOUNT_SECURITY_HANDOFF_COMPLETION_PATH,
  ACCOUNT_SECURITY_HANDOFF_OPTIONS_PATH,
  ACCOUNT_SECURITY_HANDOFF_PATH,
  ACCOUNT_SECURITY_HANDOFF_RETURN_PATH,
  ACCOUNT_SECURITY_HANDOFF_VERIFICATION_PATH,
  ACCOUNT_SECURITY_PATH,
  ACCOUNT_SECURITY_RECOVERY_KEYS_PATH,
  ACCOUNT_SECURITY_RECOVERY_PATH,
  ACCOUNT_SECURITY_VERIFICATION_OPTIONS_PATH,
  ACCOUNT_SECURITY_VERIFICATION_PATH,
  accountSecurityCredentialPath,
  type AccountSecurityCredential,
  type AccountSecurityEnrollmentCodeResponse,
  type AccountSecurityEnrollmentResponse,
  type AccountSecurityHandoffResponse,
  type AccountSecurityHandoffVerifiedResponse,
  type AccountSecurityRecoveryHold,
  type AccountSecurityRecoveryKeysResponse,
  type AccountSecurityRecoveryStartedResponse,
  type AccountSecurityStatus,
  type AccountSecurityUndoResponse,
  type AccountSecurityVerificationResponse,
} from '@agiworkforce/cloud-contracts/account-security';
import { DESKTOP_DEEP_LINK_SCHEME } from '@agiworkforce/local-runtime-contract';

import { addCsrfHeaders } from '@/lib/client/csrf';

export type StepUpRunner = (
  send: (headers: Record<string, string>) => Promise<Response>,
) => Promise<Response>;

const withoutStepUp: StepUpRunner = (send) => send({});

export class AccountSecurityRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AccountSecurityRequestError';
  }
}

async function failure(response: Response, fallback: string): Promise<AccountSecurityRequestError> {
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: unknown };
  } | null;
  const message = typeof body?.error?.message === 'string' ? body.error.message : fallback;
  return new AccountSecurityRequestError(message, response.status);
}

async function send(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  const headers =
    method === 'GET'
      ? extraHeaders
      : await addCsrfHeaders({
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...extraHeaders,
        });
  return fetch(path, {
    method,
    headers,
    credentials: 'include',
    cache: 'no-store',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) throw await failure(response, fallback);
  return (await response.json()) as T;
}

async function expectEmpty(response: Response, fallback: string): Promise<void> {
  if (!response.ok) throw await failure(response, fallback);
}

export function canUseWebAuthn(): boolean {
  return browserSupportsWebAuthn();
}

export async function fetchAccountSecurityStatus(): Promise<AccountSecurityStatus> {
  return readJson(
    await send(ACCOUNT_SECURITY_PATH, 'GET'),
    'Advanced Account Security could not be loaded.',
  );
}

export async function addCredential(
  name: string,
  runStepUp: StepUpRunner = withoutStepUp,
): Promise<AccountSecurityCredential> {
  const optionsJSON = await readJson<PublicKeyCredentialCreationOptionsJSON>(
    await send(ACCOUNT_SECURITY_CREDENTIAL_OPTIONS_PATH, 'POST'),
    'Adding a passkey or security key could not start.',
  );
  const response = await startRegistration({ optionsJSON });
  const saved = await readJson<{ credential: AccountSecurityCredential }>(
    await runStepUp((headers) =>
      send(ACCOUNT_SECURITY_CREDENTIALS_PATH, 'POST', { name, response }, headers),
    ),
    'This passkey or security key could not be added.',
  );
  return saved.credential;
}

export async function removeCredential(
  credentialId: string,
  runStepUp: StepUpRunner = withoutStepUp,
): Promise<void> {
  await expectEmpty(
    await runStepUp((headers) =>
      send(accountSecurityCredentialPath(credentialId), 'DELETE', undefined, headers),
    ),
    'This passkey or security key could not be removed.',
  );
}

export async function generateRecoveryKeys(): Promise<AccountSecurityRecoveryKeysResponse> {
  return readJson(
    await send(ACCOUNT_SECURITY_RECOVERY_KEYS_PATH, 'POST'),
    'Recovery keys could not be generated.',
  );
}

export async function confirmReplacementRecoveryKeys(runStepUp: StepUpRunner): Promise<void> {
  await expectEmpty(
    await runStepUp((headers) =>
      send(ACCOUNT_SECURITY_RECOVERY_KEYS_PATH, 'PUT', { recoveryKeysSaved: true }, headers),
    ),
    'Your new recovery keys could not be saved.',
  );
}

async function assertWithPasskey(): Promise<unknown> {
  const optionsJSON = await readJson<PublicKeyCredentialRequestOptionsJSON>(
    await send(ACCOUNT_SECURITY_VERIFICATION_OPTIONS_PATH, 'POST'),
    'Verification could not start.',
  );
  return startAuthentication({ optionsJSON });
}

export async function sendEnrollmentCode(): Promise<AccountSecurityEnrollmentCodeResponse> {
  return readJson(
    await send(ACCOUNT_SECURITY_ENROLLMENT_CODE_PATH, 'POST'),
    'The code could not be emailed.',
  );
}

export async function enrollAccountSecurity(
  runStepUp: StepUpRunner,
  emailCode: string,
): Promise<AccountSecurityEnrollmentResponse> {
  const response = await assertWithPasskey();
  return readJson(
    await runStepUp((headers) =>
      send(
        ACCOUNT_SECURITY_ENROLLMENT_PATH,
        'POST',
        { recoveryKeysSaved: true, emailCode, response },
        headers,
      ),
    ),
    'Advanced Account Security could not be turned on.',
  );
}

export async function turnOffFromEmailLink(token: string): Promise<AccountSecurityUndoResponse> {
  return readJson(
    await send(ACCOUNT_SECURITY_ENROLLMENT_UNDO_PATH, 'POST', { token }),
    'Advanced Account Security could not be turned off.',
  );
}

export async function verifyWithPasskey(): Promise<string> {
  const response = await assertWithPasskey();
  const verified = await readJson<AccountSecurityVerificationResponse>(
    await send(ACCOUNT_SECURITY_VERIFICATION_PATH, 'POST', { response }),
    'That passkey or security key could not be verified.',
  );
  return verified.verifiedUntil;
}

export async function disableAccountSecurity(): Promise<void> {
  const response = await assertWithPasskey();
  await expectEmpty(
    await send(ACCOUNT_SECURITY_ENROLLMENT_PATH, 'DELETE', { response }),
    'Advanced Account Security could not be turned off.',
  );
}

export async function startRecovery(recoveryKey: string): Promise<AccountSecurityRecoveryHold> {
  const started = await readJson<AccountSecurityRecoveryStartedResponse>(
    await send(ACCOUNT_SECURITY_RECOVERY_PATH, 'POST', { recoveryKey }),
    'That recovery key could not be used.',
  );
  return started.recovery;
}

export async function completeRecovery(): Promise<string> {
  const verified = await readJson<AccountSecurityVerificationResponse>(
    await send(ACCOUNT_SECURITY_RECOVERY_PATH, 'PUT'),
    'Recovery could not be completed.',
  );
  return verified.verifiedUntil;
}

export async function cancelRecovery(): Promise<void> {
  await expectEmpty(
    await send(ACCOUNT_SECURITY_RECOVERY_PATH, 'DELETE'),
    'The recovery could not be cancelled.',
  );
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function codeChallengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export interface PendingDesktopHandoff {
  url: string;
  codeVerifier: string;
}

export async function startDesktopHandoff(): Promise<PendingDesktopHandoff> {
  const codeVerifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const opened = await readJson<AccountSecurityHandoffResponse>(
    await send(ACCOUNT_SECURITY_HANDOFF_PATH, 'POST', {
      client: 'desktop',
      codeChallenge: await codeChallengeFor(codeVerifier),
    }),
    'Browser verification could not start.',
  );
  return { url: opened.url, codeVerifier };
}

export function readDesktopHandoffReturn(link: string): { handoff: string; code: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(link);
  } catch {
    return null;
  }
  const target = `${DESKTOP_DEEP_LINK_SCHEME}://${ACCOUNT_SECURITY_HANDOFF_RETURN_PATH}`;
  if (`${parsed.protocol}//${parsed.host}${parsed.pathname}` !== target) return null;
  const handoff = parsed.searchParams.get('handoff');
  const code = parsed.searchParams.get('code');
  return handoff && code ? { handoff, code } : null;
}

export async function completeDesktopHandoff(input: {
  handoff: string;
  code: string;
  codeVerifier: string;
}): Promise<string> {
  const verified = await readJson<AccountSecurityVerificationResponse>(
    await send(ACCOUNT_SECURITY_HANDOFF_COMPLETION_PATH, 'POST', input),
    'This sign-in could not be confirmed.',
  );
  return verified.verifiedUntil;
}

export async function verifyHandoffInBrowser(handoff: string): Promise<string> {
  const optionsJSON = await readJson<PublicKeyCredentialRequestOptionsJSON>(
    await send(ACCOUNT_SECURITY_HANDOFF_OPTIONS_PATH, 'POST', { handoff }),
    'This link expired. Start again from the app.',
  );
  const response = await startAuthentication({ optionsJSON });
  const verified = await readJson<AccountSecurityHandoffVerifiedResponse>(
    await send(ACCOUNT_SECURITY_HANDOFF_VERIFICATION_PATH, 'POST', { handoff, response }),
    'That passkey or security key could not be verified.',
  );
  return verified.returnUrl;
}

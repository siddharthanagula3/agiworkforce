import 'server-only';

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import {
  ACCOUNT_SECURITY_POLICY,
  type AccountSecurityCredential,
} from '@agiworkforce/cloud-contracts/account-security';

import { logger } from '@/lib/logger';
import { SITE_NAME, SITE_URL } from '@/lib/seo/site';
import type { CredentialDeviceType, StoredCredential } from './store';

const TRANSPORTS = ['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb'] as const;
type AuthenticatorTransport = (typeof TRANSPORTS)[number];
const PORTABLE_TRANSPORTS: ReadonlySet<string> = new Set([
  'ble',
  'cable',
  'hybrid',
  'nfc',
  'smart-card',
  'usb',
]);
const SECURITY_KEY_TRANSPORTS: ReadonlySet<string> = new Set(['ble', 'nfc', 'smart-card', 'usb']);
const CEREMONY_TIMEOUT_MS = ACCOUNT_SECURITY_POLICY.ceremonyMinutes * 60 * 1000;

export interface RelyingParty {
  id: string;
  name: string;
  origin: string;
}

export function relyingParty(): RelyingParty {
  const url = new URL(SITE_URL);
  return { id: url.hostname, name: SITE_NAME, origin: url.origin };
}

function isTransport(value: string): value is AuthenticatorTransport {
  return (TRANSPORTS as readonly string[]).includes(value);
}

function transportsOf(values: readonly string[]): AuthenticatorTransport[] {
  return values.filter(isTransport);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isRegistrationResponse(value: unknown): value is RegistrationResponseJSON {
  if (!isRecord(value) || !isRecord(value['response'])) return false;
  const response = value['response'];
  return (
    typeof value['id'] === 'string' &&
    typeof value['rawId'] === 'string' &&
    value['type'] === 'public-key' &&
    isRecord(value['clientExtensionResults']) &&
    typeof response['clientDataJSON'] === 'string' &&
    typeof response['attestationObject'] === 'string'
  );
}

function isAuthenticationResponse(value: unknown): value is AuthenticationResponseJSON {
  if (!isRecord(value) || !isRecord(value['response'])) return false;
  const response = value['response'];
  return (
    typeof value['id'] === 'string' &&
    typeof value['rawId'] === 'string' &&
    value['type'] === 'public-key' &&
    isRecord(value['clientExtensionResults']) &&
    typeof response['clientDataJSON'] === 'string' &&
    typeof response['authenticatorData'] === 'string' &&
    typeof response['signature'] === 'string'
  );
}

export function worksAcrossDevices(
  credential: Pick<StoredCredential, 'deviceType' | 'transports'>,
): boolean {
  return (
    credential.deviceType === 'multiDevice' ||
    credential.transports.some((transport) => PORTABLE_TRANSPORTS.has(transport))
  );
}

export function toCredentialSummary(credential: StoredCredential): AccountSecurityCredential {
  const securityKey =
    credential.deviceType === 'singleDevice' &&
    credential.transports.some((transport) => SECURITY_KEY_TRANSPORTS.has(transport));
  return {
    id: credential.id,
    name: credential.name,
    kind: securityKey ? 'security_key' : 'passkey',
    worksAcrossDevices: worksAcrossDevices(credential),
    createdAt: new Date(credential.createdAt).toISOString(),
    lastUsedAt:
      credential.lastUsedAt === null ? null : new Date(credential.lastUsedAt).toISOString(),
  };
}

export function meetsEnrollmentRequirement(credentials: readonly StoredCredential[]): boolean {
  return (
    credentials.length >= ACCOUNT_SECURITY_POLICY.minimumSignInMethods &&
    credentials.some(worksAcrossDevices)
  );
}

export async function registrationOptions(input: {
  userId: string;
  userName: string;
  existing: readonly StoredCredential[];
}): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const rp = relyingParty();
  return generateRegistrationOptions({
    rpName: rp.name,
    rpID: rp.id,
    userName: input.userName,
    userDisplayName: input.userName,
    userID: new TextEncoder().encode(input.userId),
    timeout: CEREMONY_TIMEOUT_MS,
    attestationType: 'none',
    excludeCredentials: input.existing.map((credential) => ({
      id: credential.credentialId,
      transports: transportsOf(credential.transports),
    })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
  });
}

export interface VerifiedRegistration {
  credentialId: string;
  publicKey: string;
  signCount: number;
  transports: string[];
  deviceType: CredentialDeviceType;
  backedUp: boolean;
}

export async function verifyRegistration(input: {
  response: unknown;
  expectedChallenge: string;
}): Promise<VerifiedRegistration | null> {
  if (!isRegistrationResponse(input.response)) return null;
  const rp = relyingParty();
  try {
    const verification = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: input.expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      requireUserVerification: true,
    });
    if (!verification.verified) return null;
    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    return {
      credentialId: credential.id,
      publicKey: isoBase64URL.fromBuffer(credential.publicKey),
      signCount: credential.counter,
      transports: transportsOf(credential.transports ?? input.response.response.transports ?? []),
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
    };
  } catch (error) {
    logger.warn({ error }, '[account-security] registration response rejected');
    return null;
  }
}

export async function authenticationOptions(
  credentials: readonly StoredCredential[],
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const rp = relyingParty();
  return generateAuthenticationOptions({
    rpID: rp.id,
    timeout: CEREMONY_TIMEOUT_MS,
    userVerification: 'required',
    allowCredentials: credentials.map((credential) => ({
      id: credential.credentialId,
      transports: transportsOf(credential.transports),
    })),
  });
}

export interface VerifiedAssertion {
  credential: StoredCredential;
  signCount: number;
}

export async function verifyAssertion(input: {
  response: unknown;
  expectedChallenge: string;
  credentials: readonly StoredCredential[];
}): Promise<VerifiedAssertion | null> {
  const response = input.response;
  if (!isAuthenticationResponse(response)) return null;
  const credential = input.credentials.find((entry) => entry.credentialId === response.id);
  if (!credential) return null;
  const rp = relyingParty();
  try {
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: input.expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      requireUserVerification: true,
      credential: {
        id: credential.credentialId,
        publicKey: isoBase64URL.toBuffer(credential.publicKey),
        counter: credential.signCount,
        transports: transportsOf(credential.transports),
      },
    });
    if (!verification.verified) return null;
    return { credential, signCount: verification.authenticationInfo.newCounter };
  } catch (error) {
    logger.warn({ error }, '[account-security] assertion rejected');
    return null;
  }
}

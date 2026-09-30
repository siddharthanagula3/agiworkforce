import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import {
  ACCOUNT_SECURITY_HANDOFF_COMPLETION_PATH,
  ACCOUNT_SECURITY_HANDOFF_PATH,
  ACCOUNT_SECURITY_HANDOFF_RETURN_PATH,
  MOBILE_APP_DEEP_LINK_SCHEME,
  type AccountSecurityHandoffResponse,
  type AccountSecurityVerificationResponse,
} from '@agiworkforce/cloud-contracts/account-security';

import { api } from '@/services/api';

const RETURN_URL = `${MOBILE_APP_DEEP_LINK_SCHEME}://${ACCOUNT_SECURITY_HANDOFF_RETURN_PATH}`;
const VERIFIER_BYTES = 32;

export type AccountSecurityVerificationOutcome = 'verified' | 'cancelled';

function toBase64Url(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return toBase64Url(btoa(binary));
}

async function codeChallengeFor(verifier: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  return toBase64Url(digest);
}

function readReturn(url: string): { handoff: string; code: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const handoff = parsed.searchParams.get('handoff');
  const code = parsed.searchParams.get('code');
  return handoff && code ? { handoff, code } : null;
}

async function runVerification(): Promise<AccountSecurityVerificationOutcome> {
  const codeVerifier = bytesToBase64Url(Crypto.getRandomBytes(VERIFIER_BYTES));
  const opened = await api.post<AccountSecurityHandoffResponse>(ACCOUNT_SECURITY_HANDOFF_PATH, {
    client: 'mobile',
    codeChallenge: await codeChallengeFor(codeVerifier),
  });
  const result = await WebBrowser.openAuthSessionAsync(opened.url, RETURN_URL);
  if (result.type !== 'success') return 'cancelled';
  const returned = readReturn(result.url);
  if (!returned) return 'cancelled';
  await api.post<AccountSecurityVerificationResponse>(ACCOUNT_SECURITY_HANDOFF_COMPLETION_PATH, {
    ...returned,
    codeVerifier,
  });
  return 'verified';
}

let pending: Promise<AccountSecurityVerificationOutcome> | null = null;

export function verifyAccountSecurityInBrowser(): Promise<AccountSecurityVerificationOutcome> {
  pending ??= runVerification().finally(() => {
    pending = null;
  });
  return pending;
}

import 'server-only';

import { OAuth2Client } from 'google-auth-library';

export type GooglePubSubPushIdentity =
  | { ok: true; email: string }
  | { ok: false; reason: 'not_configured' | 'missing_token' | 'invalid_token' | 'not_authorized' };

export interface GooglePubSubPushExpectation {
  audience: string | undefined;
  serviceAccountEmail: string | undefined;
  verifier?: (
    token: string,
    audience: string,
  ) => Promise<{ email?: string; emailVerified?: boolean }>;
}

async function verifyWithGoogle(
  token: string,
  audience: string,
): Promise<{ email?: string; emailVerified?: boolean }> {
  const ticket = await new OAuth2Client().verifyIdToken({ idToken: token, audience });
  const payload = ticket.getPayload();
  return { email: payload?.email, emailVerified: payload?.email_verified };
}

export async function verifyGooglePubSubPushIdentity(
  authorization: string | null,
  expectation: GooglePubSubPushExpectation,
): Promise<GooglePubSubPushIdentity> {
  const audience = expectation.audience?.trim();
  const expectedEmail = expectation.serviceAccountEmail?.trim();
  if (!audience || !expectedEmail) return { ok: false, reason: 'not_configured' };

  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { ok: false, reason: 'missing_token' };

  let payload: { email?: string; emailVerified?: boolean };
  try {
    payload = await (expectation.verifier ?? verifyWithGoogle)(token, audience);
  } catch {
    return { ok: false, reason: 'invalid_token' };
  }
  if (payload.email !== expectedEmail || payload.emailVerified !== true) {
    return { ok: false, reason: 'not_authorized' };
  }
  return { ok: true, email: payload.email };
}

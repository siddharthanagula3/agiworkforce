import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { logInvalidSignature } from '@/lib/security-audit';
import { withRateLimit } from '@/lib/rate-limit';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const WORKOS_WEBHOOK_SECRET = process.env['WORKOS_WEBHOOK_SECRET'];

if (!WORKOS_WEBHOOK_SECRET) {
  logger.error(
    'WorkOS webhook secret is not configured. Set WORKOS_WEBHOOK_SECRET in environment variables.',
  );
}

// ---------------------------------------------------------------------------
// WorkOS webhook signature verification (HMAC-SHA256, no SDK required)
// WorkOS signs with: SHA256 HMAC of the raw body using the webhook secret.
// The signature is sent in the `workos-signature` header in the format:
//   t=<timestamp>, v1=<signature>
// ---------------------------------------------------------------------------

function verifyWorkOSSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds = 60,
): boolean {
  try {
    const parts = signatureHeader.split(',').reduce(
      (acc, part) => {
        const [key, value] = part.trim().split('=');
        if (key && value) {
          acc[key] = value;
        }
        return acc;
      },
      {} as Record<string, string>,
    );

    const timestamp = parts['t'];
    const expectedSig = parts['v1'];

    if (!timestamp || !expectedSig) {
      logger.warn({ signatureHeader }, 'WorkOS signature header missing t or v1 component');
      return false;
    }

    // Verify timestamp is within tolerance to prevent replay attacks
    if (!/^\d+$/.test(timestamp)) {
      logger.warn({ timestamp }, 'WorkOS webhook timestamp is not a valid integer');
      return false;
    }
    const timestampMs = parseInt(timestamp, 10) * 1000;
    const now = Date.now();
    if (Math.abs(now - timestampMs) > toleranceSeconds * 1000) {
      logger.warn(
        { timestamp, now, toleranceSeconds },
        'WorkOS webhook timestamp outside tolerance window',
      );
      return false;
    }

    // Compute expected signature: HMAC-SHA256(secret, "timestamp.rawBody")
    const signedPayload = `${timestamp}.${rawBody}`;
    const computedSig = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

    const expectedBuf = Buffer.from(expectedSig, 'hex');
    const computedBuf = Buffer.from(computedSig, 'hex');
    if (expectedBuf.length !== computedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuf, computedBuf);
  } catch (err) {
    logger.error({ error: err }, 'Error verifying WorkOS webhook signature');
    return false;
  }
}

// ---------------------------------------------------------------------------
// POST handler
//
// TODO(enterprise): SCIM/directory-sync provisioning is not implemented in v1.
// Enterprise SSO with WorkOS is waitlist-gated. When ready, re-implement
// handleUserCreated, handleUserUpdated, handleUserDeleted, handleGroupUserAdded,
// handleGroupUserRemoved using getNeonDb() for profile/org tables and
// Clerk admin SDK (client.users.createUser, banUser, unbanUser) for auth ops.
// Reference the pre-migration implementation in git history.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  if (!WORKOS_WEBHOOK_SECRET) {
    logger.error('WorkOS webhook secret not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  // Verify signature before returning 501, so WorkOS gets a proper auth rejection
  // rather than treating an unverified request as a server error.
  const rawBody = await request.text();
  const signatureHeader = request.headers.get('workos-signature');

  if (!signatureHeader) {
    logger.error('Missing WorkOS signature header');
    await logInvalidSignature(request, 'workos_directory_sync');
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
  }

  const isValid = verifyWorkOSSignature(rawBody, signatureHeader, WORKOS_WEBHOOK_SECRET);
  if (!isValid) {
    logger.error('WorkOS webhook signature verification failed');
    await logInvalidSignature(request, 'workos_directory_sync');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // SCIM provisioning not yet implemented (enterprise waitlist, v1 scope).
  logger.info(
    { signatureVerified: true },
    'WorkOS directory sync webhook received - SCIM provisioning not yet implemented',
  );
  return NextResponse.json(
    { error: 'Directory sync provisioning not yet implemented' },
    { status: 501 },
  );
}

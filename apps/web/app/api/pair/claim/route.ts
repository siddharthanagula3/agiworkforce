export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { isRelayPairingCode, normalizePairingCode } from '@agiworkforce/types';
import { requireCsrfToken } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { unauthorizedResponseFor } from '@/lib/api-auth-response';
import { isMfaRequiredError } from '@/lib/mfa-policy-gate';
import { isIpNotAllowedError } from '@/lib/ip-allow-list-gate';
import { recordWorkspaceAuditEvent } from '@/lib/workspace-audit';
import { buildWorkspaceFeatureGateResponse } from '@/lib/managed-compute-gate';
import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';

const SIGNALING_TIMEOUT_MS = 10_000;

const claimSchema = z.object({ code: z.string().min(1).max(64) }).strict();

const signalingClaimSchema = z.object({
  code: z.string(),
  role: z.literal('mobile'),
  pairToken: z.string().min(1),
  expiresAt: z.number(),
  wsUrl: z.string(),
});

/**
 * The phone's half of a pairing, claimed on its behalf.
 *
 * The relay cannot tell one account from another: it has no verifier for a user
 * token and its only trust anchor is the internal secret. So the account is
 * established here, where the session already is, and the relay is told which
 * account it is minting for. It refuses when that is not the account the
 * pairing was created for, which is what stops a scanned QR from joining a
 * stranger's desktop.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse as NextResponse;

  let db: DatabaseAdapter;
  let userId: string;
  try {
    ({ db, userId } = await getUserScopedDb(request));
  } catch (authError) {
    if (isMfaRequiredError(authError) || isIpNotAllowedError(authError)) {
      return unauthorizedResponseFor(authError);
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimited = await withRateLimit(request, 'device-link', userId);
  if (rateLimited) return rateLimited;

  const featureGate = await buildWorkspaceFeatureGateResponse(
    userId,
    request,
    'remote_control',
    resolveCloudChatSurface(request),
  );
  if (featureGate) return featureGate;

  const signalingUrl = process.env['SIGNALING_HTTP_URL'];
  const signalingSecret = process.env['SIGNALING_INTERNAL_SECRET'];
  if (!signalingUrl || !signalingSecret) {
    logger.error(
      { hasUrl: Boolean(signalingUrl), hasSecret: Boolean(signalingSecret) },
      'Pairing is unconfigured: SIGNALING_HTTP_URL and SIGNALING_INTERNAL_SECRET are both required',
    );
    return NextResponse.json({ error: 'Pairing is not configured' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = claimSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid pairing code' }, { status: 400 });
  }

  const code = normalizePairingCode(parsed.data.code);
  if (!isRelayPairingCode(code)) {
    return NextResponse.json({ error: 'Invalid pairing code' }, { status: 400 });
  }

  let signalingResponse: Response;
  try {
    signalingResponse = await fetch(
      `${signalingUrl.replace(/\/+$/, '')}/pairings/${encodeURIComponent(code)}/claim`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${signalingSecret}`,
        },
        body: JSON.stringify({ role: 'mobile', accountId: userId }),
        signal: AbortSignal.timeout(SIGNALING_TIMEOUT_MS),
      },
    );
  } catch (error) {
    logger.error({ error }, 'Signaling server unreachable while claiming a pairing');
    return NextResponse.json({ error: 'Signaling server unavailable' }, { status: 503 });
  }

  if (!signalingResponse.ok) {
    // The relay's refusals are the user's answer, not an internal fault: the
    // pairing is gone, already has a phone, or belongs to another account.
    if (signalingResponse.status === 404) {
      return NextResponse.json({ error: 'pairing_not_found' }, { status: 404 });
    }
    if (signalingResponse.status === 409) {
      return NextResponse.json({ error: 'pairing_role_in_use' }, { status: 409 });
    }
    if (signalingResponse.status === 403) {
      await recordWorkspaceAuditEvent(db, request, {
        userId,
        eventType: 'remote_pairing_claimed',
        outcome: 'failure',
        detail: {
          resourceType: 'remote_pairing',
          resourceId: code,
          source: 'mobile',
          status: 'claim_rejected',
        },
      });
      return NextResponse.json({ error: 'pairing_belongs_to_another_account' }, { status: 403 });
    }
    logger.error(
      { status: signalingResponse.status },
      'Signaling server refused the pairing claim',
    );
    return NextResponse.json({ error: 'Failed to claim pairing session' }, { status: 502 });
  }

  const payload = signalingClaimSchema.safeParse(await signalingResponse.json().catch(() => null));
  if (!payload.success) {
    logger.error('Signaling server returned an unrecognised claim payload');
    return NextResponse.json({ error: 'Invalid response from signaling server' }, { status: 502 });
  }

  await recordWorkspaceAuditEvent(db, request, {
    userId,
    eventType: 'remote_pairing_claimed',
    detail: {
      resourceType: 'remote_pairing',
      resourceId: code,
      source: 'mobile',
      status: 'claimed',
    },
  });

  return NextResponse.json(payload.data);
}

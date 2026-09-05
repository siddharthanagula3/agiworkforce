export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getRequestIdentity } from '@/lib/server/identity';

const SIGNALING_TIMEOUT_MS = 10_000;
const DEFAULT_TTL_SECONDS = 300;

const initiateSchema = z
  .object({
    desktopId: z.string().uuid().optional(),
    ttlSeconds: z.number().int().min(30).max(900).optional(),
    initiator: z.enum(['desktop', 'mobile']).optional(),
  })
  .strict();

const signalingResponseSchema = z.object({
  code: z.string(),
  expiresAt: z.number(),
  expiresIn: z.number(),
  httpUrl: z.string(),
  wsUrl: z.string(),
  qrData: z.string(),
  pairTokens: z.object({
    desktop: z.string(),
    mobile: z.string(),
  }),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { subject: userId } = await getRequestIdentity();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimited = await withRateLimit(request, 'device-link', userId);
  if (rateLimited) return rateLimited;

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

  const parsed = initiateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid pairing request' }, { status: 400 });
  }
  const { desktopId, ttlSeconds, initiator = 'mobile' } = parsed.data;

  let signalingResponse: Response;
  try {
    signalingResponse = await fetch(`${signalingUrl.replace(/\/+$/, '')}/pairings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${signalingSecret}`,
      },
      body: JSON.stringify({
        ttlSeconds: ttlSeconds ?? DEFAULT_TTL_SECONDS,
        metadata: { userId, desktopId: desktopId ?? null, initiator },
      }),
      signal: AbortSignal.timeout(SIGNALING_TIMEOUT_MS),
    });
  } catch (error) {
    logger.error({ error }, 'Signaling server unreachable while creating a pairing');
    return NextResponse.json({ error: 'Signaling server unavailable' }, { status: 503 });
  }

  if (!signalingResponse.ok) {
    logger.error(
      { status: signalingResponse.status },
      'Signaling server refused the pairing request',
    );
    return NextResponse.json({ error: 'Failed to create pairing session' }, { status: 502 });
  }

  const payload = signalingResponseSchema.safeParse(
    await signalingResponse.json().catch(() => null),
  );
  if (!payload.success) {
    logger.error('Signaling server returned an unrecognised pairing payload');
    return NextResponse.json({ error: 'Invalid response from signaling server' }, { status: 502 });
  }

  const { code, expiresAt, expiresIn, httpUrl, wsUrl, pairTokens } = payload.data;

  // The initiator keeps its own token; the QR carries the peer's.
  const peerToken = initiator === 'desktop' ? pairTokens.mobile : pairTokens.desktop;

  return NextResponse.json({
    code,
    expiresAt,
    expiresIn,
    qrData: `agiw:${code}:${peerToken}`,
    signaling: { httpUrl, wsUrl },
    pairTokens,
  });
}

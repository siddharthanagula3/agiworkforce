/**
 * @file Pairing API Routes (Mobile <-> Desktop QR Pairing)
 * @security
 * - Rate limiting: Strict limits to prevent enumeration attacks
 * - Input validation: Zod schemas with .strict() to reject unexpected fields
 * - Authentication: JWT required for all endpoints
 * - Pairing codes are cryptographically random and time-limited
 *
 * Rate limit rationale (OWASP compliant):
 * - POST /initiate: 10/min - strict to prevent pairing code enumeration
 * - POST /confirm: 10/min - strict to prevent brute-force confirmation
 * - GET /status: 60/min - read operation for polling pairing status
 * - DELETE /cancel: 10/min - destructive operation
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { getUserScopedClient } from '../lib/supabaseClients';
import { createRateLimiter } from '../middleware/rateLimit';
import { logger } from '../lib/logger';

const router: Router = Router();

// CodeQL js/missing-rate-limiting (audit 2026-05-03): pairing flow is
// auth-required but the underlying signaling-server pairing-code search
// is not free, so apply baseline rate-limiting after auth.
router.use(authenticateToken);
router.use(createRateLimiter('default'));

const SIGNALING_HTTP_URL = process.env['SIGNALING_HTTP_URL'] ?? 'http://localhost:4000';

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

// SECURITY: .strict() rejects unexpected fields to prevent mass assignment
const initiateSchema = z
  .object({
    desktopId: z.string().uuid().optional(),
    ttlSeconds: z.number().int().min(30).max(900).optional(),
  })
  .strict();

const confirmSchema = z
  .object({
    code: z.string().min(1).max(20),
    desktopId: z.string().uuid(),
  })
  .strict();

const pairingCodeResponseSchema = z.object({
  code: z.string(),
  expiresAt: z.number(),
  expiresIn: z.number(),
  httpUrl: z.string(),
  wsUrl: z.string(),
  qrData: z.string(),
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * Initiate a QR pairing flow
 * POST /pair/initiate
 *
 * Creates a new pairing session via the signaling server and returns
 * a pairing code + QR data that the desktop app can scan.
 *
 * Flow:
 * 1. Mobile calls POST /pair/initiate -> gets pairing code + QR data
 * 2. Mobile displays QR code
 * 3. Desktop scans QR code, extracts pairing code
 * 4. Desktop calls POST /pair/confirm with the code
 * 5. Both devices connect to the signaling server WebSocket
 * 6. WebRTC connection established
 *
 * SECURITY: Rate limited to 10/min to prevent enumeration
 */
router.post('/initiate', createRateLimiter('pairing-code'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const { desktopId, ttlSeconds } = initiateSchema.parse(req.body ?? {});

  logger.info(
    { userId: user.userId, desktopId, ttlSeconds },
    'Pairing initiation requested from mobile',
  );

  // Request a pairing code from the signaling server
  let fetchResponse: globalThis.Response;
  try {
    fetchResponse = await fetch(`${SIGNALING_HTTP_URL.replace(/\/+$/, '')}/pairings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ttlSeconds: ttlSeconds ?? 300,
        metadata: {
          userId: user.userId,
          email: user.email,
          desktopId: desktopId ?? null,
          initiator: 'mobile',
        },
      }),
    });
  } catch (fetchError) {
    logger.error({ error: fetchError }, 'Failed to connect to signaling server');
    throw new AppError('Signaling server unavailable', 503);
  }

  if (!fetchResponse.ok) {
    let errorText: string;
    try {
      errorText = await fetchResponse.text();
    } catch {
      errorText = 'Unknown error';
    }
    throw new AppError(`Failed to create pairing session: ${errorText}`, 502);
  }

  let jsonBody: unknown;
  try {
    jsonBody = await fetchResponse.json();
  } catch (parseError) {
    logger.error({ error: parseError }, 'Failed to parse signaling server response');
    throw new AppError('Invalid response from signaling server', 502);
  }

  const payload = pairingCodeResponseSchema.parse(jsonBody);

  // Wave 1.5+ task #17 (2026-05-08): the legacy `pairing_sessions` write
  // here was a dead persistence sink — the table doesn't exist in the
  // canonical schema (only `device_pairings` does), so the insert always
  // failed and was swallowed. The signaling server is the source of truth
  // for pairing state; the DB write was never load-bearing. Removed.

  res.json({
    code: payload.code,
    expiresAt: payload.expiresAt,
    expiresIn: payload.expiresIn,
    qrData: payload.qrData,
    signaling: {
      httpUrl: payload.httpUrl,
      wsUrl: payload.wsUrl,
    },
  });
});

/**
 * Confirm a pairing from the desktop side
 * POST /pair/confirm
 *
 * Called by the desktop after scanning the QR code. Links the desktop
 * device to the pairing session and notifies the mobile client.
 *
 * SECURITY: Rate limited to 10/min to prevent brute-force
 */
router.post('/confirm', createRateLimiter('pairing-code'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const { code, desktopId } = confirmSchema.parse(req.body);

  logger.info({ userId: user.userId, desktopId, code }, 'Pairing confirmation from desktop');

  // Wave 1.5+ singleton sweep: user-scoped client. RLS on `desktop_devices`
  // is the second line of defense if the .eq filter ever drops.
  const userDb = getUserScopedClient(user.userId);

  // Verify the desktop belongs to this user
  const { data: desktop, error: desktopError } = await userDb
    .from('desktop_devices')
    .select('id, user_id')
    .eq('id', desktopId)
    .single();

  if (desktopError || !desktop) {
    throw new AppError('Desktop not found', 404);
  }

  if (desktop.user_id !== user.userId) {
    throw new AppError('Desktop not found', 404);
  }

  // Verify the pairing code exists and is valid via the signaling server
  let lookupResponse: globalThis.Response;
  try {
    lookupResponse = await fetch(
      `${SIGNALING_HTTP_URL.replace(/\/+$/, '')}/pairings/${encodeURIComponent(code)}`,
    );
  } catch (fetchError) {
    logger.error({ error: fetchError }, 'Failed to connect to signaling server');
    throw new AppError('Signaling server unavailable', 503);
  }

  if (lookupResponse.status === 404) {
    throw new AppError('Pairing code not found or expired', 404);
  }

  if (lookupResponse.status === 410) {
    throw new AppError('Pairing code has expired', 410);
  }

  if (!lookupResponse.ok) {
    throw new AppError('Failed to verify pairing code', 502);
  }

  // Wave 1.5+ task #17 (2026-05-08): two legacy best-effort writes were
  // removed here. They targeted `public.pairing_sessions` (table doesn't
  // exist; only `public.device_pairings` does) and `public.users.desktop_id`
  // (table+column don't exist; canonical user table is `public.profiles`,
  // no desktop_id column). Both calls always failed and were swallowed —
  // the signaling server is the source of truth for pairing state, so
  // these were dead persistence sinks, not load-bearing.

  res.json({
    code,
    desktopId,
    status: 'confirmed',
    message:
      'Pairing confirmed. Connect to the signaling server WebSocket to complete the handshake.',
    signaling: {
      httpUrl: SIGNALING_HTTP_URL,
      wsUrl: SIGNALING_HTTP_URL.replace(/^http/, 'ws') + '/ws',
    },
  });
});

/**
 * Get pairing status
 * GET /pair/status?code=<pairing-code>
 *
 * Check the current status of a pairing session.
 *
 * SECURITY: Rate limited to 60/min for polling
 */
router.get('/status', createRateLimiter('device-status'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const code = typeof req.query['code'] === 'string' ? req.query['code'] : undefined;
  if (!code) {
    throw new AppError('code query parameter is required', 400);
  }

  // Check the signaling server for live status
  let lookupResponse: globalThis.Response;
  try {
    lookupResponse = await fetch(
      `${SIGNALING_HTTP_URL.replace(/\/+$/, '')}/pairings/${encodeURIComponent(code)}`,
    );
  } catch (fetchError) {
    logger.error({ error: fetchError }, 'Failed to connect to signaling server');
    throw new AppError('Signaling server unavailable', 503);
  }

  if (lookupResponse.status === 404) {
    res.json({ code, status: 'not_found' });
    return;
  }

  if (lookupResponse.status === 410) {
    res.json({ code, status: 'expired' });
    return;
  }

  if (!lookupResponse.ok) {
    throw new AppError('Failed to check pairing status', 502);
  }

  const body = (await lookupResponse.json()) as {
    code: string;
    expiresAt: number;
    roles?: { desktop?: boolean; mobile?: boolean };
  };

  res.json({
    code: body.code,
    expiresAt: body.expiresAt,
    status: body.roles?.desktop && body.roles?.mobile ? 'paired' : 'waiting',
    roles: body.roles ?? { desktop: false, mobile: false },
  });
});

/**
 * Cancel a pairing session
 * DELETE /pair/cancel?code=<pairing-code>
 *
 * SECURITY: Rate limited to 10/min for destructive operations
 */
router.delete(
  '/cancel',
  createRateLimiter('device-delete'),
  async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const code = typeof req.query['code'] === 'string' ? req.query['code'] : undefined;
    if (!code) {
      throw new AppError('code query parameter is required', 400);
    }

    // Delete from signaling server
    try {
      await fetch(
        `${SIGNALING_HTTP_URL.replace(/\/+$/, '')}/pairings/${encodeURIComponent(code)}`,
        {
          method: 'DELETE',
        },
      );
    } catch (fetchError) {
      logger.warn({ error: fetchError }, 'Failed to delete from signaling server');
    }

    // Wave 1.5+ task #17 (2026-05-08): legacy `pairing_sessions` update
    // removed (dead — table doesn't exist; cancellation is enforced by
    // the signaling-server DELETE above).

    res.json({ code, status: 'cancelled' });
  },
);

export { router as pairRouter };

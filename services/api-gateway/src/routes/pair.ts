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
import { supabase } from '../lib/supabase';
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

  // Optionally store the pairing session in Supabase for tracking
  const { error: insertError } = await supabase.from('pairing_sessions').insert({
    code: payload.code,
    user_id: user.userId,
    desktop_id: desktopId ?? null,
    status: 'pending',
    expires_at: new Date(payload.expiresAt).toISOString(),
    created_at: new Date().toISOString(),
  });

  if (insertError) {
    // Non-fatal: pairing still works through the signaling server
    logger.debug({ error: insertError }, 'Failed to persist pairing session (table may not exist)');
  }

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

  // Verify the desktop belongs to this user
  const { data: desktop, error: desktopError } = await supabase
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

  // Update the pairing session in Supabase (best-effort)
  const { error: updateError } = await supabase
    .from('pairing_sessions')
    .update({
      desktop_id: desktopId,
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
    })
    .eq('code', code)
    .eq('user_id', user.userId);

  if (updateError) {
    logger.debug({ error: updateError }, 'Failed to update pairing session (table may not exist)');
  }

  // Link the desktop to the user's mobile (update the user record)
  const { error: linkError } = await supabase
    .from('users')
    .update({ desktop_id: desktopId })
    .eq('id', user.userId);

  if (linkError) {
    logger.warn({ error: linkError }, 'Failed to link desktop to user');
  }

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

    // Update DB status (best-effort)
    const { error: updateError } = await supabase
      .from('pairing_sessions')
      .update({ status: 'cancelled' })
      .eq('code', code)
      .eq('user_id', user.userId);

    if (updateError) {
      logger.debug({ error: updateError }, 'Failed to update pairing status (table may not exist)');
    }

    res.json({ code, status: 'cancelled' });
  },
);

export { router as pairRouter };

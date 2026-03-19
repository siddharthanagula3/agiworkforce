/**
 * @file Mobile Device API Routes
 * @security
 * - Rate limiting: Applied per-endpoint based on operation type
 * - Input validation: Zod schemas with .strict() to reject unexpected fields
 * - Authentication: JWT required for all endpoints
 * - Enumeration prevention: Returns 404 for both "not found" and "not owned" on delete
 *
 * Rate limit rationale (OWASP compliant):
 * - POST /register: 10/min - prevents fake device creation
 * - POST /push-token: 30/min - token updates are infrequent
 * - POST /pairing-code: 10/min - strict to prevent enumeration
 * - GET /: 30/min - list operation
 * - GET /agent-status: 60/min - read-only polling for agent dashboard
 * - POST /feedback: 10/min - prevents feedback spam
 * - DELETE /:deviceId: 10/min - destructive operation
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { supabase } from '../lib/supabase';
import { createRateLimiter } from '../middleware/rateLimit';
import { logger } from '../lib/logger';

const router: Router = Router();

// UUID validation regex (RFC 4122)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate that a string is a valid UUID format.
 * SECURITY: Prevents injection and ensures consistent ID format.
 */
function isValidUUID(id: string | undefined): boolean {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

router.use(authenticateToken);

const SIGNALING_HTTP_URL = process.env['SIGNALING_HTTP_URL'] ?? 'http://localhost:4000';
const SIGNALING_INTERNAL_SECRET = process.env['SIGNALING_INTERNAL_SECRET'];

// =============================================================================
// DATABASE TYPES
// =============================================================================

interface MobileDevice {
  id: string;
  user_id: string;
  platform: string;
  name: string;
  push_token: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

// SECURITY: .strict() rejects unexpected fields to prevent mass assignment
// Zod v4: Use top-level format validators for better performance
const registerSchema = z
  .object({
    clientId: z.uuid().optional(),
    platform: z.string().min(1).max(50),
    name: z.string().min(1).max(100),
    pushToken: z.string().max(500).optional(),
  })
  .strict();

// SECURITY: .strict() rejects unexpected fields
// Zod v4: Use top-level format validators for better performance
const pushTokenSchema = z
  .object({
    deviceId: z.uuid(),
    pushToken: z.string().min(1).max(500),
  })
  .strict();

// SECURITY: .strict() rejects unexpected fields
const pairingCodeRequestSchema = z
  .object({
    ttlSeconds: z.number().int().min(30).max(900).optional(),
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

// SECURITY: .strict() rejects unexpected fields
const feedbackSchema = z
  .object({
    type: z.enum(['bug', 'feature', 'general']),
    message: z.string().min(1).max(5000),
  })
  .strict();

// =============================================================================
// ROUTES
// =============================================================================

/**
 * Register a new mobile device
 * POST /mobile/register
 *
 * SECURITY: Rate limited to 10/min to prevent fake device creation
 */
router.post(
  '/register',
  createRateLimiter('device-register'),
  async (req: Request, res: Response) => {
    const { clientId, platform, name, pushToken } = registerSchema.parse(req.body);
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const deviceId = clientId ?? randomUUID();

    // SECURITY: Verify ownership before upsert to prevent device registration hijack.
    // Without this check, an attacker who knows another user's device ID could
    // overwrite their registration by supplying it as clientId.
    if (clientId) {
      const { data: existing } = await supabase
        .from('mobile_devices')
        .select('user_id')
        .eq('id', clientId)
        .single();

      if (existing && existing.user_id !== user.userId) {
        throw new AppError('Device registered to another user', 403);
      }
    }

    const { error } = await supabase.from('mobile_devices').upsert(
      {
        id: deviceId,
        user_id: user.userId,
        platform,
        name,
        push_token: pushToken ?? null,
      },
      {
        onConflict: 'id',
      },
    );

    if (error) {
      logger.error({ error }, 'Failed to register device');
      throw new AppError('Failed to register mobile device', 500);
    }

    res.json({ deviceId });
  },
);

/**
 * Update push token for a device
 * POST /mobile/push-token
 *
 * SECURITY: Rate limited to 30/min - token updates are infrequent
 */
router.post(
  '/push-token',
  createRateLimiter('mobile-push-token'),
  async (req: Request, res: Response) => {
    const { deviceId, pushToken } = pushTokenSchema.parse(req.body);
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    // First verify the device exists and belongs to the user
    const { data: device, error: fetchError } = await supabase
      .from('mobile_devices')
      .select('id, user_id')
      .eq('id', deviceId)
      .single();

    if (fetchError || !device) {
      throw new AppError('Device not found', 404);
    }

    // Check ownership - return 403 for not owned
    if (device.user_id !== user.userId) {
      throw new AppError('Forbidden', 403);
    }

    // Update the push token
    const { error: updateError } = await supabase
      .from('mobile_devices')
      .update({ push_token: pushToken })
      .eq('id', deviceId);

    if (updateError) {
      logger.error({ error: updateError }, 'Failed to update push token');
      throw new AppError('Failed to update push token', 500);
    }

    res.json({ success: true });
  },
);

/**
 * Request a pairing code from the signaling server
 * POST /mobile/pairing-code
 *
 * SECURITY: Rate limited to 10/min - strict to prevent enumeration attacks
 */
router.post(
  '/pairing-code',
  createRateLimiter('pairing-code'),
  async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const parseResult = pairingCodeRequestSchema.safeParse(req.body ?? {});
    if (!parseResult.success) {
      throw new AppError('Invalid request body', 400);
    }

    const ttlSeconds = parseResult.data.ttlSeconds;

    let fetchResponse: globalThis.Response;
    try {
      fetchResponse = await fetch(`${SIGNALING_HTTP_URL.replace(/\/+$/, '')}/pairings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(SIGNALING_INTERNAL_SECRET
            ? { Authorization: `Bearer ${SIGNALING_INTERNAL_SECRET}` }
            : {}),
        },
        body: JSON.stringify({
          ttlSeconds,
          metadata: {
            userId: user.userId,
            email: user.email,
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
      throw new AppError(`Failed to provision pairing: ${errorText}`, 502);
    }

    let jsonBody: unknown;
    try {
      jsonBody = await fetchResponse.json();
    } catch (parseError) {
      logger.error({ error: parseError }, 'Failed to parse signaling server response');
      throw new AppError('Invalid response from signaling server', 502);
    }

    const payload = pairingCodeResponseSchema.parse(jsonBody);

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
  },
);

/**
 * List all mobile devices for the current user
 * GET /mobile/
 *
 * SECURITY: Rate limited to 30/min for list operations
 */
router.get('/', createRateLimiter('device-list'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const { data: devices, error } = await supabase
    .from('mobile_devices')
    .select('*')
    .eq('user_id', user.userId)
    .order('updated_at', { ascending: false });

  if (error) {
    logger.error({ error }, 'Failed to list devices');
    throw new AppError('Failed to list mobile devices', 500);
  }

  const result = (devices || []).map((device: MobileDevice) => ({
    id: device.id,
    name: device.name,
    platform: device.platform,
    pushToken: device.push_token,
    updatedAt: new Date(device.updated_at).getTime(),
  }));

  res.json({ devices: result });
});

/**
 * Get status of running agents for the authenticated user
 * GET /mobile/agent-status
 *
 * Returns a stub response — actual agent status is delivered from the
 * desktop app to the mobile client via WebSocket in real-time.
 *
 * SECURITY: Rate limited to 60/min for read-only polling
 */
router.get(
  '/agent-status',
  createRateLimiter('mobile-agent-status'),
  async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    // Stub: real agent status flows through WebSocket from the desktop app
    res.json({ agents: [], pendingApprovals: 0 });
  },
);

/**
 * Submit user feedback (bug report, feature request, or general)
 * POST /mobile/feedback
 *
 * SECURITY: Rate limited to 10/min to prevent feedback spam
 */
router.post(
  '/feedback',
  createRateLimiter('mobile-feedback'),
  async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const { type, message } = feedbackSchema.parse(req.body);

    logger.info(
      {
        userId: user.userId,
        feedbackType: type,
        messageLength: message.length,
      },
      'Mobile feedback received',
    );

    res.json({ success: true });
  },
);

/**
 * Delete a mobile device
 * DELETE /mobile/:deviceId
 *
 * SECURITY: Rate limited to 10/min for destructive operations
 */
router.delete(
  '/:deviceId',
  createRateLimiter('device-delete'),
  async (req: Request<{ deviceId: string }>, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const { deviceId } = req.params;

    // SECURITY: Validate UUID format to prevent injection
    if (!isValidUUID(deviceId)) {
      throw new AppError('Invalid device ID format', 400);
    }

    // First verify ownership
    const { data: device, error: fetchError } = await supabase
      .from('mobile_devices')
      .select('id, user_id')
      .eq('id', deviceId)
      .single();

    if (fetchError || !device) {
      throw new AppError('Device not found', 404);
    }

    if (device.user_id !== user.userId) {
      throw new AppError('Device not found', 404);
    }

    const { error: deleteError } = await supabase
      .from('mobile_devices')
      .delete()
      .eq('id', deviceId);

    if (deleteError) {
      logger.error({ error: deleteError }, 'Failed to delete device');
      throw new AppError('Failed to delete mobile device', 500);
    }

    res.json({ success: true, message: 'Mobile device removed' });
  },
);

export { router as mobileRouter };

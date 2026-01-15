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
 * - DELETE /:deviceId: 10/min - destructive operation
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { asyncHandler } from '../middleware/asyncHandler';
import { supabase } from '../lib/supabase';
import { createRateLimiter } from '../middleware/rateLimit';

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
const registerSchema = z
  .object({
    clientId: z.string().uuid().optional(),
    platform: z.string().min(1).max(50),
    name: z.string().min(1).max(100),
    pushToken: z.string().max(500).optional(),
  })
  .strict();

// SECURITY: .strict() rejects unexpected fields
const pushTokenSchema = z
  .object({
    deviceId: z.string().uuid(),
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
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId, platform, name, pushToken } = registerSchema.parse(req.body);
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const deviceId = clientId ?? randomUUID();

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
      console.error('[mobile] Failed to register device:', error);
      throw new AppError('Failed to register mobile device', 500);
    }

    res.json({ deviceId });
  }),
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
  asyncHandler(async (req: Request, res: Response) => {
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
      console.error('[mobile] Failed to update push token:', updateError);
      throw new AppError('Failed to update push token', 500);
    }

    res.json({ success: true });
  }),
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
  asyncHandler(async (req: Request, res: Response) => {
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
      console.error('[mobile] Failed to connect to signaling server:', fetchError);
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
      console.error('[mobile] Failed to parse signaling server response:', parseError);
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
  }),
);

/**
 * List all mobile devices for the current user
 * GET /mobile/
 *
 * SECURITY: Rate limited to 30/min for list operations
 */
router.get(
  '/',
  createRateLimiter('device-list'),
  asyncHandler(async (req: Request, res: Response) => {
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
      console.error('[mobile] Failed to list devices:', error);
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
  }),
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
  asyncHandler(async (req: Request<{ deviceId: string }>, res: Response) => {
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
      console.error('[mobile] Failed to delete device:', deleteError);
      throw new AppError('Failed to delete mobile device', 500);
    }

    res.json({ success: true, message: 'Mobile device removed' });
  }),
);

export { router as mobileRouter };

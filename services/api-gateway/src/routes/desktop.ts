/**
 * @file Desktop Device API Routes
 * @security
 * - Rate limiting: Applied per-endpoint based on operation type
 * - Input validation: Zod schemas with .strict() to reject unexpected fields
 * - Authentication: JWT required for all endpoints
 * - Enumeration prevention: Returns 404 for both "not found" and "not owned"
 *
 * Rate limit rationale (OWASP compliant):
 * - POST /register: 10/min - prevents fake device creation
 * - GET /:desktopId/status: 60/min - read operation
 * - POST /:desktopId/command: 30/min - action-based
 * - GET /: 30/min - list operation
 * - POST /:desktopId/heartbeat: 600/min (10/sec) - real-time status
 * - DELETE /:desktopId: 10/min - destructive operation
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { asyncHandler } from '../middleware/asyncHandler';
import { supabase } from '../lib/supabase';
import { createRateLimiter } from '../middleware/rateLimit';

const router: Router = Router();

router.use(authenticateToken);

// =============================================================================
// DATABASE TYPES
// =============================================================================

interface DesktopDevice {
  id: string;
  user_id: string;
  name: string;
  platform: 'macos' | 'windows' | 'linux';
  version: string;
  last_seen_at: string;
  registered_at: string;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

// SECURITY: .strict() rejects unexpected fields to prevent mass assignment
const registerDesktopSchema = z
  .object({
    name: z.string().min(1).max(100),
    platform: z.enum(['macos', 'windows', 'linux']),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be in semver format (e.g., 1.0.0)'),
  })
  .strict();

// Strict payload schemas for each command type using discriminatedUnion
// SECURITY: This prevents arbitrary data injection and validates command-specific fields
// Note: Each inner object uses .strict() to reject unexpected fields
const chatPayloadSchema = z
  .object({
    type: z.literal('chat'),
    payload: z
      .object({
        message: z.string().min(1).max(10000),
        conversationId: z.string().uuid().optional(),
        model: z.string().max(50).optional(),
        temperature: z.number().min(0).max(2).optional(),
      })
      .strict(),
  })
  .strict();

const automationPayloadSchema = z
  .object({
    type: z.literal('automation'),
    payload: z
      .object({
        action: z.enum(['run', 'stop', 'pause', 'resume']),
        workflowId: z.string().uuid(),
        parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
        timeout: z.number().int().min(1000).max(3600000).optional(), // 1s to 1h
      })
      .strict(),
  })
  .strict();

const queryPayloadSchema = z
  .object({
    type: z.literal('query'),
    payload: z
      .object({
        query: z.string().min(1).max(5000),
        collection: z.string().min(1).max(100).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      })
      .strict(),
  })
  .strict();

const commandSchema = z.discriminatedUnion('type', [
  chatPayloadSchema,
  automationPayloadSchema,
  queryPayloadSchema,
]);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if a desktop device was seen within the last 60 seconds
 */
function isOnline(lastSeenAt: string): boolean {
  const lastSeen = new Date(lastSeenAt).getTime();
  return Date.now() - lastSeen < 60000;
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * Register a new desktop device
 * POST /desktop/register
 *
 * SECURITY: Rate limited to 10/min to prevent fake device creation
 */
router.post(
  '/register',
  createRateLimiter('device-register'),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, platform, version } = registerDesktopSchema.parse(req.body);
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const desktopId = randomUUID();
    const now = new Date().toISOString();

    const { error } = await supabase.from('desktop_devices').insert({
      id: desktopId,
      user_id: user.userId,
      name,
      platform,
      version,
      last_seen_at: now,
      registered_at: now,
    });

    if (error) {
      console.error('[desktop] Failed to register desktop:', error);
      throw new AppError('Failed to register desktop device', 500);
    }

    res.json({
      desktopId,
      message: 'Desktop registered successfully',
    });
  }),
);

/**
 * Get desktop device status
 * GET /desktop/:desktopId/status
 *
 * SECURITY: Rate limited to 60/min for responsive UX
 */
router.get(
  '/:desktopId/status',
  createRateLimiter('device-status'),
  asyncHandler(async (req: Request<{ desktopId: string }>, res: Response) => {
    // Check auth first (consistent order: auth -> ownership -> action)
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const { desktopId } = req.params;

    const { data: desktop, error } = await supabase
      .from('desktop_devices')
      .select('*')
      .eq('id', desktopId)
      .single();

    if (error || !desktop) {
      // Return 404 for "not found" to prevent enumeration attacks
      throw new AppError('Desktop not found', 404);
    }

    // Check ownership - return same 404 for "not owned" to prevent enumeration
    if (desktop.user_id !== user.userId) {
      throw new AppError('Desktop not found', 404);
    }

    res.json({
      id: desktop.id,
      name: desktop.name,
      platform: desktop.platform,
      version: desktop.version,
      online: isOnline(desktop.last_seen_at),
      lastSeen: new Date(desktop.last_seen_at).getTime(),
    });
  }),
);

/**
 * Send command to desktop device
 * POST /desktop/:desktopId/command
 *
 * SECURITY: Rate limited to 30/min to prevent automation abuse
 */
router.post(
  '/:desktopId/command',
  createRateLimiter('device-command'),
  asyncHandler(async (req: Request<{ desktopId: string }>, res: Response) => {
    // Check auth first (consistent order: auth -> ownership -> action)
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const { desktopId } = req.params;
    const { type, payload } = commandSchema.parse(req.body);

    const { data: desktop, error } = await supabase
      .from('desktop_devices')
      .select('id, user_id')
      .eq('id', desktopId)
      .single();

    if (error || !desktop) {
      throw new AppError('Desktop not found', 404);
    }

    // Check ownership - return same 404 for "not owned" to prevent enumeration
    if (desktop.user_id !== user.userId) {
      throw new AppError('Desktop not found', 404);
    }

    // TODO: In the future, this should publish to a message queue (Redis pub/sub, etc.)
    // for delivery to the desktop client. For now, we just acknowledge receipt.
    res.json({
      commandId: randomUUID(),
      status: 'queued',
      message: 'Command queued for delivery',
      type,
      payload,
    });
  }),
);

/**
 * List all desktop devices for the current user
 * GET /desktop/
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
      .from('desktop_devices')
      .select('*')
      .eq('user_id', user.userId)
      .order('last_seen_at', { ascending: false });

    if (error) {
      console.error('[desktop] Failed to list desktops:', error);
      throw new AppError('Failed to list desktop devices', 500);
    }

    const userDesktops = (devices || []).map((d: DesktopDevice) => ({
      id: d.id,
      name: d.name,
      platform: d.platform,
      version: d.version,
      online: isOnline(d.last_seen_at),
      lastSeen: new Date(d.last_seen_at).getTime(),
    }));

    res.json({ desktops: userDesktops });
  }),
);

/**
 * Update desktop heartbeat (last seen)
 * POST /desktop/:desktopId/heartbeat
 *
 * SECURITY: Rate limited to 600/min (10/sec) for real-time status
 */
router.post(
  '/:desktopId/heartbeat',
  createRateLimiter('heartbeat'),
  asyncHandler(async (req: Request<{ desktopId: string }>, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const { desktopId } = req.params;

    const { data: desktop, error: fetchError } = await supabase
      .from('desktop_devices')
      .select('id, user_id')
      .eq('id', desktopId)
      .single();

    if (fetchError || !desktop) {
      throw new AppError('Desktop not found', 404);
    }

    if (desktop.user_id !== user.userId) {
      throw new AppError('Desktop not found', 404);
    }

    const { error: updateError } = await supabase
      .from('desktop_devices')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', desktopId);

    if (updateError) {
      console.error('[desktop] Failed to update heartbeat:', updateError);
      throw new AppError('Failed to update heartbeat', 500);
    }

    res.json({ success: true });
  }),
);

/**
 * Unregister (delete) a desktop device
 * DELETE /desktop/:desktopId
 *
 * SECURITY: Rate limited to 10/min for destructive operations
 */
router.delete(
  '/:desktopId',
  createRateLimiter('device-delete'),
  asyncHandler(async (req: Request<{ desktopId: string }>, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const { desktopId } = req.params;

    // First verify ownership
    const { data: desktop, error: fetchError } = await supabase
      .from('desktop_devices')
      .select('id, user_id')
      .eq('id', desktopId)
      .single();

    if (fetchError || !desktop) {
      throw new AppError('Desktop not found', 404);
    }

    if (desktop.user_id !== user.userId) {
      throw new AppError('Desktop not found', 404);
    }

    const { error: deleteError } = await supabase
      .from('desktop_devices')
      .delete()
      .eq('id', desktopId);

    if (deleteError) {
      console.error('[desktop] Failed to delete desktop:', deleteError);
      throw new AppError('Failed to unregister desktop device', 500);
    }

    res.json({ success: true, message: 'Desktop device unregistered' });
  }),
);

export { router as desktopRouter };

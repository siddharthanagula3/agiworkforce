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
import { getUserScopedClient } from '../lib/neonClients';
import { createRateLimiter } from '../middleware/rateLimit';
import { logger } from '../lib/logger';
import { isValidUuid } from '../validations/ids';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';

const router: Router = Router();

// GW-1 (audit 2026-05-03): authenticate FIRST, then rate-limit. The
// previous order (rate-limit at line 31 before authenticateToken at
// line 44) was inconsistent with desktop.ts and meant any future route
// inserted between them would silently bypass auth. Putting auth at
// the top of the chain makes it impossible to forget.
router.use(authenticateToken);

// SECURITY: Baseline rate limit for all mobile endpoints (100/min fallback)
// — applied AFTER auth so the per-IP bucket reflects authenticated traffic.
router.use(createRateLimiter('default'));

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

interface AgentApprovalRequestRow {
  id: string;
  tool_name: string | null;
  agent_id: string | null;
  created_at: string;
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
  // SECURITY (C2, redteam-services 2026-05-04): per-role pair tokens issued by
  // the signaling server. Pairing is unusable without these because the
  // signaling server requires the role token on WebSocket registration.
  pairTokens: z.object({
    desktop: z.string(),
    mobile: z.string(),
  }),
});

// SECURITY: .strict() rejects unexpected fields
const feedbackSchema = z
  .object({
    type: z.enum(['bug', 'feature', 'general']),
    message: z.string().min(1).max(5000),
  })
  .strict();

function buildPairingQrData(code: string, pairToken: string): string {
  return `agiw:${code}:${pairToken}`;
}

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

    // Wave 1.5+ singleton sweep: user-scoped client.
    const db = getUserScopedClient(user.userId);

    // SECURITY: Verify ownership before upsert to prevent device registration hijack.
    // Without this check, an attacker who knows another user's device ID could
    // overwrite their registration by supplying it as clientId.
    if (clientId) {
      const { data: existing } = await db
        .from('mobile_devices')
        .select('user_id')
        .eq('id', clientId)
        .single();

      if (existing && existing.user_id !== user.userId) {
        throw new AppError('Device registered to another user', 403);
      }
    }

    const { error } = await db.from('mobile_devices').upsert(
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

    // Wave 1.5+ singleton sweep: user-scoped client.
    const db = getUserScopedClient(user.userId);
    // First verify the device exists and belongs to the user
    const { data: device, error: fetchError } = await db
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
    const { error: updateError } = await db
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

    if (!SIGNALING_INTERNAL_SECRET) {
      throw new AppError('Signaling pairing is not configured', 503);
    }

    let fetchResponse: globalThis.Response;
    try {
      fetchResponse = await fetchWithTimeout(`${SIGNALING_HTTP_URL.replace(/\/+$/, '')}/pairings`, {
        method: 'POST',
        timeoutMs: 10_000,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SIGNALING_INTERNAL_SECRET}`,
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

    // SECURITY (C2): forward the signaling-issued role tokens to the
    // authenticated caller so the desktop/mobile clients can register with the
    // signaling server. Do not log these tokens.
    res.json({
      code: payload.code,
      expiresAt: payload.expiresAt,
      expiresIn: payload.expiresIn,
      qrData: buildPairingQrData(payload.code, payload.pairTokens.desktop),
      signaling: {
        httpUrl: payload.httpUrl,
        wsUrl: payload.wsUrl,
      },
      pairTokens: payload.pairTokens,
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

  // Wave 1.5+ singleton sweep: user-scoped client.
  const db = getUserScopedClient(user.userId);
  const { data: devices, error } = await db
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
 * Returns pending approval summaries for background notification polling.
 * Live running-agent state is still delivered over the paired desktop
 * realtime channel and is not inferred from this polling endpoint.
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

    const db = getUserScopedClient(user.userId);
    const { data: pendingRequests, error } = await db
      .from('agent_approval_requests')
      .select('id, tool_name, agent_id, created_at')
      .eq('user_id', user.userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      logger.error({ error }, 'Failed to fetch mobile pending approvals');
      throw new AppError('Failed to fetch pending approvals', 500);
    }

    const pendingApprovals = ((pendingRequests ?? []) as AgentApprovalRequestRow[]).map(
      (request) => ({
        id: request.id,
        agentName: request.agent_id ?? 'Agent',
        toolName: request.tool_name ?? 'tool',
        description: 'Agent action requires approval',
      }),
    );

    res.json({
      pendingApprovals,
      pendingApprovalCount: pendingApprovals.length,
      liveAgentStatusAvailable: false,
    });
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

    const db = getUserScopedClient(user.userId);
    const { error } = await db.from('feedback').insert({
      user_id: user.userId,
      subject: `mobile:${type}`,
      message,
      metadata: {
        source: 'mobile',
        type,
      },
    });

    if (error) {
      logger.error({ error, feedbackType: type }, 'Failed to persist mobile feedback');
      throw new AppError('Failed to submit feedback', 500);
    }

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
    if (!isValidUuid(deviceId)) {
      throw new AppError('Invalid device ID format', 400);
    }

    // Wave 1.5+ singleton sweep: user-scoped client.
    const db = getUserScopedClient(user.userId);
    // First verify ownership
    const { data: device, error: fetchError } = await db
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

    const { error: deleteError } = await db.from('mobile_devices').delete().eq('id', deviceId);

    if (deleteError) {
      logger.error({ error: deleteError }, 'Failed to delete device');
      throw new AppError('Failed to delete mobile device', 500);
    }

    res.json({ success: true, message: 'Mobile device removed' });
  },
);

export { router as mobileRouter };

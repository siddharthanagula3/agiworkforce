/**
 * @file Agent Status & Approval API Routes
 * @security
 * - Rate limiting: Applied per-endpoint based on operation type
 * - Input validation: Zod schemas with .strict() to reject unexpected fields
 * - Authentication: JWT required for all endpoints
 * - Ownership validation: Users can only access their own desktop agents
 *
 * Rate limit rationale (OWASP compliant):
 * - GET /status: 60/min - read operation, frequent polling
 * - POST /approve: 30/min - action-based, moderate limit
 * - POST /deny: 30/min - action-based, moderate limit
 * - GET /pending: 60/min - read operation, frequent polling
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { getServiceClient } from '../lib/neonClients';
import { createRateLimiter } from '../middleware/rateLimit';
import { sendCommandToDesktop } from '../websocket';
import { logger } from '../lib/logger';
import { isValidUuid } from '../validations/ids';

const router: Router = Router();

// GW-1 (audit 2026-05-03): authenticate FIRST, then rate-limit. The
// previous order (rate-limit before authenticateToken) was inconsistent
// with desktop.ts/mobile.ts and meant any future route inserted between
// them would silently bypass auth. Putting auth at the top of the chain
// makes it impossible to forget.
router.use(authenticateToken);

// SECURITY: Baseline rate limit for all agent endpoints (100/min fallback)
// — applied AFTER auth so the per-IP bucket reflects authenticated traffic.
router.use(createRateLimiter('default'));

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

// SECURITY: .strict() rejects unexpected fields to prevent mass assignment
const approveSchema = z
  .object({
    desktopId: z.string().uuid(),
    requestId: z.string().uuid(),
    toolName: z.string().min(1).max(200).optional(),
  })
  .strict();

const denySchema = z
  .object({
    desktopId: z.string().uuid(),
    requestId: z.string().uuid(),
    reason: z.string().max(500).optional(),
  })
  .strict();

// =============================================================================
// HELPER: Verify desktop ownership
// =============================================================================

async function verifyDesktopOwnership(desktopId: string, userId: string): Promise<void> {
  if (!isValidUuid(desktopId)) {
    throw new AppError('Invalid desktop ID format', 400);
  }

  // RLS-GAP: desktop_devices has no RLS policy (0013_devices.sql enables
  // none) — migration TODO. Same gap applies to `agent_approval_requests` (no
  // migration record anywhere in the repo) at every getServiceClient() call
  // site in this file. Explicit ownership/filter checks are the SOLE
  // tenant-isolation mechanism until policies ship.
  const db = getServiceClient();
  const { data: desktop, error } = await db
    .from('desktop_devices')
    .select('id, user_id')
    .eq('id', desktopId)
    .single();

  if (error || !desktop) {
    throw new AppError('Desktop not found', 404);
  }

  if (desktop.user_id !== userId) {
    throw new AppError('Desktop not found', 404);
  }
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * Get agent status from a desktop device
 * GET /agents/status?desktopId=<uuid>
 *
 * Returns the current running agents and their states on the paired desktop.
 *
 * SECURITY: Rate limited to 60/min for responsive UX
 */
router.get('/status', createRateLimiter('device-status'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const desktopId = typeof req.query['desktopId'] === 'string' ? req.query['desktopId'] : undefined;
  if (!desktopId) {
    throw new AppError('desktopId query parameter is required', 400);
  }

  await verifyDesktopOwnership(desktopId, user.userId);

  const db = getServiceClient(); // RLS-GAP: see verifyDesktopOwnership() above
  // Send a status query to the desktop via WebSocket and return the response.
  // For MVP, we query the last known status from the DB.
  const { data: desktop } = await db
    .from('desktop_devices')
    .select('*')
    .eq('id', desktopId)
    .single();

  // Also check if the desktop is currently connected
  const { delivered } = sendCommandToDesktop(user.userId, desktopId, 'status-probe', 'query', {
    query: 'agent_status',
  });

  const lastSeen = desktop?.last_seen_at ? new Date(desktop.last_seen_at).getTime() : 0;
  const online = Date.now() - lastSeen < 60000;

  res.json({
    desktopId,
    online,
    connected: delivered,
    lastSeen,
    agents: {
      // Agent status will be populated when the desktop responds via WebSocket.
      // The mobile client should listen on the WebSocket for real-time agent updates.
      status: online ? 'awaiting_response' : 'offline',
    },
  });
});

/**
 * Get pending approval requests for a desktop
 * GET /agents/pending?desktopId=<uuid>
 *
 * Returns tool execution requests that need mobile user approval.
 *
 * SECURITY: Rate limited to 60/min for responsive UX
 */
router.get('/pending', createRateLimiter('device-status'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const desktopId = typeof req.query['desktopId'] === 'string' ? req.query['desktopId'] : undefined;
  if (!desktopId) {
    throw new AppError('desktopId query parameter is required', 400);
  }

  await verifyDesktopOwnership(desktopId, user.userId);

  const db = getServiceClient(); // RLS-GAP: see verifyDesktopOwnership() above
  // Fetch pending approval requests from Neon
  const { data: pendingRequests, error } = await db
    .from('agent_approval_requests')
    .select('*')
    .eq('desktop_id', desktopId)
    .eq('user_id', user.userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    logger.error({ error, desktopId }, 'Failed to fetch pending approval requests');
    throw new AppError('Failed to fetch pending approval requests', 500);
  }

  res.json({
    desktopId,
    pending: (pendingRequests ?? []).map((r) => ({
      requestId: r.id,
      toolName: r.tool_name,
      toolArgs: r.tool_args,
      agentId: r.agent_id,
      createdAt: r.created_at,
    })),
  });
});

/**
 * Approve tool execution on desktop
 * POST /agents/approve
 *
 * Sends an approval signal to the desktop so the agent can proceed with tool execution.
 *
 * SECURITY: Rate limited to 30/min to prevent automation abuse
 */
router.post(
  '/approve',
  createRateLimiter('device-command'),
  async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const { desktopId, requestId } = approveSchema.parse(req.body);

    await verifyDesktopOwnership(desktopId, user.userId);

    const db = getServiceClient(); // RLS-GAP: see verifyDesktopOwnership() above
    const { data: updatedRows, error: updateError } = await db
      .from('agent_approval_requests')
      .update({ status: 'approved', resolved_at: new Date().toISOString() })
      .eq('id', requestId)
      .eq('user_id', user.userId)
      .eq('desktop_id', desktopId)
      .eq('status', 'pending')
      .select('id');

    if (updateError) {
      logger.error({ error: updateError, desktopId, requestId }, 'Failed to approve request');
      throw new AppError('Failed to approve request', 500);
    }

    if (!updatedRows || updatedRows.length !== 1) {
      throw new AppError('Approval request not found or already resolved', 404);
    }

    // Send approval command to desktop via WebSocket
    const { delivered, queued } = sendCommandToDesktop(
      user.userId,
      desktopId,
      requestId,
      'agent_approved',
      { requestId, action: 'approve' },
    );

    logger.info(
      { userId: user.userId, desktopId, requestId, delivered },
      'Agent tool execution approved from mobile',
    );

    res.json({
      requestId,
      status: delivered ? 'delivered' : queued ? 'queued' : 'failed',
      message: delivered
        ? 'Approval sent to desktop'
        : queued
          ? 'Desktop offline — approval queued'
          : 'Failed to send approval',
    });
  },
);

/**
 * Deny tool execution on desktop
 * POST /agents/deny
 *
 * Sends a denial signal to the desktop, blocking the agent from proceeding.
 *
 * SECURITY: Rate limited to 30/min to prevent automation abuse
 */
router.post('/deny', createRateLimiter('device-command'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const { desktopId, requestId, reason } = denySchema.parse(req.body);

  await verifyDesktopOwnership(desktopId, user.userId);

  const db = getServiceClient(); // RLS-GAP: see verifyDesktopOwnership() above
  const { data: updatedRows, error: updateError } = await db
    .from('agent_approval_requests')
    .update({
      status: 'denied',
      denial_reason: reason ?? null,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('user_id', user.userId)
    .eq('desktop_id', desktopId)
    .eq('status', 'pending')
    .select('id');

  if (updateError) {
    logger.error({ error: updateError, desktopId, requestId }, 'Failed to deny request');
    throw new AppError('Failed to deny request', 500);
  }

  if (!updatedRows || updatedRows.length !== 1) {
    throw new AppError('Approval request not found or already resolved', 404);
  }

  // Send denial command to desktop via WebSocket
  const { delivered, queued } = sendCommandToDesktop(
    user.userId,
    desktopId,
    requestId,
    'agent_denied',
    { requestId, action: 'deny', reason: reason ?? 'User denied from mobile' },
  );

  logger.info(
    { userId: user.userId, desktopId, requestId, reason, delivered },
    'Agent tool execution denied from mobile',
  );

  res.json({
    requestId,
    status: delivered ? 'delivered' : queued ? 'queued' : 'failed',
    message: delivered
      ? 'Denial sent to desktop'
      : queued
        ? 'Desktop offline — denial queued'
        : 'Failed to send denial',
  });
});

export { router as agentsRouter };

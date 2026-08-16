
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { getUserScopedClient, type UserAuth } from '../lib/neonClients';
import { createRateLimiter } from '../middleware/rateLimit';
import { sendCommandToDesktop } from '../websocket';
import { logger } from '../lib/logger';
import { isValidUuid } from '../validations/ids';

const router: Router = Router();

router.use(authenticateToken);

router.use(createRateLimiter('default'));

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

async function verifyDesktopOwnership(desktopId: string, user: UserAuth): Promise<void> {
  if (!isValidUuid(desktopId)) {
    throw new AppError('Invalid desktop ID format', 400);
  }

  const db = getUserScopedClient(user);
  const { data: desktop, error } = await db
    .from('desktop_devices')
    .select('id, user_id')
    .eq('id', desktopId)
    .single();

  if (error || !desktop) {
    throw new AppError('Desktop not found', 404);
  }

  if (desktop.user_id !== user.userId) {
    throw new AppError('Desktop not found', 404);
  }
}

router.get('/status', createRateLimiter('device-status'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const desktopId = typeof req.query['desktopId'] === 'string' ? req.query['desktopId'] : undefined;
  if (!desktopId) {
    throw new AppError('desktopId query parameter is required', 400);
  }

  await verifyDesktopOwnership(desktopId, user);

  const db = getUserScopedClient(user);
  const { data: desktop } = await db
    .from('desktop_devices')
    .select('*')
    .eq('id', desktopId)
    .single();

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
      status: online ? 'awaiting_response' : 'offline',
    },
  });
});

router.get('/pending', createRateLimiter('device-status'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const desktopId = typeof req.query['desktopId'] === 'string' ? req.query['desktopId'] : undefined;
  if (!desktopId) {
    throw new AppError('desktopId query parameter is required', 400);
  }

  await verifyDesktopOwnership(desktopId, user);

  const db = getUserScopedClient(user);
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

router.post(
  '/approve',
  createRateLimiter('device-command'),
  async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const { desktopId, requestId } = approveSchema.parse(req.body);

    await verifyDesktopOwnership(desktopId, user);

    const db = getUserScopedClient(user);
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

router.post('/deny', createRateLimiter('device-command'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const { desktopId, requestId, reason } = denySchema.parse(req.body);

  await verifyDesktopOwnership(desktopId, user);

  const db = getUserScopedClient(user);
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

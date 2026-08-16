
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { getUserScopedClient } from '../lib/neonClients';
import { createRateLimiter } from '../middleware/rateLimit';
import { sendCommandToDesktop } from '../websocket';
import { logger } from '../lib/logger';
import { isValidUuid } from '../validations/ids';

const router: Router = Router();

router.use(authenticateToken);

router.use(createRateLimiter('default'));

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

const registerDesktopSchema = z
  .object({
    name: z.string().min(1).max(100),
    platform: z.enum(['macos', 'windows', 'linux']),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be in semver format (e.g., 1.0.0)'),
  })
  .strict();

const chatPayloadSchema = z
  .object({
    type: z.literal('chat'),
    payload: z
      .object({
        message: z.string().min(1).max(10000),
        conversationId: z.uuid().optional(),
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
        workflowId: z.uuid(),
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

function isOnline(lastSeenAt: string): boolean {
  const lastSeen = new Date(lastSeenAt).getTime();
  return Date.now() - lastSeen < 60000;
}

router.post(
  '/register',
  createRateLimiter('device-register'),
  async (req: Request, res: Response) => {
    const { name, platform, version } = registerDesktopSchema.parse(req.body);
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const desktopId = randomUUID();
    const now = new Date().toISOString();

    const db = getUserScopedClient(user);
    const { error } = await db.from('desktop_devices').insert({
      id: desktopId,
      user_id: user.userId,
      name,
      platform,
      version,
      last_seen_at: now,
      registered_at: now,
    });

    if (error) {
      logger.error({ error }, 'Failed to register desktop');
      throw new AppError('Failed to register desktop device', 500);
    }

    res.json({
      desktopId,
      message: 'Desktop registered successfully',
    });
  },
);

router.get(
  '/:desktopId/status',
  createRateLimiter('device-status'),
  async (req: Request<{ desktopId: string }>, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const { desktopId } = req.params;

    if (!isValidUuid(desktopId)) {
      throw new AppError('Invalid desktop ID format', 400);
    }

    const db = getUserScopedClient(user);
    const { data: desktop, error } = await db
      .from('desktop_devices')
      .select('*')
      .eq('id', desktopId)
      .single();

    if (error || !desktop) {
      throw new AppError('Desktop not found', 404);
    }

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
  },
);

router.post(
  '/:desktopId/command',
  createRateLimiter('device-command'),
  async (req: Request<{ desktopId: string }>, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const { desktopId } = req.params;

    if (!isValidUuid(desktopId)) {
      throw new AppError('Invalid desktop ID format', 400);
    }

    const { type, payload } = commandSchema.parse(req.body);

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

    const commandId = randomUUID();
    const { delivered, queued } = sendCommandToDesktop(
      user.userId,
      desktopId,
      commandId,
      type,
      payload,
    );

    res.json({
      commandId,
      status: delivered ? 'delivered' : queued ? 'queued' : 'failed',
      message: delivered
        ? 'Command delivered to desktop'
        : queued
          ? 'Desktop offline - command queued for delivery when device reconnects'
          : 'Failed to deliver command',
      type,
      payload,
    });
  },
);

router.get('/', createRateLimiter('device-list'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const db = getUserScopedClient(user);
  const { data: devices, error } = await db
    .from('desktop_devices')
    .select('*')
    .eq('user_id', user.userId)
    .order('last_seen_at', { ascending: false });

  if (error) {
    logger.error({ error }, 'Failed to list desktops');
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
});

router.post(
  '/:desktopId/heartbeat',
  createRateLimiter('heartbeat'),
  async (req: Request<{ desktopId: string }>, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const { desktopId } = req.params;

    if (!isValidUuid(desktopId)) {
      throw new AppError('Invalid desktop ID format', 400);
    }

    const db = getUserScopedClient(user);
    const { data: desktop, error: fetchError } = await db
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

    const { error: updateError } = await db
      .from('desktop_devices')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', desktopId);

    if (updateError) {
      logger.error({ error: updateError }, 'Failed to update heartbeat');
      throw new AppError('Failed to update heartbeat', 500);
    }

    res.json({ success: true });
  },
);

router.delete(
  '/:desktopId',
  createRateLimiter('device-delete'),
  async (req: Request<{ desktopId: string }>, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const { desktopId } = req.params;

    if (!isValidUuid(desktopId)) {
      throw new AppError('Invalid desktop ID format', 400);
    }

    const db = getUserScopedClient(user);
    const { data: desktop, error: fetchError } = await db
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

    const { error: deleteError } = await db.from('desktop_devices').delete().eq('id', desktopId);

    if (deleteError) {
      logger.error({ error: deleteError }, 'Failed to delete desktop');
      throw new AppError('Failed to unregister desktop device', 500);
    }

    res.json({ success: true, message: 'Desktop device unregistered' });
  },
);

export { router as desktopRouter };

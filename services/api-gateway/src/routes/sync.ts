
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { getUserScopedClient } from '../lib/neonClients';
import { createRateLimiter } from '../middleware/rateLimit';
import { logger } from '../lib/logger';

const router: Router = Router();

router.use(authenticateToken);
router.use(createRateLimiter('default'));

const syncItemSchema = z
  .object({
    id: z.string().max(100),
    entity_type: z.string().max(100),
    entity_id: z.string().max(100),
    action: z.enum(['Create', 'Update', 'Delete']),
    data: z.string().max(1_000_000).nullable().optional(), // 1MB max per item
    timestamp: z.string(),
    retry_count: z.number().int().min(0).max(100).default(0),
    synced: z.boolean().default(false),
    error: z.string().max(1000).nullable().optional(),
  })
  .strict();

const batchSyncSchema = z
  .object({
    items: z.array(syncItemSchema).max(100), // Max 100 items per batch
    device_id: z.string().max(100),
    user_id: z.string().max(100),
    timestamp: z.string(),
  })
  .strict();

const conflictResolutionSchema = z
  .object({
    entity_id: z.string().max(100),
    resolution_data: z.string().max(1_000_000), // 1MB max
    version: z.number().int().positive(),
    device_id: z.string().max(100),
  })
  .strict();

const deviceRegistrationSchema = z
  .object({
    device_id: z.string().max(100),
    device_name: z.string().max(200),
    user_id: z.string().max(100),
    platform: z.string().max(50).optional(),
    timestamp: z.string().optional(),
  })
  .strict();

router.post('/batch', createRateLimiter('sync-batch'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const batch = batchSyncSchema.parse(req.body);

  if (batch.user_id !== user.userId) {
    throw new AppError('user_id mismatch', 403);
  }

  const db = getUserScopedClient(user);

  const rawDeviceId = (req.headers['x-device-id'] as string | undefined) ?? batch.device_id;
  let deviceId: string | undefined;
  if (rawDeviceId) {
    const { data: pairing } = await db
      .from('device_pairings')
      .select('id')
      .eq('user_id', user.userId)
      .eq('device_id', rawDeviceId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    if (pairing) {
      deviceId = rawDeviceId;
    } else {
      throw new AppError('device_id does not belong to authenticated user', 403);
    }
  }

  const syncedIds: string[] = [];
  const failedIds: string[] = [];
  const conflicts: Array<{
    entity_id: string;
    entity_type: string;
    local_hash: string;
    remote_hash: string;
    remote_data: string;
    remote_timestamp: string;
  }> = [];

  for (const item of batch.items) {
    try {
      const { data: existing } = await db
        .from('sync_data')
        .select('*')
        .eq('user_id', user.userId)
        .eq('sync_type', item.entity_type)
        .order('created_at', { ascending: false })
        .limit(1);

      const existingEntry = existing?.[0];
      if (existingEntry && item.action === 'Update') {
        const existingTime = new Date(existingEntry.created_at).getTime();
        const itemTime = new Date(item.timestamp).getTime();

        if (Number.isNaN(existingTime) || Number.isNaN(itemTime)) {
          logger.error(
            { existingTime: existingEntry.created_at, itemTime: item.timestamp },
            'Invalid timestamp detected',
          );
          failedIds.push(item.id);
          continue;
        }

        if (existingTime > itemTime) {
          conflicts.push({
            entity_id: item.entity_id,
            entity_type: item.entity_type,
            local_hash: item.data?.substring(0, 32) ?? '',
            remote_hash: JSON.stringify(existingEntry.data).substring(0, 32),
            remote_data: JSON.stringify(existingEntry.data),
            remote_timestamp: existingEntry.created_at,
          });
          continue;
        }
      }

      let parsedData = {};
      if (item.data) {
        try {
          parsedData = JSON.parse(item.data);
        } catch (parseError) {
          logger.error({ error: parseError }, 'Failed to parse item data');
          failedIds.push(item.id);
          continue;
        }
      }

      const { error } = await db.from('sync_data').insert({
        user_id: user.userId,
        device_id: deviceId ?? batch.device_id,
        sync_type: item.entity_type,
        data: parsedData,
      });

      if (error) {
        logger.error({ error }, 'Batch item error');
        failedIds.push(item.id);
      } else {
        syncedIds.push(item.id);
      }
    } catch (err) {
      logger.error({ error: err }, 'Batch item exception');
      failedIds.push(item.id);
    }
  }

  res.json({
    success: failedIds.length === 0,
    synced_ids: syncedIds,
    failed_ids: failedIds,
    conflicts,
    updates: [], // Updates are fetched via GET /updates
  });
});

router.get('/updates', createRateLimiter('sync-updates'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const sinceRaw = req.query['since'];
  const since = typeof sinceRaw === 'string' ? sinceRaw : new Date(0).toISOString();
  const deviceId = req.headers['x-device-id'] as string | undefined;

  const db = getUserScopedClient(user);
  let query = db
    .from('sync_data')
    .select('*')
    .eq('user_id', user.userId)
    .gt('created_at', since)
    .order('created_at', { ascending: true });

  if (deviceId) {
    query = query.neq('device_id', deviceId);
  }

  const { data: syncData, error } = await query;

  if (error) {
    logger.error({ error }, 'Updates error');
    throw new AppError('Failed to pull updates', 500);
  }

  const updates = (syncData ?? []).map((row, index) => ({
    entity_type: row.sync_type,
    entity_id: row.id, // Using row id as entity_id for now
    action: 'Update' as const, // Default to Update since we don't track action in schema
    data: JSON.stringify(row.data),
    timestamp: row.created_at,
    version: index + 1, // Simple incrementing version
  }));

  res.json(updates);
});

router.post(
  '/resolve-conflict',
  createRateLimiter('sync-resolve'),
  async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const resolution = conflictResolutionSchema.parse(req.body);
    const deviceId = req.headers['x-device-id'] as string | undefined;

    const db = getUserScopedClient(user);
    const { error } = await db.from('sync_data').insert({
      user_id: user.userId,
      device_id: deviceId ?? resolution.device_id,
      sync_type: 'conflict_resolution',
      data: {
        entity_id: resolution.entity_id,
        resolution_data: resolution.resolution_data,
        version: resolution.version,
        resolved_at: new Date().toISOString(),
      },
    });

    if (error) {
      logger.error({ error }, 'Conflict resolution error');
      throw new AppError('Failed to resolve conflict', 500);
    }

    res.json({ success: true });
  },
);

router.get('/status', createRateLimiter('sync-status'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const db = getUserScopedClient(user);
  const { count: pendingCount } = await db
    .from('sync_data')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.userId);

  const { data: lastSync } = await db
    .from('sync_data')
    .select('created_at')
    .eq('user_id', user.userId)
    .order('created_at', { ascending: false })
    .limit(1);

  res.json({
    is_syncing: false, // We don't track this at the API level
    last_sync: lastSync?.[0]?.created_at ?? null,
    pending_count: pendingCount ?? 0,
    failed_count: 0, // Would need failure tracking in schema
    next_sync: null, // Client determines this
  });
});

router.post(
  '/devices/register',
  createRateLimiter('device-register'),
  async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const registration = deviceRegistrationSchema.parse(req.body);

    const db = getUserScopedClient(user);

    const { error } = await db.from('sync_data').upsert(
      {
        user_id: user.userId,
        device_id: registration.device_id,
        sync_type: 'device_registration',
        data: {
          device_name: registration.device_name,
          platform: registration.platform,
          registered_at: registration.timestamp ?? new Date().toISOString(),
        },
      },
      {
        onConflict: 'user_id,device_id,sync_type,created_at',
        ignoreDuplicates: true,
      },
    );

    if (error) {
      logger.error({ error }, 'Device registration error');
      throw new AppError('Failed to register device', 500);
    }

    res.json({ success: true });
  },
);

router.delete(
  '/devices/:deviceId',
  createRateLimiter('device-delete'),
  async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const deviceId = req.params['deviceId'];
    if (!deviceId) {
      throw new AppError('Device ID required', 400);
    }

    const db = getUserScopedClient(user);
    const { error } = await db
      .from('sync_data')
      .delete()
      .eq('user_id', user.userId)
      .eq('device_id', deviceId);

    if (error) {
      logger.error({ error }, 'Device unregistration error');
      throw new AppError('Failed to unregister device', 500);
    }

    res.json({ success: true });
  },
);

const legacySyncSchema = z
  .object({
    type: z.string().max(100),
    data: z.record(z.string(), z.unknown()),
    deviceId: z.string().max(100),
  })
  .strict();

router.post('/push', createRateLimiter('sync-legacy'), async (req: Request, res: Response) => {
  const { type, data, deviceId } = legacySyncSchema.parse(req.body);
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const db = getUserScopedClient(user);
  const { error } = await db.from('sync_data').insert({
    user_id: user.userId,
    device_id: deviceId,
    sync_type: type,
    data: data,
  });

  if (error) {
    logger.error({ error }, 'Push error');
    throw new AppError('Failed to push sync data', 500);
  }

  res.json({
    success: true,
    timestamp: Date.now(),
  });
});

router.get('/pull', createRateLimiter('sync-legacy'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const sinceRaw = req.query['since'];
  let since = typeof sinceRaw === 'string' ? Number(sinceRaw) : 0;
  if (Number.isNaN(since) || since < 0) {
    since = 0;
  }
  const deviceIdParam = req.query['deviceId'];
  const deviceId = typeof deviceIdParam === 'string' ? deviceIdParam : undefined;

  const sinceDate = new Date(since).toISOString();

  const db = getUserScopedClient(user);
  let query = db
    .from('sync_data')
    .select('*')
    .eq('user_id', user.userId)
    .gt('created_at', sinceDate)
    .order('created_at', { ascending: true });

  if (deviceId) {
    query = query.neq('device_id', deviceId);
  }

  const { data: syncData, error } = await query;

  if (error) {
    logger.error({ error }, 'Pull error');
    throw new AppError('Failed to pull sync data', 500);
  }

  const formattedData = (syncData ?? []).map((row) => ({
    userId: row.user_id,
    type: row.sync_type,
    data: row.data,
    timestamp: new Date(row.created_at).getTime(),
    deviceId: row.device_id,
  }));

  res.json({
    data: formattedData,
    timestamp: Date.now(),
  });
});

router.delete('/clear', createRateLimiter('sync-legacy'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const db = getUserScopedClient(user);
  const { error } = await db.from('sync_data').delete().eq('user_id', user.userId);

  if (error) {
    logger.error({ error }, 'Clear error');
    throw new AppError('Failed to clear sync data', 500);
  }

  res.json({ success: true });
});

export { router as syncRouter };

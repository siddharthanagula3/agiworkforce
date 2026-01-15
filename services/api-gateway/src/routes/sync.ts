/**
 * @file Sync API Routes
 * @security
 * - Rate limiting: Applied per-endpoint based on operation type
 * - Input validation: Zod schemas with .strict() to reject unexpected fields
 * - Authentication: JWT required for all endpoints
 *
 * Rate limit rationale (OWASP compliant):
 * - POST /batch: 30/min - batch operations can be resource-intensive
 * - GET /updates: 60/min - polling for updates
 * - POST /resolve-conflict: 20/min - conflict resolution is rare
 * - GET /status: 60/min - status checks are lightweight
 * - POST /devices/register: 10/min - device registration
 * - DELETE /devices/:deviceId: 10/min - destructive operation
 * - Legacy endpoints: 30/min - moderate limit for backwards compatibility
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { asyncHandler } from '../middleware/asyncHandler';
import { supabase } from '../lib/supabase';
import { createRateLimiter } from '../middleware/rateLimit';

const router: Router = Router();

router.use(authenticateToken);

// =============================================================================
// Sync API - Aligned with Rust CloudSyncClient
// =============================================================================
// Sync data is stored in Supabase (sync_data table)
// This ensures data survives server restarts and scales across instances
// TTL cleanup and max entries are handled by database triggers

// SECURITY: Zod schemas for validation with .strict() to reject unexpected fields
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

// =============================================================================
// POST /batch - Batch sync (matches Rust CloudSyncClient.sync_batch)
// SECURITY: Rate limited to 30/min - batch operations can be resource-intensive
// =============================================================================
router.post(
  '/batch',
  createRateLimiter('sync-batch'),
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const batch = batchSyncSchema.parse(req.body);
    const deviceId = req.headers['x-device-id'] as string | undefined;

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

    // Process each item in the batch
    for (const item of batch.items) {
      try {
        // Check for conflicts - look for existing entries with same entity_id
        const { data: existing } = await supabase
          .from('sync_data')
          .select('*')
          .eq('user_id', user.userId)
          .eq('sync_type', item.entity_type)
          .order('created_at', { ascending: false })
          .limit(1);

        // For now, simple last-write-wins with conflict detection
        // Full conflict resolution would need entity_id and version columns in schema
        const existingEntry = existing?.[0];
        if (existingEntry && item.action === 'Update') {
          const existingTime = new Date(existingEntry.created_at).getTime();
          const itemTime = new Date(item.timestamp).getTime();

          // Validate timestamps are valid numbers
          if (Number.isNaN(existingTime) || Number.isNaN(itemTime)) {
            console.error('[Sync] Invalid timestamp detected:', {
              existingTime: existingEntry.created_at,
              itemTime: item.timestamp,
            });
            failedIds.push(item.id);
            continue;
          }

          // If remote is newer, it's a conflict
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

        // Insert the sync item
        let parsedData = {};
        if (item.data) {
          try {
            parsedData = JSON.parse(item.data);
          } catch (parseError) {
            console.error('[Sync] Failed to parse item data:', parseError);
            failedIds.push(item.id);
            continue;
          }
        }

        const { error } = await supabase.from('sync_data').insert({
          user_id: user.userId,
          device_id: deviceId ?? batch.device_id,
          sync_type: item.entity_type,
          data: parsedData,
        });

        if (error) {
          console.error('[Sync] Batch item error:', error);
          failedIds.push(item.id);
        } else {
          syncedIds.push(item.id);
        }
      } catch (err) {
        console.error('[Sync] Batch item exception:', err);
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
  }),
);

// =============================================================================
// GET /updates - Pull updates since timestamp (matches CloudSyncClient.pull_updates)
// SECURITY: Rate limited to 60/min - polling for updates
// =============================================================================
router.get(
  '/updates',
  createRateLimiter('sync-updates'),
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const sinceRaw = req.query['since'];
    const since = typeof sinceRaw === 'string' ? sinceRaw : new Date(0).toISOString();
    const deviceId = req.headers['x-device-id'] as string | undefined;

    // Query sync data from Supabase
    let query = supabase
      .from('sync_data')
      .select('*')
      .eq('user_id', user.userId)
      .gt('created_at', since)
      .order('created_at', { ascending: true });

    // Exclude data from the requesting device (they already have it)
    if (deviceId) {
      query = query.neq('device_id', deviceId);
    }

    const { data: syncData, error } = await query;

    if (error) {
      console.error('[Sync] Updates error:', error);
      throw new AppError('Failed to pull updates', 500);
    }

    // Transform to RemoteUpdate format expected by Rust client
    const updates = (syncData ?? []).map((row, index) => ({
      entity_type: row.sync_type,
      entity_id: row.id, // Using row id as entity_id for now
      action: 'Update' as const, // Default to Update since we don't track action in schema
      data: JSON.stringify(row.data),
      timestamp: row.created_at,
      version: index + 1, // Simple incrementing version
    }));

    res.json(updates);
  }),
);

// =============================================================================
// POST /resolve-conflict - Conflict resolution (matches CloudSyncClient.resolve_conflict)
// SECURITY: Rate limited to 20/min - conflict resolution is rare
// =============================================================================
router.post(
  '/resolve-conflict',
  createRateLimiter('sync-resolve'),
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const resolution = conflictResolutionSchema.parse(req.body);
    const deviceId = req.headers['x-device-id'] as string | undefined;

    // For now, just insert the resolved data as a new entry
    // Full implementation would update existing entry with version check
    const { error } = await supabase.from('sync_data').insert({
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
      console.error('[Sync] Conflict resolution error:', error);
      throw new AppError('Failed to resolve conflict', 500);
    }

    res.json({ success: true });
  }),
);

// =============================================================================
// GET /status - Get sync status (matches CloudSyncClient.get_sync_status)
// SECURITY: Rate limited to 60/min - status checks are lightweight
// =============================================================================
router.get(
  '/status',
  createRateLimiter('sync-status'),
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const _deviceId = req.headers['x-device-id'] as string | undefined;

    // Get counts for this user
    const { count: pendingCount } = await supabase
      .from('sync_data')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.userId);

    // Get last sync timestamp
    const { data: lastSync } = await supabase
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
  }),
);

// =============================================================================
// POST /devices/register - Register device (matches CloudSyncClient.register_device)
// SECURITY: Rate limited to 10/min - device registration
// =============================================================================
router.post(
  '/devices/register',
  createRateLimiter('device-register'),
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const registration = deviceRegistrationSchema.parse(req.body);

    // Store device registration in sync_data as a special type
    // Full implementation would have a dedicated devices table
    const { error } = await supabase.from('sync_data').upsert(
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
      console.error('[Sync] Device registration error:', error);
      throw new AppError('Failed to register device', 500);
    }

    res.json({ success: true });
  }),
);

// =============================================================================
// DELETE /devices/:deviceId - Unregister device (matches CloudSyncClient.unregister_device)
// SECURITY: Rate limited to 10/min - destructive operation
// =============================================================================
router.delete(
  '/devices/:deviceId',
  createRateLimiter('device-delete'),
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const deviceId = req.params['deviceId'];
    if (!deviceId) {
      throw new AppError('Device ID required', 400);
    }

    // Delete device registration and all sync data for this device
    const { error } = await supabase
      .from('sync_data')
      .delete()
      .eq('user_id', user.userId)
      .eq('device_id', deviceId);

    if (error) {
      console.error('[Sync] Device unregistration error:', error);
      throw new AppError('Failed to unregister device', 500);
    }

    res.json({ success: true });
  }),
);

// =============================================================================
// LEGACY ENDPOINTS - Keep for backwards compatibility
// =============================================================================

// SECURITY: .strict() rejects unexpected fields
const legacySyncSchema = z
  .object({
    type: z.string().max(100),
    data: z.record(z.string(), z.any()),
    deviceId: z.string().max(100),
  })
  .strict();

// POST /push - Legacy push endpoint
// SECURITY: Rate limited to 30/min for backwards compatibility
router.post(
  '/push',
  createRateLimiter('sync-legacy'),
  asyncHandler(async (req: Request, res: Response) => {
    const { type, data, deviceId } = legacySyncSchema.parse(req.body);
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const { error } = await supabase.from('sync_data').insert({
      user_id: user.userId,
      device_id: deviceId,
      sync_type: type,
      data: data,
    });

    if (error) {
      console.error('[Sync] Push error:', error);
      throw new AppError('Failed to push sync data', 500);
    }

    res.json({
      success: true,
      timestamp: Date.now(),
    });
  }),
);

// GET /pull - Legacy pull endpoint
// SECURITY: Rate limited to 30/min for backwards compatibility
router.get(
  '/pull',
  createRateLimiter('sync-legacy'),
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const sinceRaw = req.query['since'];
    let since = typeof sinceRaw === 'string' ? Number(sinceRaw) : 0;
    // Validate the timestamp is a valid number
    if (Number.isNaN(since) || since < 0) {
      since = 0;
    }
    const deviceIdParam = req.query['deviceId'];
    const deviceId = typeof deviceIdParam === 'string' ? deviceIdParam : undefined;

    const sinceDate = new Date(since).toISOString();

    let query = supabase
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
      console.error('[Sync] Pull error:', error);
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
  }),
);

// DELETE /clear - Legacy clear endpoint
// SECURITY: Rate limited to 30/min for backwards compatibility (destructive but legacy)
router.delete(
  '/clear',
  createRateLimiter('sync-legacy'),
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const { error } = await supabase.from('sync_data').delete().eq('user_id', user.userId);

    if (error) {
      console.error('[Sync] Clear error:', error);
      throw new AppError('Failed to clear sync data', 500);
    }

    res.json({ success: true });
  }),
);

export { router as syncRouter };

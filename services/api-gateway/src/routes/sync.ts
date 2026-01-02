import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { asyncHandler } from '../middleware/asyncHandler';

const router: Router = Router();

router.use(authenticateToken);

interface SyncData {
  userId: string;
  type: string;
  data: any;
  timestamp: number;
  deviceId: string;
}

// TTL configuration for sync data (1 hour default)
const SYNC_DATA_TTL_MS = Number(process.env['SYNC_DATA_TTL_MS'] ?? 3600000);
// Maximum entries per user to prevent unbounded growth
const MAX_ENTRIES_PER_USER = Number(process.env['SYNC_MAX_ENTRIES_PER_USER'] ?? 1000);
// Cleanup interval (5 minutes)
const CLEANUP_INTERVAL_MS = 300000;

const syncStore = new Map<string, SyncData[]>();

// Periodic cleanup of expired sync data
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  const cutoff = now - SYNC_DATA_TTL_MS;

  for (const [userId, entries] of syncStore.entries()) {
    const validEntries = entries.filter((entry) => entry.timestamp > cutoff);
    if (validEntries.length === 0) {
      syncStore.delete(userId);
    } else if (validEntries.length !== entries.length) {
      syncStore.set(userId, validEntries);
    }
  }
}, CLEANUP_INTERVAL_MS);

// Ensure cleanup interval doesn't prevent process exit
cleanupInterval.unref();

// Helper to add sync data with TTL enforcement and max-size limit
function addSyncData(userId: string, data: SyncData): void {
  const now = Date.now();
  const cutoff = now - SYNC_DATA_TTL_MS;

  // Get existing entries and filter out expired ones
  let entries = syncStore.get(userId) ?? [];
  entries = entries.filter((entry) => entry.timestamp > cutoff);

  // Add new entry
  entries.push(data);

  // Enforce max entries per user (keep most recent)
  if (entries.length > MAX_ENTRIES_PER_USER) {
    entries = entries.slice(-MAX_ENTRIES_PER_USER);
  }

  syncStore.set(userId, entries);
}

const syncSchema = z.object({
  type: z.string(),
  data: z.record(z.string(), z.any()),
  deviceId: z.string(),
});

router.post(
  '/push',
  asyncHandler(async (req: Request, res: Response) => {
    const { type, data, deviceId } = syncSchema.parse(req.body);
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const syncData: SyncData = {
      userId: user.userId,
      type,
      data,
      timestamp: Date.now(),
      deviceId,
    };

    // Use helper that enforces TTL and max-size limits
    addSyncData(user.userId, syncData);

    res.json({
      success: true,
      timestamp: syncData.timestamp,
    });
  }),
);

router.get(
  '/pull',
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const sinceRaw = req.query['since'];
    const since = typeof sinceRaw === 'string' ? Number(sinceRaw) : 0;
    const deviceIdParam = req.query['deviceId'];
    const deviceId = typeof deviceIdParam === 'string' ? deviceIdParam : undefined;

    const userSyncData = syncStore.get(user.userId) || [];
    const filteredData = userSyncData
      .filter((d) => d.timestamp > since && (!deviceId || d.deviceId !== deviceId))
      .sort((a, b) => a.timestamp - b.timestamp);

    res.json({
      data: filteredData,
      timestamp: Date.now(),
    });
  }),
);

router.delete(
  '/clear',
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    syncStore.delete(user.userId);

    res.json({ success: true });
  }),
);

export { router as syncRouter };

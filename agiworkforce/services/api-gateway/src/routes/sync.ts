import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

// Sync data store
interface SyncData {
  userId: string;
  type: string;
  data: any;
  timestamp: number;
  deviceId: string;
}

const syncStore = new Map<string, SyncData[]>();

const syncSchema = z.object({
  type: z.string(),
  data: z.record(z.any()),
  deviceId: z.string(),
});

// Push sync data
router.post('/push', (req, res) => {
  try {
    const { type, data, deviceId } = syncSchema.parse(req.body);
    const userId = (req as any).user.userId;

    const syncData: SyncData = {
      userId,
      type,
      data,
      timestamp: Date.now(),
      deviceId,
    };

    const userSyncData = syncStore.get(userId) || [];
    userSyncData.push(syncData);
    syncStore.set(userId, userSyncData);

    res.json({
      success: true,
      timestamp: syncData.timestamp,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Pull sync data
router.get('/pull', (req, res) => {
  const userId = (req as any).user.userId;
  const since = parseInt(req.query.since as string) || 0;
  const deviceId = req.query.deviceId as string;

  const userSyncData = syncStore.get(userId) || [];
  const filteredData = userSyncData
    .filter((d) => d.timestamp > since && d.deviceId !== deviceId)
    .sort((a, b) => a.timestamp - b.timestamp);

  res.json({
    data: filteredData,
    timestamp: Date.now(),
  });
});

// Clear sync data
router.delete('/clear', (req, res) => {
  const userId = (req as any).user.userId;
  syncStore.delete(userId);

  res.json({ success: true });
});

export { router as syncRouter };

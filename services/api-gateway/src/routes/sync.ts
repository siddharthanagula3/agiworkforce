import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';

const router: Router = Router();

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
router.post('/push', (req: Request, res: Response) => {
  try {
    const { type, data, deviceId } = syncSchema.parse(req.body);
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const syncData: SyncData = {
      userId: user.userId,
      type,
      data,
      timestamp: Date.now(),
      deviceId,
    };

    const userSyncData = syncStore.get(user.userId) || [];
    userSyncData.push(syncData);
    syncStore.set(user.userId, userSyncData);

    return res.json({
      success: true,
      timestamp: syncData.timestamp,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Pull sync data
router.get('/pull', (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sinceRaw = req.query['since'];
  const since = typeof sinceRaw === 'string' ? Number(sinceRaw) : 0;
  const deviceIdParam = req.query['deviceId'];
  const deviceId = typeof deviceIdParam === 'string' ? deviceIdParam : undefined;

  const userSyncData = syncStore.get(user.userId) || [];
  const filteredData = userSyncData
    .filter((d) => d.timestamp > since && (!deviceId || d.deviceId !== deviceId))
    .sort((a, b) => a.timestamp - b.timestamp);

  return res.json({
    data: filteredData,
    timestamp: Date.now(),
  });
});

// Clear sync data
router.delete('/clear', (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  syncStore.delete(user.userId);

  return res.json({ success: true });
});

export { router as syncRouter };

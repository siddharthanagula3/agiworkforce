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

const syncStore = new Map<string, SyncData[]>();

const syncSchema = z.object({
  type: z.string(),
  data: z.record(z.any()),
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

    const userSyncData = syncStore.get(user.userId) || [];
    userSyncData.push(syncData);
    syncStore.set(user.userId, userSyncData);

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

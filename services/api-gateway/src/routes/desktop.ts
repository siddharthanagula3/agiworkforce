import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { authenticateToken } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';

const router: Router = Router();

router.use(authenticateToken);

interface DesktopDevice {
  id: string;
  userId: string;
  name: string;
  platform: string;
  version: string;
  lastSeen: number;
  registeredAt: number;
}

const desktops = new Map<string, DesktopDevice>();

const registerDesktopSchema = z.object({
  name: z.string(),
  platform: z.string(),
  version: z.string(),
});

const commandSchema = z.object({
  type: z.enum(['chat', 'automation', 'query']),
  payload: z.record(z.any()),
});

router.post(
  '/register',
  asyncHandler(async (req: Request, res: Response) => {
    const { name, platform, version } = registerDesktopSchema.parse(req.body);
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const desktopId = randomUUID();
    const desktop: DesktopDevice = {
      id: desktopId,
      userId: user.userId,
      name,
      platform,
      version,
      lastSeen: Date.now(),
      registeredAt: Date.now(),
    };

    desktops.set(desktopId, desktop);

    res.json({
      desktopId,
      message: 'Desktop registered successfully',
    });
  }),
);

router.get('/:desktopId/status', (req: Request<{ desktopId: string }>, res: Response) => {
  const { desktopId } = req.params;
  const desktop = desktops.get(desktopId);

  if (!desktop) {
    throw new AppError('Desktop not found', 404);
  }

  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  if (desktop.userId !== user.userId) {
    throw new AppError('Forbidden', 403);
  }

  const online = Date.now() - desktop.lastSeen < 60000;

  res.json({
    id: desktop.id,
    name: desktop.name,
    platform: desktop.platform,
    version: desktop.version,
    online,
    lastSeen: desktop.lastSeen,
  });
});

router.post(
  '/:desktopId/command',
  asyncHandler(async (req: Request<{ desktopId: string }>, res: Response) => {
    const { desktopId } = req.params;
    const { type, payload } = commandSchema.parse(req.body);

    const desktop = desktops.get(desktopId);
    if (!desktop) {
      throw new AppError('Desktop not found', 404);
    }

    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    if (desktop.userId !== user.userId) {
      throw new AppError('Forbidden', 403);
    }

    res.json({
      commandId: randomUUID(),
      status: 'queued',
      message: 'Command queued for delivery',
      type,
      payload,
    });
  }),
);

router.get('/', (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const userDesktops = Array.from(desktops.values())
    .filter((d) => d.userId === user.userId)
    .map((d) => ({
      id: d.id,
      name: d.name,
      platform: d.platform,
      version: d.version,
      online: Date.now() - d.lastSeen < 60000,
      lastSeen: d.lastSeen,
    }));

  res.json({ desktops: userDesktops });
});

export { router as desktopRouter };

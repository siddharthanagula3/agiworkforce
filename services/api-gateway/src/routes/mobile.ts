import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';

const router: Router = Router();

router.use(authenticateToken);

interface MobileDevice {
  id: string;
  userId: string;
  platform: string;
  name: string;
  pushToken?: string;
  createdAt: number;
  updatedAt: number;
}

const devices = new Map<string, MobileDevice>();

const registerSchema = z.object({
  clientId: z.string().optional(),
  platform: z.string(),
  name: z.string(),
  pushToken: z.string().optional(),
});

const pushTokenSchema = z.object({
  deviceId: z.string(),
  pushToken: z.string(),
});

router.post('/register', (req: Request, res: Response) => {
  try {
    const { clientId, platform, name, pushToken } = registerSchema.parse(req.body);
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const id = clientId ?? randomUUID();
    const device: MobileDevice = {
      id,
      userId: user.userId,
      platform,
      name,
      pushToken,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    devices.set(device.id, device);

    return res.json({ deviceId: device.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/push-token', (req: Request, res: Response) => {
  try {
    const { deviceId, pushToken } = pushTokenSchema.parse(req.body);
    const device = devices.get(deviceId);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    const user = req.user;
    if (!user || device.userId !== user.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    devices.set(deviceId, {
      ...device,
      pushToken,
      updatedAt: Date.now(),
    });

    return res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const result = Array.from(devices.values())
    .filter((device) => device.userId === user.userId)
    .map((device) => ({
      id: device.id,
      name: device.name,
      platform: device.platform,
      pushToken: device.pushToken,
      updatedAt: device.updatedAt,
    }));

  return res.json({ devices: result });
});

export { router as mobileRouter };


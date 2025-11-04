import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';

const router: Router = Router();

router.use(authenticateToken);

const SIGNALING_HTTP_URL = process.env['SIGNALING_HTTP_URL'] ?? 'http://localhost:4000';

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

const pairingCodeRequestSchema = z.object({
  ttlSeconds: z.number().min(30).max(900).optional(),
});

const pairingCodeResponseSchema = z.object({
  code: z.string(),
  expiresAt: z.number(),
  expiresIn: z.number(),
  httpUrl: z.string(),
  wsUrl: z.string(),
  qrData: z.string(),
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
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    if (pushToken !== undefined) {
      device.pushToken = pushToken;
    }

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

router.post('/pairing-code', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parseResult = pairingCodeRequestSchema.safeParse(req.body ?? {});
  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.flatten() });
  }

  const ttlSeconds = parseResult.data.ttlSeconds;

  try {
    const response = await fetch(`${SIGNALING_HTTP_URL.replace(/\/+$/, '')}/pairings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ttlSeconds,
        metadata: {
          userId: user.userId,
          email: user.email,
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(502).json({ error: `Failed to provision pairing: ${text}` });
    }

    const payload = pairingCodeResponseSchema.parse(await response.json());

    return res.json({
      code: payload.code,
      expiresAt: payload.expiresAt,
      expiresIn: payload.expiresIn,
      qrData: payload.qrData,
      signaling: {
        httpUrl: payload.httpUrl,
        wsUrl: payload.wsUrl,
      },
    });
  } catch (error) {
    console.error('Failed to request pairing code from signaling server', error);
    return res.status(500).json({ error: 'Failed to request pairing code' });
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

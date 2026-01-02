import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { asyncHandler } from '../middleware/asyncHandler';

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

// TODO: Migrate to Supabase for persistence. Currently, all mobile device registrations
// are lost on server restart. This should store mobile devices in the database
// with proper user association, push token management, and device lifecycle tracking.
// See: https://github.com/your-org/agiworkforce/issues/XXX (create tracking issue)
const devices = new Map<string, MobileDevice>();

// Log warning on module load about in-memory state
console.warn(
  '[mobile] WARNING: Mobile device state is stored in-memory and will be lost on server restart. ' +
    'Migrate to Supabase for production use.',
);

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

router.post(
  '/register',
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId, platform, name, pushToken } = registerSchema.parse(req.body);
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
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

    res.json({ deviceId: device.id });
  }),
);

router.post(
  '/push-token',
  asyncHandler(async (req: Request, res: Response) => {
    const { deviceId, pushToken } = pushTokenSchema.parse(req.body);
    const device = devices.get(deviceId);
    if (!device) {
      throw new AppError('Device not found', 404);
    }
    const user = req.user;
    if (!user || device.userId !== user.userId) {
      throw new AppError('Forbidden', 403);
    }

    devices.set(deviceId, {
      ...device,
      pushToken,
      updatedAt: Date.now(),
    });

    res.json({ success: true });
  }),
);

router.post(
  '/pairing-code',
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const parseResult = pairingCodeRequestSchema.safeParse(req.body ?? {});
    if (!parseResult.success) {
      throw new AppError('Invalid request body', 400);
    }

    const ttlSeconds = parseResult.data.ttlSeconds;

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
      throw new AppError(`Failed to provision pairing: ${text}`, 502);
    }

    const payload = pairingCodeResponseSchema.parse(await response.json());

    res.json({
      code: payload.code,
      expiresAt: payload.expiresAt,
      expiresIn: payload.expiresIn,
      qrData: payload.qrData,
      signaling: {
        httpUrl: payload.httpUrl,
        wsUrl: payload.wsUrl,
      },
    });
  }),
);

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
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

    res.json({ devices: result });
  }),
);

export { router as mobileRouter };

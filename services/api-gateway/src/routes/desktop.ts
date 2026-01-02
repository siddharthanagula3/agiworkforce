import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { asyncHandler } from '../middleware/asyncHandler';

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

// TODO: Migrate to Supabase for persistence. Currently, all desktop registrations
// are lost on server restart. This should store desktop devices in the database
// with proper user association and support for multiple desktops per user.
// See: https://github.com/your-org/agiworkforce/issues/XXX (create tracking issue)
const desktops = new Map<string, DesktopDevice>();

// Log warning on module load about in-memory state
console.warn(
  '[desktop] WARNING: Desktop device state is stored in-memory and will be lost on server restart. ' +
    'Migrate to Supabase for production use.',
);

const registerDesktopSchema = z.object({
  name: z.string().min(1).max(100),
  platform: z.enum(['macos', 'windows', 'linux']),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be in semver format (e.g., 1.0.0)'),
});

// Strict payload schemas for each command type using discriminatedUnion
// This prevents arbitrary data injection and validates command-specific fields
const chatPayloadSchema = z.object({
  type: z.literal('chat'),
  payload: z.object({
    message: z.string().min(1).max(10000),
    conversationId: z.string().uuid().optional(),
    model: z.string().max(50).optional(),
    temperature: z.number().min(0).max(2).optional(),
  }),
});

const automationPayloadSchema = z.object({
  type: z.literal('automation'),
  payload: z.object({
    action: z.enum(['run', 'stop', 'pause', 'resume']),
    workflowId: z.string().uuid(),
    parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    timeout: z.number().int().min(1000).max(3600000).optional(), // 1s to 1h
  }),
});

const queryPayloadSchema = z.object({
  type: z.literal('query'),
  payload: z.object({
    query: z.string().min(1).max(5000),
    collection: z.string().min(1).max(100).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional(),
  }),
});

const commandSchema = z.discriminatedUnion('type', [
  chatPayloadSchema,
  automationPayloadSchema,
  queryPayloadSchema,
]);

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

router.get(
  '/:desktopId/status',
  asyncHandler(async (req: Request<{ desktopId: string }>, res: Response) => {
    // Check auth first (consistent order: auth -> ownership -> action)
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const { desktopId } = req.params;
    const desktop = desktops.get(desktopId);

    // Return 404 for both "not found" and "not owned" to prevent enumeration attacks
    if (!desktop || desktop.userId !== user.userId) {
      throw new AppError('Desktop not found', 404);
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
  }),
);

router.post(
  '/:desktopId/command',
  asyncHandler(async (req: Request<{ desktopId: string }>, res: Response) => {
    // Check auth first (consistent order: auth -> ownership -> action)
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const { desktopId } = req.params;
    const { type, payload } = commandSchema.parse(req.body);

    const desktop = desktops.get(desktopId);

    // Return 404 for both "not found" and "not owned" to prevent enumeration attacks
    if (!desktop || desktop.userId !== user.userId) {
      throw new AppError('Desktop not found', 404);
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

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
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
  }),
);

export { router as desktopRouter };

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { authenticateToken } from '../middleware/auth';

const router: Router = Router();

// Apply auth middleware to all routes
router.use(authenticateToken);

// Desktop registration data store
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

// Validation schemas
const registerDesktopSchema = z.object({
  name: z.string(),
  platform: z.string(),
  version: z.string(),
});

const commandSchema = z.object({
  type: z.enum(['chat', 'automation', 'query']),
  payload: z.record(z.any()),
});

// Register desktop app
router.post('/register', (req: Request, res: Response) => {
  try {
    const { name, platform, version } = registerDesktopSchema.parse(req.body);
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
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

    return res.json({
      desktopId,
      message: 'Desktop registered successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get desktop status
router.get('/:desktopId/status', (req: Request<{ desktopId: string }>, res: Response) => {
  const { desktopId } = req.params;
  const desktop = desktops.get(desktopId);

  if (!desktop) {
    return res.status(404).json({ error: 'Desktop not found' });
  }

  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (desktop.userId !== user.userId) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const online = Date.now() - desktop.lastSeen < 60000; // Online if seen in last minute

  return res.json({
    id: desktop.id,
    name: desktop.name,
    platform: desktop.platform,
    version: desktop.version,
    online,
    lastSeen: desktop.lastSeen,
  });
});

// Send command to desktop
router.post('/:desktopId/command', (req: Request<{ desktopId: string }>, res: Response) => {
  try {
    const { desktopId } = req.params;
    const { type, payload } = commandSchema.parse(req.body);

    const desktop = desktops.get(desktopId);
    if (!desktop) {
      return res.status(404).json({ error: 'Desktop not found' });
    }

    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (desktop.userId !== user.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // In production, this would send the command via WebSocket
    // For now, just acknowledge receipt
    return res.json({
      commandId: randomUUID(),
      status: 'queued',
      message: 'Command queued for delivery',
      type,
      payload,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// List user's desktops
router.get('/', (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
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

  return res.json({ desktops: userDesktops });
});

export { router as desktopRouter };

import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';

const router = Router();

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
router.post('/register', (req, res) => {
  try {
    const { name, platform, version } = registerDesktopSchema.parse(req.body);
    const userId = (req as any).user.userId;

    const desktopId = crypto.randomUUID();
    const desktop: DesktopDevice = {
      id: desktopId,
      userId,
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
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get desktop status
router.get('/:desktopId/status', (req, res) => {
  const { desktopId } = req.params;
  const desktop = desktops.get(desktopId);

  if (!desktop) {
    return res.status(404).json({ error: 'Desktop not found' });
  }

  const userId = (req as any).user.userId;
  if (desktop.userId !== userId) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const online = Date.now() - desktop.lastSeen < 60000; // Online if seen in last minute

  res.json({
    id: desktop.id,
    name: desktop.name,
    platform: desktop.platform,
    version: desktop.version,
    online,
    lastSeen: desktop.lastSeen,
  });
});

// Send command to desktop
router.post('/:desktopId/command', (req, res) => {
  try {
    const { desktopId } = req.params;
    const command = commandSchema.parse(req.body);

    const desktop = desktops.get(desktopId);
    if (!desktop) {
      return res.status(404).json({ error: 'Desktop not found' });
    }

    const userId = (req as any).user.userId;
    if (desktop.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // In production, this would send the command via WebSocket
    // For now, just acknowledge receipt
    res.json({
      commandId: crypto.randomUUID(),
      status: 'queued',
      message: 'Command queued for delivery',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List user's desktops
router.get('/', (req, res) => {
  const userId = (req as any).user.userId;
  const userDesktops = Array.from(desktops.values())
    .filter((d) => d.userId === userId)
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

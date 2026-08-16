
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { getUserScopedClient } from '../lib/neonClients';
import { createRateLimiter } from '../middleware/rateLimit';
import { logger } from '../lib/logger';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';

const router: Router = Router();

router.use(authenticateToken);
router.use(createRateLimiter('default'));

const SIGNALING_HTTP_URL = process.env['SIGNALING_HTTP_URL'] ?? 'http://localhost:4000';
const SIGNALING_INTERNAL_SECRET = process.env['SIGNALING_INTERNAL_SECRET'];

const initiateSchema = z
  .object({
    desktopId: z.string().uuid().optional(),
    ttlSeconds: z.number().int().min(30).max(900).optional(),
    initiator: z.enum(['desktop', 'mobile']).optional(),
  })
  .strict();

const confirmSchema = z
  .object({
    code: z.string().min(1).max(20),
    desktopId: z.string().uuid(),
  })
  .strict();

const pairingCodeResponseSchema = z.object({
  code: z.string(),
  expiresAt: z.number(),
  expiresIn: z.number(),
  httpUrl: z.string(),
  wsUrl: z.string(),
  qrData: z.string(),
  pairTokens: z.object({
    desktop: z.string(),
    mobile: z.string(),
  }),
});

function buildPairingQrData(code: string, pairToken: string): string {
  return `agiw:${code}:${pairToken}`;
}

router.post('/initiate', createRateLimiter('pairing-code'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const { desktopId, ttlSeconds, initiator = 'mobile' } = initiateSchema.parse(req.body ?? {});

  logger.info(
    { userId: user.userId, desktopId, ttlSeconds },
    'Pairing initiation requested from mobile',
  );

  if (!SIGNALING_INTERNAL_SECRET) {
    throw new AppError('Signaling pairing is not configured', 503);
  }

  let fetchResponse: globalThis.Response;
  try {
    fetchResponse = await fetchWithTimeout(`${SIGNALING_HTTP_URL.replace(/\/+$/, '')}/pairings`, {
      method: 'POST',
      timeoutMs: 10_000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SIGNALING_INTERNAL_SECRET}`,
      },
      body: JSON.stringify({
        ttlSeconds: ttlSeconds ?? 300,
        metadata: {
          userId: user.userId,
          email: user.email,
          desktopId: desktopId ?? null,
          initiator,
        },
      }),
    });
  } catch (fetchError) {
    logger.error({ error: fetchError }, 'Failed to connect to signaling server');
    throw new AppError('Signaling server unavailable', 503);
  }

  if (!fetchResponse.ok) {
    let errorText: string;
    try {
      errorText = await fetchResponse.text();
    } catch {
      errorText = 'Unknown error';
    }
    throw new AppError(`Failed to create pairing session: ${errorText}`, 502);
  }

  let jsonBody: unknown;
  try {
    jsonBody = await fetchResponse.json();
  } catch (parseError) {
    logger.error({ error: parseError }, 'Failed to parse signaling server response');
    throw new AppError('Invalid response from signaling server', 502);
  }

  const payload = pairingCodeResponseSchema.parse(jsonBody);

  res.json({
    code: payload.code,
    expiresAt: payload.expiresAt,
    expiresIn: payload.expiresIn,
    qrData: buildPairingQrData(
      payload.code,
      initiator === 'desktop' ? payload.pairTokens.mobile : payload.pairTokens.desktop,
    ),
    signaling: {
      httpUrl: payload.httpUrl,
      wsUrl: payload.wsUrl,
    },
    pairTokens: payload.pairTokens,
  });
});

router.post('/confirm', createRateLimiter('pairing-code'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const { code, desktopId } = confirmSchema.parse(req.body);

  logger.info({ userId: user.userId, desktopId, code }, 'Pairing confirmation from desktop');

  const userDb = getUserScopedClient(user);

  const { data: desktop, error: desktopError } = await userDb
    .from('desktop_devices')
    .select('id, user_id')
    .eq('id', desktopId)
    .single();

  if (desktopError || !desktop) {
    throw new AppError('Desktop not found', 404);
  }

  if (desktop.user_id !== user.userId) {
    throw new AppError('Desktop not found', 404);
  }

  let lookupResponse: globalThis.Response;
  try {
    lookupResponse = await fetchWithTimeout(
      `${SIGNALING_HTTP_URL.replace(/\/+$/, '')}/pairings/${encodeURIComponent(code)}`,
      { timeoutMs: 8_000 },
    );
  } catch (fetchError) {
    logger.error({ error: fetchError }, 'Failed to connect to signaling server');
    throw new AppError('Signaling server unavailable', 503);
  }

  if (lookupResponse.status === 404) {
    throw new AppError('Pairing code not found or expired', 404);
  }

  if (lookupResponse.status === 410) {
    throw new AppError('Pairing code has expired', 410);
  }

  if (!lookupResponse.ok) {
    throw new AppError('Failed to verify pairing code', 502);
  }

  res.json({
    code,
    desktopId,
    status: 'confirmed',
    message:
      'Pairing confirmed. Connect to the signaling server WebSocket to complete the handshake.',
    signaling: {
      httpUrl: SIGNALING_HTTP_URL,
      wsUrl: SIGNALING_HTTP_URL.replace(/^http/, 'ws') + '/ws',
    },
  });
});

router.get('/status', createRateLimiter('device-status'), async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const code = typeof req.query['code'] === 'string' ? req.query['code'] : undefined;
  if (!code) {
    throw new AppError('code query parameter is required', 400);
  }

  let lookupResponse: globalThis.Response;
  try {
    lookupResponse = await fetchWithTimeout(
      `${SIGNALING_HTTP_URL.replace(/\/+$/, '')}/pairings/${encodeURIComponent(code)}`,
      { timeoutMs: 8_000 },
    );
  } catch (fetchError) {
    logger.error({ error: fetchError }, 'Failed to connect to signaling server');
    throw new AppError('Signaling server unavailable', 503);
  }

  if (lookupResponse.status === 404) {
    res.json({ code, status: 'not_found' });
    return;
  }

  if (lookupResponse.status === 410) {
    res.json({ code, status: 'expired' });
    return;
  }

  if (!lookupResponse.ok) {
    throw new AppError('Failed to check pairing status', 502);
  }

  const body = (await lookupResponse.json()) as {
    code: string;
    expiresAt: number;
    roles?: { desktop?: boolean; mobile?: boolean };
  };

  res.json({
    code: body.code,
    expiresAt: body.expiresAt,
    status: body.roles?.desktop && body.roles?.mobile ? 'paired' : 'waiting',
    roles: body.roles ?? { desktop: false, mobile: false },
  });
});

router.delete(
  '/cancel',
  createRateLimiter('device-delete'),
  async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const code = typeof req.query['code'] === 'string' ? req.query['code'] : undefined;
    if (!code) {
      throw new AppError('code query parameter is required', 400);
    }

    if (!SIGNALING_INTERNAL_SECRET) {
      throw new AppError('Signaling pairing is not configured', 503);
    }

    let deleteResponse: globalThis.Response;
    try {
      deleteResponse = await fetchWithTimeout(
        `${SIGNALING_HTTP_URL.replace(/\/+$/, '')}/pairings/${encodeURIComponent(code)}`,
        {
          method: 'DELETE',
          timeoutMs: 10_000,
          headers: {
            Authorization: `Bearer ${SIGNALING_INTERNAL_SECRET}`,
          },
        },
      );
    } catch (fetchError) {
      logger.error({ error: fetchError }, 'Failed to delete from signaling server');
      throw new AppError('Signaling server unavailable', 503);
    }

    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      throw new AppError('Failed to cancel pairing session', 502);
    }

    res.json({ code, status: 'cancelled' });
  },
);

export { router as pairRouter };

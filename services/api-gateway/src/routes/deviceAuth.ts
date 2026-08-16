import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { verifyToken } from '@clerk/backend';
import { z } from 'zod';
import { requireEnv } from '../env';
import { getSystemClient } from '../lib/neonClients';
import { createRateLimiter } from '../middleware/rateLimit';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../lib/logger';

const db = getSystemClient('device-authorization');

const router: Router = Router();

router.use(createRateLimiter('default'));

const JWT_SECRET = requireEnv('JWT_SECRET');
const DEVICE_AUTH_TABLE = 'device_authorization_codes';

const DEVICE_CODE_EXPIRES_SECONDS = 900;
const POLL_INTERVAL_SECONDS = 5;
const ACCESS_TOKEN_EXPIRES_SECONDS = 604800;

const tokenPollSchema = z.object({
  device_code: z.string().uuid(),
});

/**
 * Generate a human-readable user code formatted as XXXX-XXXX.
 * Uses uppercase alphanumeric characters, excluding ambiguous ones (0/O, 1/I/L)
 * for readability when displayed on screen or read aloud.
 */
function generateUserCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const len = alphabet.length;
  const limit = 256 - (256 % len);
  let code = '';
  while (code.length < 8) {
    const bytes = crypto.randomBytes(8 - code.length + 4);
    for (let i = 0; i < bytes.length && code.length < 8; i++) {
      if (bytes[i]! < limit) {
        code += alphabet[bytes[i]! % len];
      }
    }
  }
  return `${code.slice(0, 4)}-${code.slice(4, 8)}`;
}

router.post('/code', createRateLimiter('device-register'), async (_req: Request, res: Response) => {
  const deviceCode = crypto.randomUUID();
  const userCode = generateUserCode();
  const expiresAt = new Date(Date.now() + DEVICE_CODE_EXPIRES_SECONDS * 1000).toISOString();

  const { error } = await db.from(DEVICE_AUTH_TABLE).insert({
    device_id: deviceCode,
    device_name: 'AGI CLI',
    device_type: 'cli',
    user_code: userCode,
    expires_at: expiresAt,
    status: 'pending',
    user_id: null,
    user_email: null,
    user_name: null,
    access_token: null,
    refresh_token: null,
    authorized_at: null,
    consumed_at: null,
    denied_at: null,
    revoked_at: null,
  });

  if (error) {
    throw new AppError('Failed to create device code', 500);
  }

  res.json({
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: 'https://agiworkforce.com/auth/device',
    interval: POLL_INTERVAL_SECONDS,
    expires_in: DEVICE_CODE_EXPIRES_SECONDS,
  });
});

router.post('/token', createRateLimiter('device-register'), async (req: Request, res: Response) => {
  const { device_code: deviceCode } = tokenPollSchema.parse(req.body);

  const { data: record, error } = await db
    .from(DEVICE_AUTH_TABLE)
    .select('device_id, expires_at, status, user_id, user_email')
    .eq('device_id', deviceCode)
    .single();

  if (error || !record) {
    throw new AppError('Invalid device code', 400);
  }

  const expiresAt = new Date(record.expires_at as string).getTime();
  if (Date.now() > expiresAt) {
    await db
      .from(DEVICE_AUTH_TABLE)
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('device_id', deviceCode);
    res.status(400).json({ error: 'expired_token' });
    return;
  }

  if (record.status === 'denied' || record.status === 'revoked') {
    res.status(400).json({ error: 'access_denied' });
    return;
  }

  if (record.status === 'consumed') {
    res.status(400).json({ error: 'expired_token' });
    return;
  }

  if (record.status !== 'approved' || !record.user_id) {
    res.status(403).json({ error: 'authorization_pending' });
    return;
  }

  const userId = record.user_id as string;
  let email = typeof record.user_email === 'string' ? record.user_email : '';

  const { data: user } = await db
    .from('profiles')
    .select('id, email')
    .eq('id', userId)
    .maybeSingle();

  if (user && typeof user.email === 'string') {
    email = user.email;
  }

  const accessToken = jwt.sign({ userId, email, sub: userId, surface: 'developer' }, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES_SECONDS,
    issuer: 'agiworkforce-api-gateway',
    audience: 'agiworkforce',
    jwtid: crypto.randomUUID(),
  });

  const consumedAt = new Date().toISOString();
  await db
    .from(DEVICE_AUTH_TABLE)
    .update({ status: 'consumed', consumed_at: consumedAt, updated_at: consumedAt })
    .eq('device_id', deviceCode);

  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_EXPIRES_SECONDS,
  });
});

const approveSchema = z.object({
  user_code: z.string().regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/, 'Invalid user code format'),
});

router.post(
  '/approve',
  createRateLimiter('device-register'),
  async (req: Request, res: Response) => {
    const parts = req.headers.authorization?.split(' ');
    const accessToken =
      parts?.length === 2 && parts[0].toLowerCase() === 'bearer' ? parts[1] : undefined;

    if (!accessToken) {
      throw new AppError('No auth token provided', 401);
    }

    let userId: string;
    let userEmail: string | null = null;
    try {
      const claims = await verifyToken(accessToken, { secretKey: requireEnv('CLERK_SECRET_KEY') });
      if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
        throw new Error('Clerk token missing subject');
      }
      userId = claims.sub;
      userEmail =
        typeof (claims as Record<string, unknown>)['email'] === 'string'
          ? ((claims as Record<string, unknown>)['email'] as string)
          : null;
    } catch (error) {
      logger.warn({ error }, 'Device approve: invalid Clerk token');
      throw new AppError('Invalid or expired auth token', 401);
    }

    const { user_code: userCode } = approveSchema.parse(req.body);

    const { data: record, error: lookupError } = await db
      .from(DEVICE_AUTH_TABLE)
      .select('device_id, expires_at, status')
      .eq('user_code', userCode)
      .eq('status', 'pending')
      .single();

    if (lookupError || !record) {
      throw new AppError('Code not found or expired. Check your CLI and try again.', 404);
    }

    const expiresAt = new Date(record.expires_at as string).getTime();
    if (Date.now() > expiresAt) {
      await db
        .from(DEVICE_AUTH_TABLE)
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('device_id', record.device_id as string);
      throw new AppError('Code has expired. Please run the login command again.', 404);
    }

    const authorizedAt = new Date().toISOString();
    const { error: updateError } = await db
      .from(DEVICE_AUTH_TABLE)
      .update({
        status: 'approved',
        user_id: userId,
        user_email: userEmail,
        authorized_at: authorizedAt,
        updated_at: authorizedAt,
      })
      .eq('device_id', record.device_id as string)
      .eq('status', 'pending');

    if (updateError) {
      logger.error({ error: updateError.message }, 'Device approve: failed to update record');
      throw new AppError('Failed to approve device code', 500);
    }

    res.json({ approved: true });
  },
);

export { router as deviceAuthRouter };

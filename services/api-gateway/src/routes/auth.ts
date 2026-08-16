import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { createRateLimiter } from '../middleware/rateLimit';
import { authenticatedUserSchema } from '../authenticated-user';
import { requireEnv } from '../env';
import { AppError } from '../middleware/errorHandler';
import { authenticateToken, evictRevocationCache } from '../middleware/auth';
import { getUserScopedClient } from '../lib/neonClients';
import { logger } from '../lib/logger';

const router: Router = Router();

router.use(createRateLimiter('default'));

const JWT_SECRET = requireEnv('JWT_SECRET');

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env['NODE_ENV'] === 'test' ? 1000 : 5,
  message: { error: 'Too many authentication attempts, please try again after 15 minutes' },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

const RETIRED_AUTH_BODY = {
  error: 'Endpoint retired. Use the device-code flow.',
  code: 'AUTH_RETIRED',
  next: {
    code: 'POST /api/v1/auth/device/code',
    token: 'POST /api/v1/auth/device/token',
    approve: 'POST /api/v1/auth/device/approve',
  },
} as const;

router.post('/register', authRateLimiter, (_req: Request, res: Response) => {
  res.status(501).json(RETIRED_AUTH_BODY);
});

router.post('/login', authRateLimiter, (_req: Request, res: Response) => {
  res.status(501).json(RETIRED_AUTH_BODY);
});

router.post('/logout', authRateLimiter, authenticateToken, async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const parts = authHeader?.split(' ');
  const token = parts?.length === 2 && parts[0].toLowerCase() === 'bearer' ? parts[1] : undefined;
  if (!token) {
    throw new AppError('No token provided', 401);
  }

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'agiworkforce-api-gateway',
      audience: 'agiworkforce',
    }) as jwt.JwtPayload;
  } catch {
    throw new AppError('Invalid token', 401);
  }

  const jti = typeof payload.jti === 'string' ? payload.jti : null;
  const exp = typeof payload.exp === 'number' ? payload.exp : null;
  const user = req.user;
  const userId = user?.userId;

  if (!jti || !exp || !user) {
    logger.info({ userId }, 'Logout for legacy token without jti — no revocation possible');
    return res.json({ ok: true, revoked: false });
  }

  const untilExp = new Date(exp * 1000).toISOString();
  const { error } = await getUserScopedClient(user)
    .from('revoked_jwts')
    .insert({ jti, user_id: userId, until_exp: untilExp, reason: 'sign_out' });

  if (error) {
    if (!error.message?.includes('duplicate key')) {
      logger.error({ error, userId }, 'Failed to revoke JWT on logout');
      throw new AppError('Logout failed', 500);
    }
  }

  evictRevocationCache(jti);

  return res.json({ ok: true, revoked: true });
});

router.get('/verify', authRateLimiter, async (req: Request, res: Response) => {
  const parts = req.headers.authorization?.split(' ');
  const token = parts?.length === 2 && parts[0].toLowerCase() === 'bearer' ? parts[1] : undefined;
  if (!token) {
    throw new AppError('No token provided', 401);
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'agiworkforce-api-gateway',
      audience: 'agiworkforce',
    });
    const user = authenticatedUserSchema.parse(payload);
    res.json({ valid: true, userId: user.userId, email: user.email });
  } catch {
    throw new AppError('Invalid token', 401);
  }
});

export { router as authRouter };

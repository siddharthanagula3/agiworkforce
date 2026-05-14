import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { authenticatedUserSchema } from '../authenticated-user';
import { requireEnv } from '../env';
import { AppError } from '../middleware/errorHandler';
import { authenticateToken } from '../middleware/auth';
import { getServiceClient } from '../lib/supabaseClients';
import { logger } from '../lib/logger';

const router: Router = Router();

const JWT_SECRET = requireEnv('JWT_SECRET');

// Rate limiting for auth endpoints: 5 attempts per 15 minute window
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  // In test environments the entire test suite shares a single in-process rate-limiter
  // instance, so raise the ceiling high enough that sequential tests never hit the limit.
  max: process.env['NODE_ENV'] === 'test' ? 1000 : 5,
  message: { error: 'Too many authentication attempts, please try again after 15 minutes' },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// =============================================================================
// /register and /login retired (Wave 1.5+ task #17, 2026-05-08).
//
// The legacy handlers targeted a `public.users` table that does not exist
// in production. The canonical user table is `public.profiles`, password
// hashing lives in `auth.users` via Supabase Auth, and `password_hash`
// + `desktop_id` columns don't exist on either — so a column rename
// would only have masked the bug.
//
// Canonical login flow is the device-code path in routes/deviceAuth.ts.
// We return 501 + a `next` link rather than deleting the routes entirely
// so existing clients hitting these paths get a structured error and a
// pointer to the right endpoint instead of a generic 404.
// =============================================================================

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

// SECURITY (H7, redteam-services 2026-05-04): explicit logout that revokes the
// presented token. POST /auth/logout requires a valid JWT. The token's `jti`
// and `exp` are written to public.revoked_jwts and the kill-switch middleware
// rejects further requests carrying that jti.
router.post('/logout', authenticateToken, async (req: Request, res: Response) => {
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
  const userId = req.user?.userId;

  if (!jti || !exp || !userId) {
    // Token without jti is from before the fix — we cannot revoke it
    // individually. Treat as a successful no-op so clients don't loop.
    logger.info({ userId }, 'Logout for legacy token without jti — no revocation possible');
    return res.json({ ok: true, revoked: false });
  }

  const untilExp = new Date(exp * 1000).toISOString();
  // Wave 1.5+ singleton sweep: revoked_jwts is a security table; inserts
  // bypass user-RLS by design (the policy only allows service-role writes).
  const { error } = await getServiceClient()
    .from('revoked_jwts')
    .insert({ jti, user_id: userId, until_exp: untilExp, reason: 'sign_out' });

  if (error) {
    // Idempotent: duplicate-key is fine (already revoked).
    if (!error.message?.includes('duplicate key')) {
      logger.error({ error, userId }, 'Failed to revoke JWT on logout');
      throw new AppError('Logout failed', 500);
    }
  }

  return res.json({ ok: true, revoked: true });
});

router.get('/verify', authRateLimiter, async (req: Request, res: Response) => {
  // SECURITY: Properly parse the Authorization header instead of simple string replace.
  // Validates the 'Bearer <token>' format case-insensitively and handles edge cases.
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

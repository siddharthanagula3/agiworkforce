import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authenticatedUserSchema } from '../authenticated-user';
import { requireEnv } from '../env';
import { AppError } from '../middleware/errorHandler';
import { authenticateToken } from '../middleware/auth';
import { logger } from '../lib/logger';

const router: Router = Router();

const JWT_SECRET = requireEnv('JWT_SECRET');
// SECURITY (H7, redteam-services 2026-05-04): JWT lifetime reduced from 7d.
// Default 1h with refresh-token flow (planned). Until refresh tokens land,
// allow operators to override via env to manage rollout (was previously 7d
// hardcoded — a stolen token had a full week of validity with no revocation).
//
// Cast: @types/jsonwebtoken v9 typed `expiresIn` as a template-literal
// `StringValue` from `ms` (e.g. '1h', '7d') — env-sourced strings need an
// explicit cast since they're widened to `string` at the type level.
const JWT_EXPIRES_IN = (process.env['JWT_EXPIRES_IN'] ?? '1h') as SignOptions['expiresIn'];

import { supabase } from '../lib/supabase';

// Dummy hash for timing attack prevention - generated with bcrypt.hash('dummy', 10)
// This ensures we always run bcrypt.compare even when user doesn't exist,
// preventing timing-based user enumeration attacks
const DUMMY_PASSWORD_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

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

// DB User interface
interface DbUser {
  id: string;
  email: string;
  password_hash: string;
  desktop_id: string | null;
  created_at: number;
}

// Zod v4: Use top-level format validators for better performance
const registerSchema = z.object({
  email: z.email(),
  // SECURITY: max(128) prevents BCrypt's 72-byte truncation from silently
  // weakening passwords that users believe are stronger than they actually are.
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string(),
});

// =============================================================================
// FIXME(P1-services-dead-routes, Wave 1 task #10 cleanup, 2026-05-08):
//
// The /register and /login routes below target a `public.users` table
// that DOES NOT exist in production (verified via mcp__supabase
// introspection). The canonical user table is `public.profiles` and
// password hashing lives in `auth.users` via Supabase Auth. The
// columns these handlers reference (`password_hash`, `desktop_id`)
// don't exist on `profiles` either, so renaming `from('users')` to
// `from('profiles')` would only mask the bug.
//
// Live auth path is the device-auth flow in routes/deviceAuth.ts. The
// `/register` and `/login` endpoints are effectively dead; any client
// that calls them gets a 500 from a missing-table error and falls
// back to the device-auth flow.
//
// Remediation owner: separate Wave 1.5+ ticket. Options are (a) delete
// these routes entirely and have clients use Supabase Auth directly,
// (b) re-implement on top of Supabase Auth Admin API, or (c) replace
// with 501-Not-Implemented stubs that point clients at /auth/device.
// The decision is product-shaped, not infra, so it's out of scope for
// task #10 (services RLS + model-id work).
//
// The from('users') calls in this file are LEFT IN PLACE on purpose:
// they fail loudly today (table-missing 500), which is the diagnostic
// signal we want until the route is properly retired. Renaming them
// to from('profiles') would silently flip the error to "column
// password_hash does not exist", obscuring the underlying issue.
// =============================================================================

router.post('/register', authRateLimiter, async (req: Request, res: Response) => {
  const { email, password } = registerSchema.parse(req.body);

  // Check if user exists
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  if (existingUser) {
    throw new AppError('User already exists', 400);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  // Note: DB generates UUID via gen_random_uuid(), we get it from the insert response

  const { data: newUser, error } = await supabase
    .from('users')
    .insert({
      email,
      password_hash: passwordHash,
      created_at: Date.now(),
    })
    .select()
    .single();

  if (error || !newUser) {
    throw new AppError('Failed to create user', 500);
  }

  const user = newUser as DbUser; // Type assertion since we defined interface locally matching DB

  // SECURITY (H7): include `jti` so this specific token can be revoked
  // independently of the user's account state. The middleware checks
  // `revoked_jwts` on every request.
  const token = jwt.sign({ userId: user.id, email }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'agiworkforce-api-gateway',
    audience: 'agiworkforce',
    jwtid: randomUUID(),
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
    },
  });
});

router.post('/login', authRateLimiter, async (req: Request, res: Response) => {
  const { email, password } = loginSchema.parse(req.body);

  const { data: userRecord } = await supabase.from('users').select('*').eq('email', email).single();

  // Always run bcrypt.compare to prevent timing attacks that could reveal user existence
  // Use dummy hash when user doesn't exist so timing is consistent
  const hashToCompare = userRecord ? (userRecord as DbUser).password_hash : DUMMY_PASSWORD_HASH;
  const isValid = await bcrypt.compare(password, hashToCompare);

  // Check both conditions after bcrypt to maintain consistent timing
  if (!userRecord || !isValid) {
    throw new AppError('Invalid credentials', 401);
  }

  // safe cast (we know userRecord exists at this point)
  const user = userRecord as DbUser;

  // SECURITY (H7): include `jti` so this specific token can be revoked
  // independently of the user's account state. The middleware checks
  // `revoked_jwts` on every request.
  const token = jwt.sign({ userId: user.id, email }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'agiworkforce-api-gateway',
    audience: 'agiworkforce',
    jwtid: randomUUID(),
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      desktopId: user.desktop_id ?? undefined,
    },
  });
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
  const { error } = await supabase
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

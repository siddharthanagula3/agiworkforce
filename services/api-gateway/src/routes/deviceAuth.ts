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

// The device-code flow starts before the CLI has a cloud account token.
// Server-side Neon access is the correct boundary for code creation and
// post-approval lookups; /approve validates the browser's Clerk bearer token.
const db = getSystemClient('device-authorization');

const router: Router = Router();

const JWT_SECRET = requireEnv('JWT_SECRET');
const DEVICE_AUTH_TABLE = 'device_authorization_codes';

// Device code expires after 15 minutes
const DEVICE_CODE_EXPIRES_SECONDS = 900;
// CLI polls every 5 seconds
const POLL_INTERVAL_SECONDS = 5;
// Access token valid for 7 days (matches auth.ts JWT_EXPIRES_IN)
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
  const len = alphabet.length; // 31
  // Rejection sampling: discard byte values that cause modulo bias.
  // The largest multiple of 31 that fits in a byte is 248 (31*8).
  const limit = 256 - (256 % len); // 248
  let code = '';
  while (code.length < 8) {
    const bytes = crypto.randomBytes(8 - code.length + 4); // over-provision to reduce loops
    for (let i = 0; i < bytes.length && code.length < 8; i++) {
      if (bytes[i]! < limit) {
        code += alphabet[bytes[i]! % len];
      }
    }
  }
  return `${code.slice(0, 4)}-${code.slice(4, 8)}`;
}

/**
 * POST /auth/device/code
 *
 * Initiates the device code flow. The CLI calls this to get a device_code
 * (for polling) and a user_code (displayed to the user to enter in the browser).
 *
 * Response: { device_code, user_code, verification_uri, interval, expires_in }
 */
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

/**
 * POST /auth/device/token
 *
 * Polls for authorization. The CLI calls this repeatedly until the user
 * approves the device code in the browser.
 *
 * - 403 { error: "authorization_pending" } — user hasn't approved yet
 * - 400 { error: "expired_token" }         — device code has expired
 * - 200 { access_token, token_type, expires_in } — approved
 */
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

  // Check expiration
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

  // Check approval status
  if (record.status !== 'approved' || !record.user_id) {
    res.status(403).json({ error: 'authorization_pending' });
    return;
  }

  const userId = record.user_id as string;
  let email = typeof record.user_email === 'string' ? record.user_email : '';

  // Approved — enrich the JWT payload with profile email when it exists, but
  // don't make device login depend on a best-effort profile sync row.
  const { data: user } = await db
    .from('profiles')
    .select('id, email')
    .eq('id', userId)
    .maybeSingle();

  if (user && typeof user.email === 'string') {
    email = user.email;
  }

  // SECURITY (P1-GW-REVOKE): mint a unique `jti` into every gateway token so
  // per-token revocation and /auth/logout actually work. Without it the
  // revocation check in middleware/auth.ts is a no-op (no jti to look up) and
  // logout bails to `{ revoked: false }`. `jwtid` sets the standard `jti`
  // claim that the revocation path + revoked_jwts table key on.
  //
  // SECURITY (P1-GW-RLS): also mint the standard `sub` claim (additive —
  // existing claims/consumers are unchanged, so pre-existing tokens keep
  // verifying fine, they just lack `sub` until they're replaced). data-layer's
  // NeonDatabaseAdapter.withUser(token) (used by the user-scoped database client in
  // lib/neonClients.ts) decodes `sub` from the token to bind Postgres RLS —
  // without it, requests authenticated via a device-paired gateway token
  // would fail closed and require the device to authenticate again.
  //
  // Tokens minted before 2026-07-09 lack `sub`. They remain signature-valid,
  // but database-backed user routes now fail closed and require reauth rather
  // than retrying with the privileged system connection.
  // `surface: 'developer'` marks this as a device-authorization credential
  // (CLI/IDE). The managed plan gate reads it as the TRUSTED developer-surface
  // class so managed developer access requires Pro or higher. Local/BYOK use of
  // this identity token is unaffected because it never reaches a managed gate.
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

/**
 * POST /auth/device/approve
 *
 * Called by the web app when the user submits the device code.
 * Requires a Clerk bearer token in the Authorization header.
 *
 * - 200 { approved: true }                          — success
 * - 401 { error: "..." }                            — missing or invalid auth token
 * - 404 { error: "Code not found or expired..." }   — no matching pending code
 */
router.post(
  '/approve',
  createRateLimiter('device-register'),
  async (req: Request, res: Response) => {
    // --- Authenticate via Clerk token ---
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

    // --- Validate body ---
    const { user_code: userCode } = approveSchema.parse(req.body);

    // --- Look up the pending device code ---
    const { data: record, error: lookupError } = await db
      .from(DEVICE_AUTH_TABLE)
      .select('device_id, expires_at, status')
      .eq('user_code', userCode)
      .eq('status', 'pending')
      .single();

    if (lookupError || !record) {
      throw new AppError('Code not found or expired. Check your CLI and try again.', 404);
    }

    // Verify not expired
    const expiresAt = new Date(record.expires_at as string).getTime();
    if (Date.now() > expiresAt) {
      await db
        .from(DEVICE_AUTH_TABLE)
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('device_id', record.device_id as string);
      throw new AppError('Code has expired. Please run the login command again.', 404);
    }

    // --- Approve ---
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

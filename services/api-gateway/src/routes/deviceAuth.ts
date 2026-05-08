import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireEnv } from '../env';
import { supabase } from '../lib/supabase';
import { createRateLimiter } from '../middleware/rateLimit';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../lib/logger';

const router: Router = Router();

const JWT_SECRET = requireEnv('JWT_SECRET');

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

  const { error } = await supabase.from('device_codes').insert({
    device_code: deviceCode,
    user_code: userCode,
    expires_at: expiresAt,
    status: 'pending',
    user_id: null,
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

  const { data: record, error } = await supabase
    .from('device_codes')
    .select('*')
    .eq('device_code', deviceCode)
    .single();

  if (error || !record) {
    throw new AppError('Invalid device code', 400);
  }

  // Check expiration
  const expiresAt = new Date(record.expires_at as string).getTime();
  if (Date.now() > expiresAt) {
    // Clean up expired code
    await supabase.from('device_codes').delete().eq('device_code', deviceCode);
    res.status(400).json({ error: 'expired_token' });
    return;
  }

  // Check approval status
  if (record.status !== 'approved' || !record.user_id) {
    res.status(403).json({ error: 'authorization_pending' });
    return;
  }

  // Approved — fetch user email for JWT payload.
  // Wave 1 task #10 cleanup (2026-05-08): `public.users` does not exist
  // in production; the canonical user table is `public.profiles` per the
  // billing-layer foundation migration (20260506120001). Both columns
  // referenced here (`id`, `email`) live on profiles; the rename is a
  // straight column-set match. Verified via mcp__supabase introspection.
  const { data: user, error: userError } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('id', record.user_id)
    .single();

  if (userError || !user) {
    throw new AppError('User not found', 500);
  }

  const accessToken = jwt.sign(
    { userId: user.id as string, email: user.email as string },
    JWT_SECRET,
    {
      expiresIn: ACCESS_TOKEN_EXPIRES_SECONDS,
      issuer: 'agiworkforce-api-gateway',
      audience: 'agiworkforce',
    },
  );

  // Clean up used device code
  await supabase.from('device_codes').delete().eq('device_code', deviceCode);

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
 * Requires a Supabase auth token in the Authorization header (sent by the
 * browser client, NOT an API gateway JWT).
 *
 * - 200 { approved: true }                          — success
 * - 401 { error: "..." }                            — missing or invalid auth token
 * - 404 { error: "Code not found or expired..." }   — no matching pending code
 */
router.post(
  '/approve',
  createRateLimiter('device-register'),
  async (req: Request, res: Response) => {
    // --- Authenticate via Supabase token ---
    const parts = req.headers.authorization?.split(' ');
    const accessToken =
      parts?.length === 2 && parts[0].toLowerCase() === 'bearer' ? parts[1] : undefined;

    if (!accessToken) {
      throw new AppError('No auth token provided', 401);
    }

    // Verify the Supabase JWT by creating a client scoped to the user's token.
    // This calls Supabase's getUser() which validates the JWT server-side.
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const supabaseAnonKey = requireEnv('SUPABASE_ANON_KEY');
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      logger.warn({ error: userError?.message }, 'Device approve: invalid Supabase token');
      throw new AppError('Invalid or expired auth token', 401);
    }

    // --- Validate body ---
    const { user_code: userCode } = approveSchema.parse(req.body);

    // --- Look up the pending device code ---
    const { data: record, error: lookupError } = await supabase
      .from('device_codes')
      .select('device_code, expires_at, status')
      .eq('user_code', userCode)
      .eq('status', 'pending')
      .single();

    if (lookupError || !record) {
      throw new AppError('Code not found or expired. Check your CLI and try again.', 404);
    }

    // Verify not expired
    const expiresAt = new Date(record.expires_at as string).getTime();
    if (Date.now() > expiresAt) {
      await supabase.from('device_codes').delete().eq('device_code', record.device_code);
      throw new AppError('Code has expired. Please run the login command again.', 404);
    }

    // --- Approve ---
    const { error: updateError } = await supabase
      .from('device_codes')
      .update({
        status: 'approved',
        user_id: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq('device_code', record.device_code as string)
      .eq('status', 'pending');

    if (updateError) {
      logger.error({ error: updateError.message }, 'Device approve: failed to update record');
      throw new AppError('Failed to approve device code', 500);
    }

    res.json({ approved: true });
  },
);

export { router as deviceAuthRouter };

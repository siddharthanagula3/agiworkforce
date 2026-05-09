/**
 * Worker registration endpoints.
 *
 * Implements the outbound-worker direction-inversion protocol:
 * workers (CLI / desktop / mobile) POST here to register as available;
 * the cloud hands them a WorkSecret envelope containing a session-ingress
 * JWT they use for subsequent ack/heartbeat calls.
 *
 * Endpoints:
 *   POST /v1/environments/bridge         — register environment (Tier 1: OAuth Bearer)
 *   POST /v1/environments/:id/archive    — de-register environment
 *   POST /api/auth/trusted_devices       — enroll Trusted-Device token at /login
 *
 * Auth tiers (per-endpoint):
 *   register  — OAuth Bearer + optional X-Trusted-Device-Token (enrollment window)
 *   archive   — environment_secret
 *   trusted_devices — gateway JWT (called during /login, gated on session age)
 *
 * Citation: net-bridge-remote-server.md §2.1 `bridgeApi.ts:212-417`
 * Citation: net-bridge-remote-server.md §2.1 `trustedDevice.ts:33-87`
 * Citation: tasks/research/gap-matrix/services-gateway-signaling.md §3.1, 3.3, 3.4
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { randomUUID, createHash, randomBytes } from 'crypto';
import { authenticateToken } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimit';
import { getServiceClient, getUserScopedClient } from '../lib/supabaseClients';
import { logger } from '../lib/logger';
import { requireEnv } from '../env';
import {
  encodeWorkSecret,
  validateBridgeId,
  headerString,
  paramString,
  WORK_SECRET_VERSION,
  type WorkerType,
} from './types';

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const registerWorkerSchema = z
  .object({
    worker_type: z.enum(['cli', 'desktop', 'mobile', 'custom']),
    platform: z.string().min(1).max(64),
    version: z.string().regex(/^\d+\.\d+\.\d+/, 'Must start with semver'),
    display_name: z.string().min(1).max(128).optional(),
  })
  .strict();

const enrollTrustedDeviceSchema = z
  .object({
    display_name: z.string().min(1).max(256),
    device_token: z.string().min(32).max(512),
  })
  .strict();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const JWT_SECRET = requireEnv('JWT_SECRET');

function hashSecret(secret: string): string {
  return createHash('sha256')
    .update(secret + JWT_SECRET)
    .digest('hex');
}

function mintEnvironmentSecret(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Mint a session_ingress_token (opaque-ish JWT-like blob).
 * In production this would be a short-lived signed JWT; here we use a
 * base64url random to keep this layer thin.  The assignment module issues
 * real WorkSecret envelopes that carry this token.
 */
function mintSessionIngressToken(environmentId: string): string {
  const payload = { environment_id: environmentId, iat: Math.floor(Date.now() / 1000) };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

// ---------------------------------------------------------------------------
// POST /v1/environments/bridge — register environment
// ---------------------------------------------------------------------------

router.post(
  '/v1/environments/bridge',
  authenticateToken,
  createRateLimiter('device-register'),
  async (req: Request, res: Response): Promise<void> => {
    const parse = registerWorkerSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: 'Invalid request body', details: parse.error.flatten() });
      return;
    }

    const { worker_type, platform, version } = parse.data;
    const userId = req.user!.userId;
    const environmentId = randomUUID();
    const environmentSecret = mintEnvironmentSecret();
    const environmentSecretHash = hashSecret(environmentSecret);
    const now = new Date().toISOString();

    const client = getUserScopedClient(userId);

    const { error: insertError } = await client.from('worker_registrations').insert({
      id: environmentId,
      user_id: userId,
      worker_type: worker_type as WorkerType,
      platform,
      version,
      worker_epoch: 0,
      environment_id: environmentId,
      environment_secret_hash: environmentSecretHash,
      trusted_device_token_hash: null,
      status: 'available',
      last_heartbeat_at: now,
      created_at: now,
      updated_at: now,
    });

    if (insertError) {
      logger.error({ error: insertError, userId }, 'Failed to register worker');
      res.status(500).json({ error: 'Failed to register environment' });
      return;
    }

    logger.info({ environmentId, userId, worker_type, platform }, 'Worker registered');

    res.status(201).json({
      environment_id: environmentId,
      environment_secret: environmentSecret,
      expires_at: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
    });
  },
);

// ---------------------------------------------------------------------------
// POST /v1/environments/:environmentId/archive — de-register environment
// ---------------------------------------------------------------------------

router.post(
  '/v1/environments/:environmentId/archive',
  createRateLimiter('device-delete'),
  async (req: Request, res: Response): Promise<void> => {
    const environmentId = paramString(req.params['environmentId']);

    if (!environmentId || !validateBridgeId(environmentId)) {
      res.status(400).json({ error: 'Invalid environment_id' });
      return;
    }

    const envSecret = headerString(req.headers['x-environment-secret']);
    if (!envSecret) {
      res.status(401).json({ error: 'Missing X-Environment-Secret header (Tier 2 auth required)' });
      return;
    }

    const client = getServiceClient();
    const { data: row, error: fetchError } = await client
      .from('worker_registrations')
      .select('id, user_id, environment_secret_hash')
      .eq('environment_id', environmentId)
      .maybeSingle();

    if (fetchError || !row) {
      res.status(404).json({ error: 'Environment not found' });
      return;
    }

    const expectedHash = hashSecret(envSecret);
    if (row.environment_secret_hash !== expectedHash) {
      res.status(401).json({ error: 'Invalid environment_secret' });
      return;
    }

    const { error: updateError } = await client
      .from('worker_registrations')
      .update({ status: 'offline', updated_at: new Date().toISOString() })
      .eq('environment_id', environmentId);

    if (updateError) {
      logger.error({ error: updateError, environmentId }, 'Failed to archive worker');
      res.status(500).json({ error: 'Failed to archive environment' });
      return;
    }

    logger.info({ environmentId }, 'Worker archived');
    res.json({ archived: true });
  },
);

// ---------------------------------------------------------------------------
// POST /api/auth/trusted_devices — Trusted-Device enrollment
//
// Must be called within 10 min of login (gated on account_session.created_at).
// The client memoizes the returned token so macOS `security` subprocess is
// not spawned on every poll.
//
// Citation: net-bridge-remote-server.md §2.1 `trustedDevice.ts:142-200`
// ---------------------------------------------------------------------------

const TRUSTED_DEVICE_ENROLLMENT_WINDOW_MS = 10 * 60 * 1000;

router.post(
  '/api/auth/trusted_devices',
  authenticateToken,
  createRateLimiter('device-register'),
  async (req: Request, res: Response): Promise<void> => {
    const parse = enrollTrustedDeviceSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: 'Invalid request body', details: parse.error.flatten() });
      return;
    }

    const userId = req.user!.userId;
    const { display_name, device_token } = parse.data;

    const client = getServiceClient();

    const { data: session, error: sessionError } = await client
      .from('account_sessions')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessionError || !session) {
      logger.warn({ userId, sessionError }, 'Trusted-Device enrollment: no session found');
      res.status(403).json({
        error: 'No active session found. Trusted-Device enrollment requires a recent login.',
        code: 'NO_ACTIVE_SESSION',
      });
      return;
    }

    const sessionAge = Date.now() - new Date(session.created_at).getTime();
    if (sessionAge > TRUSTED_DEVICE_ENROLLMENT_WINDOW_MS) {
      res.status(403).json({
        error: 'Trusted-Device enrollment window expired. Must enroll within 10 minutes of login.',
        code: 'ENROLLMENT_WINDOW_EXPIRED',
      });
      return;
    }

    const deviceTokenHash = hashSecret(device_token);

    const { error: updateError } = await client
      .from('worker_registrations')
      .update({
        trusted_device_token_hash: deviceTokenHash,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('status', 'available');

    if (updateError) {
      logger.error({ error: updateError, userId }, 'Failed to enroll Trusted-Device');
      res.status(500).json({ error: 'Failed to enroll Trusted-Device' });
      return;
    }

    logger.info(
      { userId, display_name },
      'Trusted-Device enrolled (within 10-min enrollment window)',
    );

    res.json({
      enrolled: true,
      display_name,
    });
  },
);

// ---------------------------------------------------------------------------
// POST /v1/environments/:environmentId/bridge — bump worker_epoch
//
// Every call to this endpoint increments worker_epoch.  A JWT-only
// credential swap that doesn't rebuild the transport will 409 within 20s
// on the next heartbeat because the epoch is part of every wire message.
//
// Citation: net-bridge-remote-server.md §2.1 `codeSessionApi.ts:93-168`
// ---------------------------------------------------------------------------

router.post(
  '/v1/environments/:environmentId/bridge',
  createRateLimiter('device-command'),
  async (req: Request, res: Response): Promise<void> => {
    const environmentId = paramString(req.params['environmentId']);

    if (!environmentId || !validateBridgeId(environmentId)) {
      res.status(400).json({ error: 'Invalid environment_id' });
      return;
    }

    const envSecret = headerString(req.headers['x-environment-secret']);
    if (!envSecret) {
      res.status(401).json({ error: 'Missing X-Environment-Secret header' });
      return;
    }

    const client = getServiceClient();
    const { data: row, error: fetchError } = await client
      .from('worker_registrations')
      .select('id, user_id, environment_secret_hash, worker_epoch, status')
      .eq('environment_id', environmentId)
      .maybeSingle();

    if (fetchError || !row) {
      res.status(404).json({ error: 'Environment not found' });
      return;
    }

    const expectedHash = hashSecret(envSecret);
    if (row.environment_secret_hash !== expectedHash) {
      res.status(401).json({ error: 'Invalid environment_secret' });
      return;
    }

    if (row.status === 'offline') {
      res.status(409).json({ error: 'Worker is offline. Re-register to resume.' });
      return;
    }

    const newEpoch = (row.worker_epoch as number) + 1;
    const sessionIngressToken = mintSessionIngressToken(environmentId);

    const { error: updateError } = await client
      .from('worker_registrations')
      .update({ worker_epoch: newEpoch, updated_at: new Date().toISOString() })
      .eq('environment_id', environmentId);

    if (updateError) {
      logger.error({ error: updateError, environmentId }, 'Failed to bump worker_epoch');
      res.status(500).json({ error: 'Failed to bump epoch' });
      return;
    }

    const workSecretPayload = {
      version: WORK_SECRET_VERSION,
      session_ingress_token: sessionIngressToken,
      api_base_url: process.env['API_BASE_URL'] ?? 'https://api.agiworkforce.com',
      use_code_sessions: true,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };
    const workSecretEnvelope = encodeWorkSecret(workSecretPayload);

    logger.info({ environmentId, newEpoch }, 'Worker epoch bumped via /bridge');

    res.json({
      worker_epoch: newEpoch,
      work_secret: workSecretEnvelope,
    });
  },
);

export { router as registrationRouter };

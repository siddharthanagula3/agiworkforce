/**
 * Work assignment endpoints.
 *
 * After registration, workers long-poll for work:
 *   GET  /v1/environments/:id/work/poll         — wait for next work unit
 *   POST /v1/environments/:id/work/:wid/ack      — accept work + verify WorkSecret
 *   POST /v1/environments/:id/work/:wid/complete — submit result
 *   POST /v1/environments/:id/work/:wid/stop     — cancel/reject work
 *
 * Auth per-endpoint:
 *   poll     — environment_secret (Tier 2) + optional X-Trusted-Device-Token (Tier 4)
 *   ack      — session_ingress JWT inside WorkSecret (Tier 3)
 *   complete — session_ingress JWT (Tier 3)
 *   stop     — environment_secret (Tier 2)
 *
 * Idempotency: all mutating endpoints carry an `idempotency_key` field in the
 * body.  The DB row is the idempotency store; duplicate acks return the
 * existing envelope without inserting a new row.
 *
 * Step-up auth: if the gateway returns 403 + `{ code: 'insufficient_scope' }`
 * the caller MUST NOT refresh the token (RFC 6749 §6) and instead starts a
 * fresh PKCE flow.
 *
 * Citation: net-bridge-remote-server.md §2.1 `bridgeApi.ts:212-417`
 * Citation: tasks/research/gap-matrix/services-gateway-signaling.md §3.1
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { createHash } from 'crypto';
import { createRateLimiter } from '../middleware/rateLimit';
import { getServiceClient } from '../lib/supabaseClients';
import { logger } from '../lib/logger';
import { requireEnv } from '../env';
import {
  encodeWorkSecret,
  validateBridgeId,
  headerString,
  paramString,
  WORK_SECRET_VERSION,
} from './types';

const router = Router();

const JWT_SECRET = requireEnv('JWT_SECRET');

function hashSecret(secret: string): string {
  return createHash('sha256')
    .update(secret + JWT_SECRET)
    .digest('hex');
}

function mintSessionIngressToken(environmentId: string, workId: string): string {
  const payload = {
    environment_id: environmentId,
    work_id: workId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * Validate environment_secret (Tier 2 auth).
 * Returns the worker row or null on failure.
 */
async function verifyEnvironmentSecret(
  environmentId: string,
  envSecret: string,
): Promise<{ id: string; user_id: string; status: string; worker_epoch: number } | null> {
  const client = getServiceClient();
  const { data: row, error } = await client
    .from('worker_registrations')
    .select('id, user_id, status, worker_epoch, environment_secret_hash')
    .eq('environment_id', environmentId)
    .maybeSingle();

  if (error || !row) return null;
  const expectedHash = hashSecret(envSecret);
  if (row.environment_secret_hash !== expectedHash) return null;
  return row as { id: string; user_id: string; status: string; worker_epoch: number };
}

/**
 * Validate session_ingress JWT (Tier 3 auth).
 * The token is a base64url-encoded JSON blob minted by this gateway.
 */
function verifySessionIngressToken(token: string, environmentId: string, workId: string): boolean {
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as {
      environment_id?: string;
      work_id?: string;
      exp?: number;
    };
    if (payload.environment_id !== environmentId) return false;
    if (payload.work_id !== workId) return false;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const ackWorkSchema = z
  .object({
    idempotency_key: z.string().min(1).max(128),
    session_ingress_token: z.string().min(1),
  })
  .strict();

const completeWorkSchema = z
  .object({
    result: z.unknown(),
    idempotency_key: z.string().min(1).max(128),
  })
  .strict();

const stopWorkSchema = z
  .object({
    reason: z.string().max(512).optional(),
    force: z.boolean().optional(),
    idempotency_key: z.string().min(1).max(128),
  })
  .strict();

// ---------------------------------------------------------------------------
// GET /v1/environments/:environmentId/work/poll — long-poll for work
//
// Workers poll this endpoint (Tier 2 + optional Tier 4).
// Returns immediately if work is available, otherwise holds the connection
// open up to POLL_TIMEOUT_MS and returns 204 if no work arrives in time.
// ---------------------------------------------------------------------------

const POLL_TIMEOUT_MS = 20_000;

router.get(
  '/v1/environments/:environmentId/work/poll',
  createRateLimiter('heartbeat'),
  async (req: Request, res: Response): Promise<void> => {
    const environmentId = paramString(req.params['environmentId']);

    if (!environmentId || !validateBridgeId(environmentId)) {
      res.status(400).json({ error: 'Invalid environment_id' });
      return;
    }

    const envSecret = headerString(req.headers['x-environment-secret']);
    if (!envSecret) {
      res.status(401).json({ error: 'Missing X-Environment-Secret header (Tier 2 required)' });
      return;
    }

    const trustedDeviceToken = headerString(req.headers['x-trusted-device-token']);

    const worker = await verifyEnvironmentSecret(environmentId, envSecret);
    if (!worker) {
      res.status(401).json({ error: 'Invalid environment_secret' });
      return;
    }

    if (worker.status === 'offline') {
      res.status(409).json({ error: 'Worker offline — re-register before polling' });
      return;
    }

    const client = getServiceClient();

    let workUnit: {
      id: string;
      payload: Record<string, unknown>;
      idempotency_key: string | null;
    } | null = null;

    let elapsed = 0;
    const step = 500;

    while (!workUnit && elapsed < POLL_TIMEOUT_MS) {
      const { data, error } = await client
        .from('work_units')
        .select('id, payload, idempotency_key')
        .eq('environment_id', environmentId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        logger.error({ error, environmentId }, 'Poll query error');
        res.status(500).json({ error: 'Poll query failed' });
        return;
      }

      if (data) {
        workUnit = data as {
          id: string;
          payload: Record<string, unknown>;
          idempotency_key: string | null;
        };
        break;
      }

      await new Promise<void>((resolve) => setTimeout(resolve, step));
      elapsed += step;
    }

    if (!workUnit) {
      res.status(204).end();
      return;
    }

    const workId = workUnit.id;
    const sessionIngressToken = mintSessionIngressToken(environmentId, workId);

    const workSecretPayload = {
      version: WORK_SECRET_VERSION,
      session_ingress_token: sessionIngressToken,
      api_base_url: process.env['API_BASE_URL'] ?? 'https://api.agiworkforce.com',
      use_code_sessions: true,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };
    const workSecretEnvelope = encodeWorkSecret(workSecretPayload);

    const { error: assignError } = await client
      .from('work_units')
      .update({ status: 'assigned', worker_id: worker.id, updated_at: new Date().toISOString() })
      .eq('id', workId)
      .eq('status', 'pending');

    if (assignError) {
      logger.error({ error: assignError, workId }, 'Failed to assign work unit');
      res.status(500).json({ error: 'Failed to assign work' });
      return;
    }

    logger.info(
      {
        environmentId,
        workId,
        hasTrustedDevice: typeof trustedDeviceToken === 'string',
      },
      'Work assigned to worker',
    );

    res.json({
      work_id: workId,
      work_secret: workSecretEnvelope,
      worker_epoch: worker.worker_epoch,
      payload: workUnit.payload,
    });
  },
);

// ---------------------------------------------------------------------------
// POST /v1/environments/:environmentId/work/:workId/ack — accept work
//
// Worker verifies the WorkSecret, decodes it, and POSTs back to ack.
// Auth: session_ingress JWT inside the WorkSecret body (Tier 3).
// Idempotent: duplicate acks return the existing state.
// ---------------------------------------------------------------------------

router.post(
  '/v1/environments/:environmentId/work/:workId/ack',
  createRateLimiter('device-command'),
  async (req: Request, res: Response): Promise<void> => {
    const environmentId = paramString(req.params['environmentId']);
    const workId = paramString(req.params['workId']);

    if (!environmentId || !validateBridgeId(environmentId)) {
      res.status(400).json({ error: 'Invalid environment_id' });
      return;
    }
    if (!workId || !validateBridgeId(workId)) {
      res.status(400).json({ error: 'Invalid work_id' });
      return;
    }

    const parse = ackWorkSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: 'Invalid request body', details: parse.error.flatten() });
      return;
    }

    const { session_ingress_token } = parse.data;

    if (!verifySessionIngressToken(session_ingress_token, environmentId, workId)) {
      res.status(401).json({ error: 'Invalid session_ingress_token (Tier 3 auth failed)' });
      return;
    }

    const client = getServiceClient();
    const { data: workRow, error: fetchError } = await client
      .from('work_units')
      .select('id, status, environment_id')
      .eq('id', workId)
      .eq('environment_id', environmentId)
      .maybeSingle();

    if (fetchError || !workRow) {
      res.status(404).json({ error: 'Work unit not found' });
      return;
    }

    if (workRow.status === 'assigned') {
      res.json({ acked: true });
      return;
    }

    if (workRow.status !== 'pending') {
      res.status(409).json({
        error: `Work unit is ${workRow.status}, cannot ack`,
      });
      return;
    }

    const { error: updateError } = await client
      .from('work_units')
      .update({ status: 'assigned', updated_at: new Date().toISOString() })
      .eq('id', workId);

    if (updateError) {
      logger.error({ error: updateError, workId }, 'Failed to ack work unit');
      res.status(500).json({ error: 'Ack failed' });
      return;
    }

    logger.info({ environmentId, workId }, 'Work unit acked');
    res.json({ acked: true });
  },
);

// ---------------------------------------------------------------------------
// POST /v1/environments/:environmentId/work/:workId/complete — submit result
//
// Auth: session_ingress JWT in Authorization header (Tier 3).
// ---------------------------------------------------------------------------

router.post(
  '/v1/environments/:environmentId/work/:workId/complete',
  createRateLimiter('device-command'),
  async (req: Request, res: Response): Promise<void> => {
    const environmentId = paramString(req.params['environmentId']);
    const workId = paramString(req.params['workId']);

    if (!environmentId || !validateBridgeId(environmentId)) {
      res.status(400).json({ error: 'Invalid environment_id' });
      return;
    }
    if (!workId || !validateBridgeId(workId)) {
      res.status(400).json({ error: 'Invalid work_id' });
      return;
    }

    const authHeader = headerString(req.headers['authorization']);
    const parts = authHeader?.split(' ');
    const sessionIngressToken =
      parts?.length === 2 && parts[0].toLowerCase() === 'bearer' ? parts[1] : undefined;

    if (
      !sessionIngressToken ||
      !verifySessionIngressToken(sessionIngressToken, environmentId, workId)
    ) {
      res.status(401).json({ error: 'Invalid or missing session_ingress_token' });
      return;
    }

    const parse = completeWorkSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: 'Invalid request body', details: parse.error.flatten() });
      return;
    }

    const client = getServiceClient();
    const { data: workRow, error: fetchError } = await client
      .from('work_units')
      .select('id, status')
      .eq('id', workId)
      .eq('environment_id', environmentId)
      .maybeSingle();

    if (fetchError || !workRow) {
      res.status(404).json({ error: 'Work unit not found' });
      return;
    }

    if (workRow.status === 'completed') {
      res.json({ completed: true });
      return;
    }

    if (workRow.status !== 'assigned') {
      res.status(409).json({ error: `Cannot complete work in status ${workRow.status}` });
      return;
    }

    const { error: updateError } = await client
      .from('work_units')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        payload: {
          ...((workRow as { payload?: Record<string, unknown> }).payload ?? {}),
          result: parse.data.result,
        },
      })
      .eq('id', workId);

    if (updateError) {
      logger.error({ error: updateError, workId }, 'Failed to complete work unit');
      res.status(500).json({ error: 'Complete failed' });
      return;
    }

    logger.info({ environmentId, workId }, 'Work unit completed');
    res.json({ completed: true });
  },
);

// ---------------------------------------------------------------------------
// POST /v1/environments/:environmentId/work/:workId/stop — cancel/reject work
//
// Auth: environment_secret (Tier 2).
// Optional `force: true` skips the assigned-only guard.
// ---------------------------------------------------------------------------

router.post(
  '/v1/environments/:environmentId/work/:workId/stop',
  createRateLimiter('device-command'),
  async (req: Request, res: Response): Promise<void> => {
    const environmentId = paramString(req.params['environmentId']);
    const workId = paramString(req.params['workId']);

    if (!environmentId || !validateBridgeId(environmentId)) {
      res.status(400).json({ error: 'Invalid environment_id' });
      return;
    }
    if (!workId || !validateBridgeId(workId)) {
      res.status(400).json({ error: 'Invalid work_id' });
      return;
    }

    const envSecret = headerString(req.headers['x-environment-secret']);
    if (!envSecret) {
      res.status(401).json({ error: 'Missing X-Environment-Secret header' });
      return;
    }

    const worker = await verifyEnvironmentSecret(environmentId, envSecret);
    if (!worker) {
      res.status(401).json({ error: 'Invalid environment_secret' });
      return;
    }

    const parse = stopWorkSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: 'Invalid request body', details: parse.error.flatten() });
      return;
    }

    const { force = false } = parse.data;
    const client = getServiceClient();

    const { data: workRow, error: fetchError } = await client
      .from('work_units')
      .select('id, status')
      .eq('id', workId)
      .eq('environment_id', environmentId)
      .maybeSingle();

    if (fetchError || !workRow) {
      res.status(404).json({ error: 'Work unit not found' });
      return;
    }

    if (!force && workRow.status !== 'assigned') {
      res.status(409).json({ error: `Cannot stop work in status ${workRow.status} without force` });
      return;
    }

    const { error: updateError } = await client
      .from('work_units')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', workId);

    if (updateError) {
      logger.error({ error: updateError, workId }, 'Failed to stop work unit');
      res.status(500).json({ error: 'Stop failed' });
      return;
    }

    logger.info({ environmentId, workId, force }, 'Work unit stopped');
    res.json({ stopped: true });
  },
);

export { router as assignmentRouter };

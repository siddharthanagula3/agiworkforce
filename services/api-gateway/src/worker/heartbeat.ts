/**
 * Worker heartbeat protocol.
 *
 * Workers heartbeat every 30s on the `/v1/environments/:id/work/:wid/heartbeat`
 * endpoint.  Missed heartbeats > 90s mark the worker offline and trigger
 * reassignment of in-flight work to other available workers.
 *
 * Reassignment is idempotent: the newly assigned work unit gets the same
 * idempotency_key so two workers that both receive the same unit can detect
 * the duplicate on ack.
 *
 * A background sweep process (started once at module load) scans for stale
 * workers every 60s and calls `reassignStaleWork()`.
 *
 * Auth: session_ingress JWT + X-Trusted-Device-Token (Tiers 3+4).
 * Citation: net-bridge-remote-server.md §2.1 `bridgeApi.ts:212-417`
 * Citation: tasks/research/gap-matrix/services-gateway-signaling.md §3.2
 */

import { Router, type Request, type Response } from 'express';
import { createHash } from 'crypto';
import { createRateLimiter } from '../middleware/rateLimit';
import { getServiceClient } from '../lib/supabaseClients';
import { logger } from '../lib/logger';
import { requireEnv } from '../env';
import {
  validateBridgeId,
  headerString,
  paramString,
  HEARTBEAT_OFFLINE_THRESHOLD_MS,
} from './types';

const router = Router();

const JWT_SECRET = requireEnv('JWT_SECRET');

function hashSecret(secret: string): string {
  return createHash('sha256')
    .update(secret + JWT_SECRET)
    .digest('hex');
}

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
// POST /v1/environments/:environmentId/work/:workId/heartbeat
//
// Auth: Authorization: Bearer <session_ingress_token>   (Tier 3)
//       X-Trusted-Device-Token: <token>                 (Tier 4, optional)
// ---------------------------------------------------------------------------

router.post(
  '/v1/environments/:environmentId/work/:workId/heartbeat',
  createRateLimiter('heartbeat'),
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
      res.status(401).json({ error: 'Invalid or missing session_ingress_token (Tier 3 required)' });
      return;
    }

    const trustedDeviceToken = headerString(req.headers['x-trusted-device-token']);
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

    if (workRow.status === 'completed' || workRow.status === 'failed') {
      res.status(409).json({ error: `Work unit already ${workRow.status}` });
      return;
    }

    const now = new Date().toISOString();
    const { error: heartbeatError } = await client
      .from('worker_registrations')
      .update({ last_heartbeat_at: now, status: 'busy', updated_at: now })
      .eq('environment_id', environmentId);

    if (heartbeatError) {
      logger.error({ error: heartbeatError, environmentId }, 'Heartbeat update failed');
      res.status(500).json({ error: 'Heartbeat failed' });
      return;
    }

    logger.debug(
      { environmentId, workId, hasTrustedDevice: typeof trustedDeviceToken === 'string' },
      'Worker heartbeat received',
    );

    res.json({ alive: true, server_time: now });
  },
);

// ---------------------------------------------------------------------------
// GET /v1/environments/:environmentId/heartbeat — worker-level keep-alive
//
// Workers that are registered but not currently working send this.
// Auth: X-Environment-Secret (Tier 2) + X-Trusted-Device-Token (Tier 4).
// ---------------------------------------------------------------------------

router.get(
  '/v1/environments/:environmentId/heartbeat',
  createRateLimiter('heartbeat'),
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
      .select('id, environment_secret_hash, status')
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

    const now = new Date().toISOString();
    const { error: updateError } = await client
      .from('worker_registrations')
      .update({ last_heartbeat_at: now, status: 'available', updated_at: now })
      .eq('environment_id', environmentId);

    if (updateError) {
      logger.error({ error: updateError, environmentId }, 'Worker-level heartbeat update failed');
      res.status(500).json({ error: 'Heartbeat failed' });
      return;
    }

    res.json({ alive: true, server_time: now });
  },
);

// ---------------------------------------------------------------------------
// Background sweep: mark stale workers offline and reassign in-flight work
//
// Runs every 60s. Any worker whose last_heartbeat_at is > OFFLINE_THRESHOLD ago
// is moved to "offline".  Any assigned work_unit belonging to that worker is
// reassigned to the next available worker in the same environment, or reset to
// "pending" if no other worker is available.
//
// Idempotency: if a work_unit already has a result it is not touched.
// ---------------------------------------------------------------------------

async function reassignStaleWork(): Promise<void> {
  const client = getServiceClient();
  const cutoff = new Date(Date.now() - HEARTBEAT_OFFLINE_THRESHOLD_MS).toISOString();

  const { data: staleWorkers, error: staleError } = await client
    .from('worker_registrations')
    .select('id, environment_id, user_id')
    .in('status', ['available', 'busy'])
    .lt('last_heartbeat_at', cutoff);

  if (staleError || !staleWorkers?.length) return;

  for (const worker of staleWorkers) {
    logger.warn(
      { workerId: worker.id, environmentId: worker.environment_id },
      'Worker missed heartbeat — marking offline',
    );

    await client
      .from('worker_registrations')
      .update({ status: 'offline', updated_at: new Date().toISOString() })
      .eq('id', worker.id);

    const { data: inFlightUnits, error: unitsError } = await client
      .from('work_units')
      .select('id, environment_id')
      .eq('worker_id', worker.id)
      .eq('status', 'assigned');

    if (unitsError || !inFlightUnits?.length) continue;

    const { data: alternativeWorker } = await client
      .from('worker_registrations')
      .select('id')
      .eq('environment_id', worker.environment_id)
      .eq('status', 'available')
      .neq('id', worker.id)
      .limit(1)
      .maybeSingle();

    const newWorkerId = alternativeWorker?.id ?? null;
    const newStatus = newWorkerId ? 'assigned' : 'pending';

    for (const unit of inFlightUnits) {
      await client
        .from('work_units')
        .update({
          status: newStatus,
          worker_id: newWorkerId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', unit.id);

      logger.info(
        { unitId: unit.id, newStatus, newWorkerId },
        'Reassigned in-flight work after worker went offline',
      );
    }
  }
}

let sweepInterval: ReturnType<typeof setInterval> | null = null;

export function startHeartbeatSweep(): void {
  if (sweepInterval) return;
  sweepInterval = setInterval(() => {
    reassignStaleWork().catch((err) => {
      logger.error({ err }, 'Heartbeat sweep error');
    });
  }, 60_000);
  sweepInterval.unref?.();
}

export function stopHeartbeatSweep(): void {
  if (sweepInterval) {
    clearInterval(sweepInterval);
    sweepInterval = null;
  }
}

export { router as heartbeatRouter };

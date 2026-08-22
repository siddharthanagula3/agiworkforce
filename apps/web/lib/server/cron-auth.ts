import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';

import { logger } from '@/lib/logger';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function constantTimeEquals(provided: string, expected: string): boolean {
  return timingSafeEqual(digest(provided), digest(expected));
}

const FAILURE_WINDOW_MS = 60_000;
const MAX_FAILURES_PER_WINDOW = 10;
const MIN_CRON_SECRET_LENGTH = 32;
const failuresByClient = new Map<string, { count: number; windowStart: number }>();
let weakSecretWarned = false;

function clientKey(request: Pick<Request, 'headers'>): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown';
}

function isThrottled(key: string, now: number): boolean {
  const entry = failuresByClient.get(key);
  if (!entry) return false;
  if (now - entry.windowStart > FAILURE_WINDOW_MS) {
    failuresByClient.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILURES_PER_WINDOW;
}

function recordFailure(key: string, now: number): void {
  if (failuresByClient.size > 10_000) {
    for (const [existing, entry] of failuresByClient) {
      if (now - entry.windowStart > FAILURE_WINDOW_MS) failuresByClient.delete(existing);
    }
  }
  const entry = failuresByClient.get(key);
  if (!entry || now - entry.windowStart > FAILURE_WINDOW_MS) {
    failuresByClient.set(key, { count: 1, windowStart: now });
    return;
  }
  entry.count += 1;
}

export function resetCronAuthThrottleForTests(): void {
  failuresByClient.clear();
  weakSecretWarned = false;
}

export function verifyCronRequest(request: Pick<Request, 'headers'>): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env['CRON_SECRET'];
  const nodeEnv = process.env['NODE_ENV'];
  const devBypass = process.env['CRON_DEV_BYPASS'] === '1';

  if (cronSecret) {
    if (cronSecret.length < MIN_CRON_SECRET_LENGTH && !weakSecretWarned) {
      weakSecretWarned = true;
      logger.warn(
        { length: cronSecret.length, minimum: MIN_CRON_SECRET_LENGTH },
        'CRON_SECRET is shorter than the recommended minimum; rotate it to a longer random value',
      );
    }
    const key = clientKey(request);
    const now = Date.now();
    if (isThrottled(key, now)) {
      logger.warn({ client: key }, 'cron auth throttled · too many failed secrets from one client');
      return false;
    }
    const accepted = constantTimeEquals(authHeader ?? '', `Bearer ${cronSecret}`);
    if (accepted) failuresByClient.delete(key);
    else recordFailure(key, now);
    return accepted;
  }

  if (nodeEnv === 'development' && devBypass) {
    const host = (request.headers.get('host') ?? '').toLowerCase();
    const isLoopbackHost =
      host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]');
    if (!isLoopbackHost) {
      logger.error({ nodeEnv, host }, 'CRON_DEV_BYPASS rejected · request not from loopback host');
      return false;
    }
    logger.warn(
      { nodeEnv, host },
      'CRON_SECRET unset; CRON_DEV_BYPASS=1 + loopback host · allowing dev request',
    );
    return true;
  }

  logger.error(
    { nodeEnv, vercelEnv: process.env['VERCEL_ENV'], devBypass },
    'CRON_SECRET not set and CRON_DEV_BYPASS not enabled · denying request',
  );
  return false;
}

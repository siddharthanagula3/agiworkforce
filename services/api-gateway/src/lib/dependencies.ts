import {
  CircuitOpenError,
  DependencyOverloadedError,
  DependencyTimeoutError,
  circuitBreakerSnapshots,
  getCircuitBreaker,
  isDependencyUnavailableError,
} from '@agiworkforce/utils';
import type {
  CircuitBreaker,
  CircuitBreakerOptions,
  CircuitBreakerSnapshot,
} from '@agiworkforce/utils';
import { logger } from './logger';

export {
  CircuitOpenError,
  DependencyOverloadedError,
  DependencyTimeoutError,
  isDependencyUnavailableError,
};
export type { CircuitBreakerSnapshot };

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    logger.warn({ name, raw }, 'Ignoring non-positive circuit breaker override');
    return fallback;
  }
  return Math.floor(value);
}

function register(options: CircuitBreakerOptions): CircuitBreaker {
  return getCircuitBreaker({
    ...options,
    onStateChange: (event) => {
      const level = event.to === 'closed' ? 'info' : 'warn';
      logger[level](
        {
          dependency: event.name,
          from: event.from,
          to: event.to,
          failureRate: event.failureRate,
          slowCallRate: event.slowCallRate,
          samples: event.samples,
          openMs: event.openMs,
          lastError: event.lastError,
        },
        `Dependency circuit ${event.to}`,
      );
    },
  });
}

// A rejected token is the caller's fault, not Clerk's. Only reasons that mean
// "we could not reach or trust Clerk's key material" may move the circuit.
const CLERK_CALLER_FAULT_REASONS: ReadonlySet<string> = new Set([
  'token-expired',
  'token-invalid',
  'token-invalid-algorithm',
  'token-invalid-authorized-parties',
  'token-invalid-signature',
  'token-not-active-yet',
  'token-iat-in-the-future',
  'secret-key-invalid',
  'jwk-local-missing',
  'jwk-kid-mismatch',
]);

function isClerkDependencyFault(error: unknown): boolean {
  if (!error || typeof error !== 'object') return true;
  const reason = (error as { reason?: unknown }).reason;
  if (typeof reason !== 'string') return true;
  return !CLERK_CALLER_FAULT_REASONS.has(reason);
}

// Clerk verification and the auth-path Neon queries run on every authenticated
// request. Their budgets are deliberately the tightest in the gateway: a request
// that waits seconds here holds an Express handler and (for Neon) a pool
// connection that every unrelated route also needs.
export function clerkBreaker(): CircuitBreaker {
  return register({
    name: 'clerk',
    isFailure: isClerkDependencyFault,
    timeoutMs: envInt('CB_CLERK_TIMEOUT_MS', 2_500),
    slowCallMs: envInt('CB_CLERK_SLOW_MS', 1_000),
    maxConcurrent: envInt('CB_CLERK_MAX_CONCURRENT', 24),
    maxQueued: envInt('CB_CLERK_MAX_QUEUED', 24),
    queueTimeoutMs: envInt('CB_CLERK_QUEUE_TIMEOUT_MS', 500),
    volumeThreshold: envInt('CB_CLERK_VOLUME_THRESHOLD', 10),
    failureRateThreshold: 0.5,
    slowCallRateThreshold: 0.8,
    openMs: envInt('CB_CLERK_OPEN_MS', 10_000),
    maxOpenMs: 60_000,
  });
}

export function authDatabaseBreaker(): CircuitBreaker {
  return register({
    name: 'neon:auth',
    timeoutMs: envInt('CB_AUTH_DB_TIMEOUT_MS', 2_000),
    slowCallMs: envInt('CB_AUTH_DB_SLOW_MS', 750),
    maxConcurrent: envInt('CB_AUTH_DB_MAX_CONCURRENT', 8),
    maxQueued: envInt('CB_AUTH_DB_MAX_QUEUED', 16),
    queueTimeoutMs: envInt('CB_AUTH_DB_QUEUE_TIMEOUT_MS', 500),
    volumeThreshold: envInt('CB_AUTH_DB_VOLUME_THRESHOLD', 10),
    failureRateThreshold: 0.5,
    slowCallRateThreshold: 0.8,
    openMs: envInt('CB_AUTH_DB_OPEN_MS', 10_000),
    maxOpenMs: 60_000,
  });
}

export function providerBreaker(providerId: string): CircuitBreaker {
  return register({
    name: `provider:${providerId}`,
    timeoutMs: envInt('CB_PROVIDER_TIMEOUT_MS', 120_000),
    slowCallMs: envInt('CB_PROVIDER_SLOW_MS', 45_000),
    maxConcurrent: envInt('CB_PROVIDER_MAX_CONCURRENT', 32),
    maxQueued: envInt('CB_PROVIDER_MAX_QUEUED', 32),
    queueTimeoutMs: envInt('CB_PROVIDER_QUEUE_TIMEOUT_MS', 2_000),
    volumeThreshold: envInt('CB_PROVIDER_VOLUME_THRESHOLD', 8),
    failureRateThreshold: 0.5,
    slowCallRateThreshold: 0.9,
    openMs: envInt('CB_PROVIDER_OPEN_MS', 15_000),
    maxOpenMs: 120_000,
  });
}

export function providerHealthBreaker(providerId: string): CircuitBreaker {
  return register({
    name: `provider-health:${providerId}`,
    timeoutMs: envInt('CB_PROVIDER_HEALTH_TIMEOUT_MS', 3_000),
    slowCallMs: envInt('CB_PROVIDER_HEALTH_SLOW_MS', 1_500),
    maxConcurrent: 2,
    maxQueued: 0,
    queueTimeoutMs: 100,
    volumeThreshold: envInt('CB_PROVIDER_HEALTH_VOLUME_THRESHOLD', 3),
    failureRateThreshold: 0.5,
    slowCallRateThreshold: 0.9,
    openMs: envInt('CB_PROVIDER_HEALTH_OPEN_MS', 60_000),
    maxOpenMs: 300_000,
  });
}

export function mcpBreaker(serverId: string): CircuitBreaker {
  return register({
    name: `mcp:${serverId}`,
    timeoutMs: envInt('CB_MCP_TIMEOUT_MS', 20_000),
    slowCallMs: envInt('CB_MCP_SLOW_MS', 8_000),
    maxConcurrent: envInt('CB_MCP_MAX_CONCURRENT', 8),
    maxQueued: envInt('CB_MCP_MAX_QUEUED', 16),
    queueTimeoutMs: envInt('CB_MCP_QUEUE_TIMEOUT_MS', 2_000),
    volumeThreshold: envInt('CB_MCP_VOLUME_THRESHOLD', 5),
    failureRateThreshold: 0.5,
    slowCallRateThreshold: 0.9,
    openMs: envInt('CB_MCP_OPEN_MS', 30_000),
    maxOpenMs: 180_000,
  });
}

export interface DependencyHealthReport {
  status: 'ok' | 'degraded';
  dependencies: CircuitBreakerSnapshot[];
  degraded: string[];
}

export function dependencyHealthReport(): DependencyHealthReport {
  const dependencies = circuitBreakerSnapshots();
  const degraded = dependencies
    .filter((snapshot) => snapshot.state !== 'closed')
    .map((snapshot) => snapshot.name);
  return {
    status: degraded.length > 0 ? 'degraded' : 'ok',
    dependencies,
    degraded,
  };
}

export function retryAfterSeconds(error: unknown): number {
  if (error instanceof CircuitOpenError) {
    return Math.max(1, Math.ceil(error.retryAfterMs / 1000));
  }
  return 1;
}

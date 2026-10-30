import type { Application, RequestHandler } from 'express';
import type { DatabaseProbe } from './db.js';

export type DatabaseState =
  | { status: 'ok'; latencyMs: number; checkedAt: number }
  | { status: 'down'; reason: string; checkedAt: number };

export interface DatabaseCheck {
  current(): Promise<DatabaseState>;
  refresh(): Promise<DatabaseState>;
  last(): DatabaseState | null;
  invalidate(): void;
}

export function createDatabaseCheck(options: {
  probe: () => Promise<DatabaseProbe>;
  ttlMs: number;
  idleTtlMs?: number;
  isActive?: () => boolean;
  now?: () => number;
}): DatabaseCheck {
  const now = options.now ?? Date.now;
  let cached: DatabaseState | null = null;
  let inFlight: Promise<DatabaseState> | null = null;

  const record = (state: DatabaseState): DatabaseState => {
    cached = state;
    inFlight = null;
    return state;
  };

  const refresh = (): Promise<DatabaseState> => {
    inFlight ??= options.probe().then(
      (result) =>
        record(
          result.ok
            ? { status: 'ok', latencyMs: result.latencyMs, checkedAt: now() }
            : { status: 'down', reason: result.reason, checkedAt: now() },
        ),
      () => record({ status: 'down', reason: 'probe_failed', checkedAt: now() }),
    );
    return inFlight;
  };

  return {
    current: () => {
      const ttlMs =
        cached?.status === 'ok' && options.isActive?.() === false
          ? (options.idleTtlMs ?? options.ttlMs)
          : options.ttlMs;
      return cached && now() - cached.checkedAt < ttlMs ? Promise.resolve(cached) : refresh();
    },
    refresh,
    last: () => cached,
    invalidate: () => {
      cached = null;
    },
  };
}

export type RelayLifecycle = 'starting' | 'ready' | 'shutting_down';

export interface ProbeRouteDeps {
  lifecycle: () => RelayLifecycle;
  database: DatabaseCheck;
  healthLimiter: RequestHandler;
  healthDetail: () => Record<string, unknown>;
}

export function registerProbeRoutes(app: Application, deps: ProbeRouteDeps): void {
  app.get('/live', (_req, res) => {
    res.status(200).json({ status: 'alive', timestamp: Date.now() });
  });

  app.get('/ready', async (_req, res) => {
    if (deps.lifecycle() === 'shutting_down') {
      res.status(503).json({ status: 'shutting_down', timestamp: Date.now() });
      return;
    }
    const database = await deps.database.current();
    const lifecycle = deps.lifecycle();
    const ready = lifecycle === 'ready' && database.status === 'ok';
    res.status(ready ? 200 : 503).json({
      status: lifecycle === 'shutting_down' ? 'shutting_down' : ready ? 'ready' : 'not_ready',
      timestamp: Date.now(),
      checks: { database },
    });
  });

  app.get('/health', deps.healthLimiter, async (_req, res) => {
    const database = deps.lifecycle() === 'shutting_down' ? null : await deps.database.current();
    const lifecycle = deps.lifecycle();
    const status =
      lifecycle === 'shutting_down'
        ? 'shutting_down'
        : lifecycle === 'starting'
          ? 'starting'
          : database?.status === 'ok'
            ? 'healthy'
            : 'degraded';
    res.status(status === 'healthy' ? 200 : 503).json({
      status,
      ...deps.healthDetail(),
      timestamp: Date.now(),
      dependencies: { database },
    });
  });
}

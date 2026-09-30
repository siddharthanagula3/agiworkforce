import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { DatabaseProbe } from '../../src/db.js';
import { createDatabaseCheck, registerProbeRoutes, type RelayLifecycle } from '../../src/probes.js';
import { checkReadiness } from '../../src/readiness.js';
import { releaseIdentity } from '../../src/release.js';

const DEPLOY_ENV = {
  AGI_DEPLOYMENT_ID: 'machine-7a1f',
  AGI_RELEASE_SHA: 'a1b2c3d4e5f6',
  FLY_REGION: 'sjc',
  FLY_APP_NAME: 'agiworkforce-signaling',
  AGI_DEPLOY_ENV: 'production',
};

interface ProbeHarness {
  app: express.Application;
  setLifecycle: (next: RelayLifecycle) => void;
  setDatabase: (next: DatabaseProbe) => void;
}

function createProbeApp(deployEnv: Record<string, string | undefined> = DEPLOY_ENV): ProbeHarness {
  const app = express();
  const release = releaseIdentity(deployEnv);
  let lifecycle: RelayLifecycle = 'ready';
  let database: DatabaseProbe = { ok: true, latencyMs: 3 };

  registerProbeRoutes(app, {
    lifecycle: () => lifecycle,
    database: createDatabaseCheck({ probe: async () => database, ttlMs: 0 }),
    healthLimiter: (_req, _res, next) => next(),
    healthDetail: () => ({
      uptime: 1,
      deployment: release,
      connections: { total: 0, uniqueIps: 0, topCloseReasons: [] },
      sessions: { active: 0 },
      memory: { heapUsed: 1, heapTotal: 1, rss: 1, unit: 'MB' },
    }),
  });

  return {
    app,
    setLifecycle: (next) => {
      lifecycle = next;
    },
    setDatabase: (next) => {
      database = next;
    },
  };
}

describe('Health Endpoints', () => {
  let probe: ProbeHarness;

  beforeEach(() => {
    probe = createProbeApp();
  });

  describe('GET /live', () => {
    it('answers while the process runs, whatever the database is doing', async () => {
      probe.setDatabase({ ok: false, reason: 'timeout' });
      const response = await request(probe.app).get('/live');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('alive');
    });
  });

  describe('GET /ready', () => {
    it('is ready once the store answered at startup and reports its state', async () => {
      const response = await request(probe.app).get('/ready');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ready');
      expect(response.body.checks.database).toMatchObject({ status: 'ok', latencyMs: 3 });
    });

    it('stays unready while the store has not answered at startup', async () => {
      probe.setLifecycle('starting');
      probe.setDatabase({ ok: false, reason: '28P01' });
      const response = await request(probe.app).get('/ready');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('not_ready');
      expect(response.body.checks.database).toMatchObject({ status: 'down', reason: '28P01' });
    });

    it('refuses new readiness while the pairing store is down', async () => {
      probe.setDatabase({ ok: false, reason: 'timeout' });
      const response = await request(probe.app).get('/ready');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('not_ready');
      expect(response.body.checks.database).toMatchObject({ status: 'down', reason: 'timeout' });
    });

    it.each(['/ready', '/health'])(
      'rechecks shutdown after an in-flight %s probe answers',
      async (path) => {
        let lifecycle: RelayLifecycle = 'ready';
        let answer: ((result: DatabaseProbe) => void) | undefined;
        const app = express();
        registerProbeRoutes(app, {
          lifecycle: () => lifecycle,
          database: createDatabaseCheck({
            probe: () =>
              new Promise<DatabaseProbe>((resolve) => {
                answer = resolve;
              }),
            ttlMs: 0,
          }),
          healthLimiter: (_req, _res, next) => next(),
          healthDetail: () => ({}),
        });
        const response = request(app)
          .get(path)
          .then((result) => result);
        for (let attempt = 0; attempt < 100 && !answer; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        expect(answer).toBeTypeOf('function');
        lifecycle = 'shutting_down';
        answer?.({ ok: true, latencyMs: 1 });
        expect((await response).status).toBe(503);
      },
    );

    it('returns 503 while shutting down', async () => {
      probe.setLifecycle('shutting_down');
      const response = await request(probe.app).get('/ready');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('shutting_down');
    });
  });

  describe('GET /health', () => {
    it('reports healthy with the database dependency', async () => {
      const response = await request(probe.app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.dependencies.database).toMatchObject({ status: 'ok' });
      expect(response.body).toHaveProperty('connections');
      expect(response.body.memory.unit).toBe('MB');
    });

    it('returns 503 degraded while the database is down', async () => {
      probe.setDatabase({ ok: false, reason: '42P01' });
      const response = await request(probe.app).get('/health');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('degraded');
      expect(response.body.dependencies.database).toMatchObject({
        status: 'down',
        reason: '42P01',
      });
    });

    it('reports starting before the store has answered', async () => {
      probe.setLifecycle('starting');
      const response = await request(probe.app).get('/health');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('starting');
    });

    it('should report shutting_down status when applicable', async () => {
      probe.setLifecycle('shutting_down');
      const response = await request(probe.app).get('/health');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('shutting_down');
    });

    it('names the deployment serving the response', async () => {
      const response = await request(probe.app).get('/health');

      expect(response.body.deployment).toEqual({
        target: 'fly',
        id: 'machine-7a1f',
        version: 'a1b2c3d4e5f6',
        region: 'sjc',
        environment: 'production',
      });
    });

    it('omits deployment fields the host does not set rather than inventing them', async () => {
      const bare = createProbeApp({});
      const response = await request(bare.app).get('/health');

      expect(response.body.deployment).toEqual({ target: 'local' });
      expect(JSON.stringify(response.body)).not.toContain('unknown');
    });
  });

  describe('automated readiness check', () => {
    function probeFetch(target: express.Application): typeof fetch {
      return (async (input: RequestInfo | URL) => {
        const path = new URL(String(input)).pathname;
        const response = await request(target).get(path);
        return new Response(JSON.stringify(response.body), {
          status: response.status,
          headers: { 'content-type': 'application/json' },
        });
      }) as typeof fetch;
    }

    it('passes and reports the deployment it reached', async () => {
      const report = await checkReadiness(['https://signal.example'], {
        fetchImpl: probeFetch(probe.app),
        attempts: 1,
      });

      expect(report.ready).toBe(true);
      expect(report.probes[0]?.deploymentId).toBe('machine-7a1f');
    });

    it('fails while the server is not ready, and retries before giving up', async () => {
      probe.setLifecycle('starting');
      const report = await checkReadiness(['https://signal.example'], {
        fetchImpl: probeFetch(probe.app),
        attempts: 3,
        sleep: async () => {},
      });

      expect(report.ready).toBe(false);
      expect(report.probes[0]?.attempts).toBe(3);
      expect(report.probes[0]?.failure).toBe('starting');
    });

    it('fails a deployment whose pairing store is down', async () => {
      probe.setDatabase({ ok: false, reason: 'unreachable' });
      const report = await checkReadiness(['https://signal.example'], {
        fetchImpl: probeFetch(probe.app),
        attempts: 1,
      });

      expect(report.ready).toBe(false);
      expect(report.probes[0]?.failure).toBe('degraded');
    });

    it('reports degraded when one deploy target is down and the other answers', async () => {
      const down = createProbeApp();
      down.setLifecycle('shutting_down');
      const routes = new Map([
        ['signal-a.example', probe.app],
        ['signal-b.example', down.app],
      ]);
      const fetchImpl = (async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        const target = routes.get(url.hostname);
        if (!target) throw new Error('unreachable');
        const response = await request(target).get(url.pathname);
        return new Response(JSON.stringify(response.body), {
          status: response.status,
          headers: { 'content-type': 'application/json' },
        });
      }) as typeof fetch;

      const report = await checkReadiness(
        ['https://signal-a.example', 'https://signal-b.example'],
        { fetchImpl, attempts: 1 },
      );

      expect(report.ready).toBe(false);
      expect(report.degraded).toBe(true);
      expect(report.probes.filter((entry) => entry.ok)).toHaveLength(1);
    });

    it('treats an unreachable endpoint as down rather than as ready', async () => {
      const report = await checkReadiness(['https://signal.example'], {
        fetchImpl: (async () => {
          throw new Error('ECONNREFUSED');
        }) as typeof fetch,
        attempts: 2,
        sleep: async () => {},
      });

      expect(report.ready).toBe(false);
      expect(report.degraded).toBe(false);
      expect(report.probes[0]?.failure).toBe('unreachable');
    });
  });
});

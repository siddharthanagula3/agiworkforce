import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { checkReadiness } from '../../src/readiness.js';
import { releaseIdentity } from '../../src/release.js';

const DEPLOY_ENV = {
  AGI_DEPLOYMENT_ID: 'machine-7a1f',
  AGI_RELEASE_SHA: 'a1b2c3d4e5f6',
  FLY_REGION: 'sjc',
  FLY_APP_NAME: 'agiworkforce-signaling',
  AGI_DEPLOY_ENV: 'production',
};

function createHealthTestApp(deployEnv: Record<string, string | undefined> = DEPLOY_ENV) {
  const app = express();
  const release = releaseIdentity(deployEnv);

  let isReady = true;
  let isShuttingDown = false;

  app.get('/live', (_req, res) => {
    res.status(200).json({ status: 'alive', timestamp: Date.now() });
  });

  app.get('/ready', (_req, res) => {
    if (isShuttingDown) {
      return res.status(503).json({ status: 'shutting_down', timestamp: Date.now() });
    }
    if (!isReady) {
      return res.status(503).json({ status: 'not_ready', timestamp: Date.now() });
    }
    return res.status(200).json({ status: 'ready', timestamp: Date.now() });
  });

  app.get('/health', (_req, res) => {
    const memUsage = process.memoryUsage();

    const healthStatus = {
      status: isShuttingDown ? 'shutting_down' : isReady ? 'healthy' : 'starting',
      uptime: process.uptime(),
      timestamp: Date.now(),
      deployment: release,
      connections: {
        total: 0,
        uniqueIps: 0,
      },
      sessions: {
        active: 0,
      },
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024),
        unit: 'MB',
      },
    };

    const httpStatus = isShuttingDown ? 503 : isReady ? 200 : 503;
    return res.status(httpStatus).json(healthStatus);
  });

  (app as express.Application & { setReady: (r: boolean) => void }).setReady = (r: boolean) => {
    isReady = r;
  };
  (app as express.Application & { setShuttingDown: (s: boolean) => void }).setShuttingDown = (
    s: boolean,
  ) => {
    isShuttingDown = s;
  };

  return app as express.Application & {
    setReady: (r: boolean) => void;
    setShuttingDown: (s: boolean) => void;
  };
}

describe('Health Endpoints', () => {
  let app: ReturnType<typeof createHealthTestApp>;

  beforeEach(() => {
    app = createHealthTestApp();
  });

  describe('GET /live', () => {
    it('should always return 200 if process is alive', async () => {
      const response = await request(app).get('/live');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('alive');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /ready', () => {
    it('should return 200 when server is ready', async () => {
      app.setReady(true);
      const response = await request(app).get('/ready');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ready');
    });

    it('should return 503 when server is not ready', async () => {
      app.setReady(false);
      const response = await request(app).get('/ready');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('not_ready');
    });

    it('should return 503 when server is shutting down', async () => {
      app.setShuttingDown(true);
      const response = await request(app).get('/ready');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('shutting_down');
    });
  });

  describe('GET /health', () => {
    it('should return detailed health information', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('connections');
      expect(response.body).toHaveProperty('sessions');
      expect(response.body).toHaveProperty('memory');
      expect(response.body.memory).toHaveProperty('heapUsed');
      expect(response.body.memory.unit).toBe('MB');
    });

    it('should include timestamp', async () => {
      const before = Date.now();
      const response = await request(app).get('/health');
      const after = Date.now();

      expect(response.body.timestamp).toBeGreaterThanOrEqual(before);
      expect(response.body.timestamp).toBeLessThanOrEqual(after);
    });

    it('should report shutting_down status when applicable', async () => {
      app.setShuttingDown(true);
      const response = await request(app).get('/health');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('shutting_down');
    });

    it('names the deployment serving the response', async () => {
      const response = await request(app).get('/health');

      expect(response.body.deployment).toEqual({
        target: 'fly',
        id: 'machine-7a1f',
        version: 'a1b2c3d4e5f6',
        region: 'sjc',
        environment: 'production',
      });
    });

    it('omits deployment fields the host does not set rather than inventing them', async () => {
      const bare = createHealthTestApp({});
      const response = await request(bare).get('/health');

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
        fetchImpl: probeFetch(app),
        attempts: 1,
      });

      expect(report.ready).toBe(true);
      expect(report.probes[0]?.deploymentId).toBe('machine-7a1f');
    });

    it('fails while the server is not ready, and retries before giving up', async () => {
      app.setReady(false);
      const report = await checkReadiness(['https://signal.example'], {
        fetchImpl: probeFetch(app),
        attempts: 3,
        sleep: async () => {},
      });

      expect(report.ready).toBe(false);
      expect(report.probes[0]?.attempts).toBe(3);
      expect(report.probes[0]?.failure).toBe('starting');
    });

    it('reports degraded when one deploy target is down and the other answers', async () => {
      const down = createHealthTestApp();
      down.setShuttingDown(true);
      const routes = new Map([
        ['signal-a.example', app],
        ['signal-b.example', down],
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
      expect(report.probes.filter((probe) => probe.ok)).toHaveLength(1);
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

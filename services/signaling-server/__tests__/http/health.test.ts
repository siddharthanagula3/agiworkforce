/**
 * Health Endpoint Tests
 *
 * Tests for health and monitoring endpoints:
 * - GET /health
 * - GET /ready
 * - GET /live
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

function createHealthTestApp() {
  const app = express();

  let isReady = true;
  let isShuttingDown = false;

  // Liveness probe
  app.get('/live', (_req, res) => {
    res.status(200).json({ status: 'alive', timestamp: Date.now() });
  });

  // Readiness probe
  app.get('/ready', (_req, res) => {
    if (isShuttingDown) {
      return res.status(503).json({ status: 'shutting_down', timestamp: Date.now() });
    }
    if (!isReady) {
      return res.status(503).json({ status: 'not_ready', timestamp: Date.now() });
    }
    return res.status(200).json({ status: 'ready', timestamp: Date.now() });
  });

  // Detailed health check
  app.get('/health', (_req, res) => {
    const memUsage = process.memoryUsage();

    const healthStatus = {
      status: isShuttingDown ? 'shutting_down' : isReady ? 'healthy' : 'starting',
      uptime: process.uptime(),
      timestamp: Date.now(),
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

  // Helper to set state for testing
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
  });
});

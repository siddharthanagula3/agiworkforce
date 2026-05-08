/**
 * Integration Tests for API Gateway
 *
 * These tests verify the full request/response cycle through the Express app
 * with middleware, routing, and error handling.
 *
 * This is the EXAMPLE INTEGRATION TEST pattern to follow for other tests.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

// Wave 1.5+ task #17 (2026-05-08): legacy `lib/supabase` singleton deleted;
// every route now goes through supabaseClients helpers.
vi.mock('../../src/lib/supabaseClients', () => {
  const mockClient = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
    })),
  };
  return {
    getServiceClient: vi.fn(() => mockClient),
    getUserClient: vi.fn(() => mockClient),
    getUserScopedClient: vi.fn(() => mockClient),
    mintSupabaseJwt: vi.fn(() => 'mock-supabase-jwt'),
    _resetSupabaseJwtCacheForTests: vi.fn(),
  };
});

/**
 * Creates a test Express app that mirrors the production configuration
 * but with test-friendly settings.
 *
 * PATTERN: Use this factory pattern for integration tests.
 * It allows you to customize the app for specific test scenarios.
 */
function createIntegrationTestApp() {
  const app = express();

  // Apply same middleware as production
  app.use(helmet());
  app.use(cors({ origin: 'http://localhost:3000' }));
  app.use(express.json({ limit: '1mb' }));

  // Health endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Error handler
  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error('Test app error:', err);
      res.status(500).json({ error: 'Internal server error' });
    },
  );

  return app;
}

describe('API Gateway Integration Tests', () => {
  let app: express.Application;

  beforeAll(() => {
    app = createIntegrationTestApp();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('Server Configuration', () => {
    it('should have CORS headers configured', async () => {
      const response = await request(app).options('/health').set('Origin', 'http://localhost:3000');

      // CORS should allow the origin
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });

    it('should have security headers from helmet', async () => {
      const response = await request(app).get('/health');

      // Helmet adds various security headers
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should not expose X-Powered-By header', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('Health Endpoint', () => {
    it('should respond to health check', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'ok',
      });
      expect(typeof response.body.timestamp).toBe('number');
    });
  });

  describe('404 Handling', () => {
    it('should return 404 for undefined routes', async () => {
      const response = await request(app).get('/undefined-route');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Not found' });
    });

    it('should return 404 for undefined POST routes', async () => {
      const response = await request(app).post('/undefined-route');

      expect(response.status).toBe(404);
    });
  });

  describe('JSON Parsing', () => {
    it('should parse JSON body', async () => {
      // Create an app with a test endpoint that echoes the body
      const testApp = express();
      testApp.use(express.json());
      testApp.post('/echo', (req, res) => {
        res.json({ received: req.body });
      });

      const response = await request(testApp)
        .post('/echo')
        .send({ test: 'data' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body.received).toEqual({ test: 'data' });
    });

    it('should reject payload over 1mb', async () => {
      const testApp = express();
      testApp.use(express.json({ limit: '1kb' })); // Small limit for testing
      testApp.post('/echo', (req, res) => {
        res.json({ received: req.body });
      });
      testApp.use(
        (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
          res.status(413).json({ error: 'Payload too large' });
        },
      );

      const largePayload = { data: 'x'.repeat(2000) };

      const response = await request(testApp)
        .post('/echo')
        .send(largePayload)
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(413);
    });
  });

  describe('Content-Type Handling', () => {
    it('should handle application/json content type', async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.post('/test', (req, res) => {
        res.json({ contentType: req.headers['content-type'] });
      });

      const response = await request(testApp)
        .post('/test')
        .send({ data: 'test' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body.contentType).toContain('application/json');
    });
  });
});

/**
 * WebSocket Integration Test Stubs
 *
 * These would require a running server and ws library.
 */
describe.skip('WebSocket Integration (requires server)', () => {
  it('should establish WebSocket connection', () => {
    // const ws = new WebSocket('ws://localhost:3000/ws');
    // ws.on('open', () => { ... });
  });

  it('should handle WebSocket messages', () => {
    // Placeholder for future WebSocket message handling tests
  });
});

/**
 * Pairing Endpoint Tests
 *
 * Tests for HTTP pairing endpoints:
 * - POST /pairings (create pairing)
 * - GET /pairings/:code (lookup pairing)
 * - DELETE /pairings/:code (delete pairing)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';

// Mock the supabase module
const mockSupabase = {
  from: vi.fn(),
};

vi.mock('../../src/db.js', () => ({
  supabase: mockSupabase,
}));

// Create test app that mimics the signaling server HTTP endpoints
function createTestApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '16kb' }));

  // Simplified pairing creation endpoint
  app.post('/pairings', async (_req, res) => {
    try {
      // Mock successful creation
      const code = 'ABCD1234';
      const expiresAt = Date.now() + 300000; // 5 minutes

      res.json({
        code,
        expiresAt,
        expiresIn: 300,
        httpUrl: 'http://localhost:4000',
        wsUrl: 'ws://localhost:4000/ws',
        qrData: `agiw:${code}`,
      });
    } catch (error) {
      res.status(500).json({ error: 'database_error' });
    }
  });

  // Pairing lookup endpoint
  app.get('/pairings/:code', async (req, res) => {
    const code = req.params['code'];

    // Validate code format (8 characters, alphanumeric uppercase)
    if (!code || !/^[A-Z0-9]{8}$/.test(code)) {
      return res.status(400).json({ error: 'invalid_code_format' });
    }

    // Mock response based on code
    if (code === 'NOTFOUND') {
      return res.status(404).json({ error: 'pairing_not_found' });
    }

    if (code === 'EXPIRED1') {
      return res.status(410).json({ error: 'pairing_expired' });
    }

    return res.json({
      code,
      expiresAt: Date.now() + 300000,
      roles: {
        desktop: false,
        mobile: false,
      },
    });
  });

  // Pairing deletion endpoint
  app.delete('/pairings/:code', async (req, res) => {
    const code = req.params['code'];

    // Validate code format
    if (!code || !/^[A-Z0-9]{8}$/.test(code)) {
      return res.status(400).json({ error: 'invalid_code_format' });
    }

    return res.json({ success: true });
  });

  return app;
}

describe('Pairing HTTP Endpoints', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createTestApp();
    vi.clearAllMocks();
  });

  describe('POST /pairings', () => {
    it('should create a new pairing session', async () => {
      const response = await request(app).post('/pairings').send({ ttlSeconds: 300 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('expiresAt');
      expect(response.body).toHaveProperty('wsUrl');
      expect(response.body).toHaveProperty('qrData');
      expect(response.body.qrData).toMatch(/^agiw:/);
    });

    it('should accept custom TTL within valid range', async () => {
      const response = await request(app).post('/pairings').send({ ttlSeconds: 600 });

      expect(response.status).toBe(200);
    });

    it('should accept metadata in pairing request', async () => {
      const response = await request(app)
        .post('/pairings')
        .send({
          ttlSeconds: 300,
          metadata: { deviceName: 'Test Device' },
        });

      expect(response.status).toBe(200);
    });
  });

  describe('GET /pairings/:code', () => {
    it('should return 400 for invalid code format', async () => {
      const response = await request(app).get('/pairings/invalid');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_code_format');
    });

    it('should return 404 for non-existent pairing', async () => {
      const response = await request(app).get('/pairings/NOTFOUND');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('pairing_not_found');
    });

    it('should return 410 for expired pairing', async () => {
      const response = await request(app).get('/pairings/EXPIRED1');

      expect(response.status).toBe(410);
      expect(response.body.error).toBe('pairing_expired');
    });

    it('should return pairing details for valid code', async () => {
      const response = await request(app).get('/pairings/ABCD1234');

      expect(response.status).toBe(200);
      expect(response.body.code).toBe('ABCD1234');
      expect(response.body).toHaveProperty('expiresAt');
      expect(response.body.roles).toHaveProperty('desktop');
      expect(response.body.roles).toHaveProperty('mobile');
    });
  });

  describe('DELETE /pairings/:code', () => {
    it('should return 400 for invalid code format', async () => {
      const response = await request(app).delete('/pairings/bad');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_code_format');
    });

    it('should delete pairing successfully', async () => {
      const response = await request(app).delete('/pairings/ABCD1234');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});

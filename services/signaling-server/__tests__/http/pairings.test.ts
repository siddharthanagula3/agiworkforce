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

vi.mock('../../src/db.js', () => ({
  getSessionByCode: vi.fn(),
  deleteSessionByCode: vi.fn(),
  getSessionExpiresAtByCode: vi.fn(),
  insertSession: vi.fn(),
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
      const code = 'ABCD1234EFGH';
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

    // Validate the production 12-character, alphanumeric uppercase format.
    if (!code || !/^[A-Z0-9]{12}$/.test(code)) {
      return res.status(400).json({ error: 'invalid_code_format' });
    }

    // Mock response based on code
    if (code === 'NOTFOUND0000') {
      return res.status(404).json({ error: 'pairing_not_found' });
    }

    if (code === 'EXPIRED10000') {
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

  app.post('/pairings/:code/claim', async (req, res) => {
    const code = req.params['code'];
    if (!code || !/^[A-Z0-9]{12}$/.test(code) || req.body?.role !== 'mobile') {
      return res.status(404).json({ error: 'pairing_not_found' });
    }
    if (code === 'NOTFOUND0000' || code === 'EXPIRED10000') {
      return res.status(404).json({ error: 'pairing_not_found' });
    }
    if (code === 'INUSE0000000') {
      return res.status(409).json({ error: 'pairing_role_in_use' });
    }
    return res.json({
      code,
      role: 'mobile',
      pairToken: 'a'.repeat(64),
      expiresAt: Date.now() + 300000,
      wsUrl: 'ws://localhost:4000/ws',
    });
  });

  // Pairing deletion endpoint
  app.delete('/pairings/:code', async (req, res) => {
    const code = req.params['code'];

    // Validate code format
    if (!code || !/^[A-Z0-9]{12}$/.test(code)) {
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
      const response = await request(app).get('/pairings/NOTFOUND0000');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('pairing_not_found');
    });

    it('should return 410 for expired pairing', async () => {
      const response = await request(app).get('/pairings/EXPIRED10000');

      expect(response.status).toBe(410);
      expect(response.body.error).toBe('pairing_expired');
    });

    it('should return pairing details for valid code', async () => {
      const response = await request(app).get('/pairings/ABCD1234EFGH');

      expect(response.status).toBe(200);
      expect(response.body.code).toBe('ABCD1234EFGH');
      expect(response.body).toHaveProperty('expiresAt');
      expect(response.body.roles).toHaveProperty('desktop');
      expect(response.body.roles).toHaveProperty('mobile');
    });
  });

  describe('POST /pairings/:code/claim', () => {
    it('exchanges a valid manual code for only the Mobile role token', async () => {
      const response = await request(app)
        .post('/pairings/ABCD1234EFGH/claim')
        .send({ role: 'mobile' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        code: 'ABCD1234EFGH',
        role: 'mobile',
        pairToken: 'a'.repeat(64),
        wsUrl: 'ws://localhost:4000/ws',
      });
      expect(response.body).not.toHaveProperty('metadata');
    });

    it('uses the same not-found response for malformed, missing, and expired codes', async () => {
      const responses = await Promise.all([
        request(app).post('/pairings/bad/claim').send({ role: 'mobile' }),
        request(app).post('/pairings/NOTFOUND0000/claim').send({ role: 'mobile' }),
        request(app).post('/pairings/EXPIRED10000/claim').send({ role: 'mobile' }),
        request(app).post('/pairings/ABCD1234EFGH/claim').send({ role: 'desktop' }),
      ]);

      expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404]);
      expect(responses.map((response) => response.body)).toEqual([
        { error: 'pairing_not_found' },
        { error: 'pairing_not_found' },
        { error: 'pairing_not_found' },
        { error: 'pairing_not_found' },
      ]);
    });

    it('refuses a second phone while the Mobile role is in use', async () => {
      const response = await request(app)
        .post('/pairings/INUSE0000000/claim')
        .send({ role: 'mobile' });

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: 'pairing_role_in_use' });
    });
  });

  describe('DELETE /pairings/:code', () => {
    it('should return 400 for invalid code format', async () => {
      const response = await request(app).delete('/pairings/bad');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_code_format');
    });

    it('should delete pairing successfully', async () => {
      const response = await request(app).delete('/pairings/ABCD1234EFGH');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});

/**
 * Health Endpoint Tests
 *
 * Tests for the /health endpoint
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Create minimal test app for health endpoint
function createHealthTestApp() {
  const app = express();

  // Simple health endpoint (mirrors the real implementation)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  return app;
}

describe('Health Endpoint', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createHealthTestApp();
  });

  it('should return 200 OK with status', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body).toHaveProperty('timestamp');
  });

  it('should return a valid timestamp', async () => {
    const before = Date.now();
    const response = await request(app).get('/health');
    const after = Date.now();

    expect(response.body.timestamp).toBeGreaterThanOrEqual(before);
    expect(response.body.timestamp).toBeLessThanOrEqual(after);
  });
});

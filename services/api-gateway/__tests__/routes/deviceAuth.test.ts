import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { deviceAuthRouter } from '../../src/routes/deviceAuth';
import { errorHandler } from '../../src/middleware/errorHandler';

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
}));

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth/device', deviceAuthRouter);
  app.use('/api/auth/device', deviceAuthRouter);
  app.use(errorHandler);
  return app;
}

describe('Device auth route mounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('serves device code flow on the CLI-compatible /auth/device path', async () => {
    const response = await request(createTestApp()).post('/auth/device/code').send({});

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      verification_uri: 'https://agiworkforce.com/auth/device',
      interval: 5,
      expires_in: 900,
    });
    expect(response.body.user_code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it('also serves device code flow on the /api/auth/device compatibility path', async () => {
    const response = await request(createTestApp()).post('/api/auth/device/code').send({});

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('device_code');
  });
});

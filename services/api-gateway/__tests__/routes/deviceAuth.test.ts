import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { deviceAuthRouter } from '../../src/routes/deviceAuth';
import { errorHandler } from '../../src/middleware/errorHandler';

const neonMock = vi.hoisted(() => {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn(() => ({ insert }));
  return { from, insert };
});

// routes/deviceAuth.ts uses getServiceClient() because the device-code
// bootstrap flow starts before the CLI has a cloud account token.
vi.mock('../../src/lib/neonClients', () => {
  const mockClient = {
    from: neonMock.from,
  };
  return {
    getServiceClient: vi.fn(() => mockClient),
    getUserClient: vi.fn(() => mockClient),
    getUserScopedClient: vi.fn(() => mockClient),
  };
});

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
    neonMock.insert.mockResolvedValue({ error: null });
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
    expect(neonMock.from).toHaveBeenCalledWith('device_authorization_codes');
    expect(neonMock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        device_id: response.body.device_code,
        device_type: 'cli',
        status: 'pending',
        user_code: response.body.user_code,
      }),
    );
  });

  it('also serves device code flow on the /api/auth/device compatibility path', async () => {
    const response = await request(createTestApp()).post('/api/auth/device/code').send({});

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('device_code');
  });
});

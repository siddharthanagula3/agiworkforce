import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../src/middleware/errorHandler';

const { buildProviderAdapter } = vi.hoisted(() => ({
  buildProviderAdapter: vi.fn(() => null),
}));

vi.mock('../../src/middleware/auth', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { userId: 'user-1', token: 'verified-token' };
    next();
  },
}));

vi.mock('../../src/middleware/planGate', () => ({
  requireManagedChatPlan: (req: Request, _res: Response, next: NextFunction) => {
    req.planTier = 'pro';
    next();
  },
}));

vi.mock('../../src/lib/providerAdapters', () => ({ buildProviderAdapter }));

const { cloudChatRouter } = await import('../../src/routes/cloudChat');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/cloud-chat', cloudChatRouter);
  app.use(errorHandler);
  return app;
}

describe('legacy cloud chat send route', () => {
  it('retires unmetered provider execution in favor of the canonical completion loop', async () => {
    const response = await request(createApp())
      .post('/api/cloud-chat/send')
      .send({ message: 'hello', model: 'gpt-5.4-nano' });

    expect(response.status).toBe(410);
    expect(response.body).toEqual({
      error: 'Legacy cloud chat execution is no longer available',
      code: 'CANONICAL_COMPLETION_REQUIRED',
      completion_url: '/api/llm/v1/chat/completions',
    });
    expect(buildProviderAdapter).not.toHaveBeenCalled();
  });
});

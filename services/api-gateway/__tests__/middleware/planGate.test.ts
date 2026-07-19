import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { tierState } = vi.hoisted(() => ({
  tierState: { planTier: 'free' as string, hasRow: true, error: null as Error | null },
}));

vi.mock('../../src/lib/neonClients', () => ({
  getUserScopedClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: tierState.error || !tierState.hasRow ? null : { plan_tier: tierState.planTier },
              error: tierState.error,
            }),
        }),
      }),
    }),
  })),
}));

const { requireManagedChatPlan } = await import('../../src/middleware/planGate');

function request(surface: 'app' | 'developer' = 'app'): Request {
  return {
    user: { userId: 'user-1', token: 'verified-token', surface },
  } as Request;
}

function response(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

describe('requireManagedChatPlan tier gate', () => {
  beforeEach(() => {
    tierState.planTier = 'free';
    tierState.hasRow = true;
    tierState.error = null;
  });

  it.each(['free', 'basic', 'pro', 'max', 'max_15x', 'team', 'enterprise'])(
    'admits canonical %s managed-chat subscriptions',
    async (planTier) => {
      tierState.planTier = planTier;
      const req = request();
      const res = response();
      const next = vi.fn() as NextFunction;

      await requireManagedChatPlan(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(req.planTier).toBe(planTier);
      expect(res.status).not.toHaveBeenCalled();
    },
  );

  it('treats a missing subscription row as the Free plan', async () => {
    tierState.hasRow = false;
    const req = request();
    const res = response();
    const next = vi.fn() as NextFunction;

    await requireManagedChatPlan(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.planTier).toBe('free');
  });

  it.each(['hobby', 'byok', 'local-only', 'unknown-plan'])(
    'fails closed for non-canonical managed tier %s',
    async (planTier) => {
      tierState.planTier = planTier;
      const res = response();
      const next = vi.fn() as NextFunction;

      await requireManagedChatPlan(request(), res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    },
  );

  it('fails closed when subscription lookup fails', async () => {
    tierState.error = new Error('database unavailable');
    const res = response();
    const next = vi.fn() as NextFunction;

    await requireManagedChatPlan(request(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
  });

  // Trusted developer surface (device-authorization token) requires Pro+.
  // A Basic caller cannot reach managed developer access via managed_chat.
  it.each(['free', 'basic'])(
    'blocks the developer surface on %s with a Pro upgrade gate',
    async (planTier) => {
      tierState.planTier = planTier;
      const res = response();
      const next = vi.fn() as NextFunction;

      await requireManagedChatPlan(request('developer'), res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'developer_surface_plan_required' }),
      );
    },
  );

  it.each(['pro', 'max', 'max_15x', 'team', 'enterprise'])(
    'admits the developer surface on %s',
    async (planTier) => {
      tierState.planTier = planTier;
      const req = request('developer');
      const res = response();
      const next = vi.fn() as NextFunction;

      await requireManagedChatPlan(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(req.planTier).toBe(planTier);
      expect(res.status).not.toHaveBeenCalled();
    },
  );

  it('still admits Basic on an app surface (managed_chat is unchanged)', async () => {
    tierState.planTier = 'basic';
    const req = request('app');
    const res = response();
    const next = vi.fn() as NextFunction;

    await requireManagedChatPlan(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.planTier).toBe('basic');
  });
});

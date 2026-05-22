import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import {
  buildManagedComputeEligibility,
  MANAGED_COMPUTE_BETA_HEADER,
  MANAGED_COMPUTE_ORG_HEADER,
  MANAGED_COMPUTE_PRIVATE_BETA_ENV,
  requireManagedComputeEligibility,
} from '../../src/middleware/managedComputeGate';

function createResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

describe('managedComputeGate', () => {
  const originalEnv = process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV];

  beforeEach(() => {
    vi.clearAllMocks();
    if (originalEnv === undefined) {
      delete process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV];
    } else {
      process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV] = originalEnv;
    }
  });

  it('fails closed while managed compute private beta is disabled', () => {
    delete process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV];
    const req = {
      user: { userId: 'user-1' },
      headers: {},
    } as Request;

    const eligibility = buildManagedComputeEligibility(req, {
      provider: 'openai',
      model: 'gpt-5.5',
    });

    expect(eligibility.allowed).toBe(false);
    expect(eligibility.denialCode).toBe('public_launch_blocked');
  });

  it('still requires an explicit private-beta request header when env is enabled', () => {
    process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV] = '1';
    const req = {
      user: { userId: 'user-1' },
      headers: { [MANAGED_COMPUTE_ORG_HEADER]: 'org-1' },
    } as Request;

    const eligibility = buildManagedComputeEligibility(req, {
      provider: 'anthropic',
      model: 'claude-opus-4.7',
    });

    expect(eligibility.allowed).toBe(false);
    expect(eligibility.denialCode).toBe('not_private_beta');
    expect(eligibility.organizationId).toBe('org-1');
  });

  it('allows explicitly marked private-beta requests when env is enabled', () => {
    process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV] = '1';
    const req = {
      user: { userId: 'user-1' },
      headers: {
        [MANAGED_COMPUTE_BETA_HEADER]: '1',
        [MANAGED_COMPUTE_ORG_HEADER]: 'org-1',
      },
    } as Request;

    const eligibility = buildManagedComputeEligibility(req, {
      provider: 'google',
      model: 'gemini-3.1-pro',
    });

    expect(eligibility.allowed).toBe(true);
    expect(eligibility.accountStatus).toBe('private_beta');
    expect(eligibility.organizationId).toBe('org-1');
  });

  it('returns 403 and does not call next for public managed-compute requests', () => {
    delete process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV];
    const req = {
      user: { userId: 'user-1' },
      headers: {},
    } as Request;
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    const middleware = requireManagedComputeEligibility(() => ({
      provider: 'openai',
      model: 'gpt-5.5',
    }));

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'public_launch_blocked',
        managed_compute: expect.objectContaining({ allowed: false }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next for explicit private-beta requests', () => {
    process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV] = '1';
    const req = {
      user: { userId: 'user-1' },
      headers: { [MANAGED_COMPUTE_BETA_HEADER]: '1' },
    } as Request;
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    const middleware = requireManagedComputeEligibility(() => ({
      provider: 'openai',
      model: 'gpt-5.5',
    }));

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.managedComputeEligibility?.allowed).toBe(true);
  });
});

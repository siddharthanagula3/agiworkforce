import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import {
  buildManagedComputeEligibility,
  isManagedComputePrivateBetaEnabled,
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

/**
 * SVC-GATEWAY-MANAGED-GATE-INVERTED-01: the gateway's gate used to require
 * `AGI_MANAGED_COMPUTE_PRIVATE_BETA === '1'` (closed by default) plus a
 * second `x-agi-managed-compute-beta: 1` header check. Both are retired —
 * managed compute is public alpha, open by default; the env var is an
 * incident-response kill-switch ONLY (0/false/off re-gates). These tests pin
 * the corrected ruling so the inversion can't silently come back.
 */
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

  // ── isManagedComputePrivateBetaEnabled — accepted-value parsing ──────────

  it('is open (true) when the env var is unset', () => {
    delete process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV];
    expect(isManagedComputePrivateBetaEnabled()).toBe(true);
  });

  it('is open (true) when the env var is "1"', () => {
    process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV] = '1';
    expect(isManagedComputePrivateBetaEnabled()).toBe(true);
  });

  it.each(['0', 'false', 'off', 'FALSE', 'Off', '  0  '])(
    'is gated (false) when the env var is %j',
    (value) => {
      process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV] = value;
      expect(isManagedComputePrivateBetaEnabled()).toBe(false);
    },
  );

  it('is open (true) for any other value (garbage strings never accidentally gate)', () => {
    process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV] = 'yes-please';
    expect(isManagedComputePrivateBetaEnabled()).toBe(true);
  });

  // ── buildManagedComputeEligibility ────────────────────────────────────────

  it('allows requests when the env is unset (public alpha, open by default)', () => {
    delete process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV];
    const req = {
      user: { userId: 'user-1' },
      headers: {},
    } as Request;

    const eligibility = buildManagedComputeEligibility(req, {
      provider: 'openai',
      model: 'gpt-5.5',
    });

    expect(eligibility.allowed).toBe(true);
    expect(eligibility.accountStatus).toBe('active');
  });

  it('allows requests when the env is explicitly "1"', () => {
    process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV] = '1';
    const req = {
      user: { userId: 'user-1' },
      headers: { [MANAGED_COMPUTE_ORG_HEADER]: 'org-1' },
    } as Request;

    const eligibility = buildManagedComputeEligibility(req, {
      provider: 'anthropic',
      model: 'claude-opus-4.8',
    });

    expect(eligibility.allowed).toBe(true);
    expect(eligibility.accountStatus).toBe('active');
    expect(eligibility.organizationId).toBe('org-1');
  });

  it('allows requests regardless of the legacy x-agi-managed-compute-beta header (now a no-op)', () => {
    // Regression guard: the retired second gate required this header to equal
    // '1'. It must no longer matter at all — present, absent, or any value.
    delete process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV];
    const withoutHeader = buildManagedComputeEligibility(
      { user: { userId: 'user-1' }, headers: {} } as Request,
      { provider: 'openai', model: 'gpt-5.5' },
    );
    const withWrongHeader = buildManagedComputeEligibility(
      { user: { userId: 'user-1' }, headers: { [MANAGED_COMPUTE_BETA_HEADER]: '0' } } as Request,
      { provider: 'openai', model: 'gpt-5.5' },
    );
    const withRightHeader = buildManagedComputeEligibility(
      { user: { userId: 'user-1' }, headers: { [MANAGED_COMPUTE_BETA_HEADER]: '1' } } as Request,
      { provider: 'openai', model: 'gpt-5.5' },
    );

    expect(withoutHeader.allowed).toBe(true);
    expect(withWrongHeader.allowed).toBe(true);
    expect(withRightHeader.allowed).toBe(true);
  });

  it.each(['0', 'false', 'off'])(
    'gates requests (denied) when the kill-switch env is %j',
    (value) => {
      process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV] = value;
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
      expect(eligibility.accountStatus).toBe('suspended');
    },
  );

  it('gives the kill-switch denial honest copy — never "waitlisted"/"private beta"', () => {
    process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV] = '0';
    const req = { user: { userId: 'user-1' }, headers: {} } as Request;

    const eligibility = buildManagedComputeEligibility(req, {
      provider: 'openai',
      model: 'gpt-5.5',
    });

    expect(eligibility.denialMessage).toBeDefined();
    expect(eligibility.denialMessage).toMatch(/temporarily unavailable/i);
    expect(eligibility.denialMessage?.toLowerCase()).not.toContain('waitlist');
    expect(eligibility.denialMessage?.toLowerCase()).not.toContain('private beta');
  });

  // ── requireManagedComputeEligibility middleware ───────────────────────────

  it('calls next() for open (default, no kill-switch) requests', () => {
    delete process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV];
    const req = { user: { userId: 'user-1' }, headers: {} } as Request;
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    const middleware = requireManagedComputeEligibility(() => ({
      provider: 'openai',
      model: 'gpt-5.5',
    }));

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.managedComputeEligibility?.allowed).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 with honest copy and does not call next() when the kill-switch is engaged', () => {
    process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV] = '0';
    const req = { user: { userId: 'user-1' }, headers: {} } as Request;
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
        error: expect.stringMatching(/temporarily unavailable/i),
        managed_compute: expect.objectContaining({ allowed: false }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});

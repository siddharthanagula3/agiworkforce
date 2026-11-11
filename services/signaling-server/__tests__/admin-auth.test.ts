import type { NextFunction, Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MAX_AUTH_FAILURES_DEFAULT } from '../src/constants.js';

const ADMIN_KEY = 'synthetic-admin-key';

type AdminAuth = typeof import('../src/middleware/adminAuth.js');

async function loadAdminAuth(env: Record<string, string | undefined>): Promise<AdminAuth> {
  vi.resetModules();
  vi.stubEnv('ADMIN_API_KEY', ADMIN_KEY);
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  return import('../src/middleware/adminAuth.js');
}

function attempt(auth: AdminAuth, headers: Record<string, string>, ip = '198.51.100.20') {
  let statusCode = 0;
  const res = {
    setHeader: vi.fn(),
    status(code: number) {
      statusCode = code;
      return this;
    },
    json: vi.fn(),
  } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  const req = { headers, socket: { remoteAddress: ip } } as unknown as Request;
  auth.adminAuthMiddleware(req, res, next);
  return { status: statusCode, passed: vi.mocked(next).mock.calls.length === 1 };
}

const WRONG = { authorization: 'Bearer wrong-key' };
const VALID = { 'x-api-key': ADMIN_KEY };

async function failuresBeforeLock(env: Record<string, string | undefined>): Promise<number> {
  const auth = await loadAdminAuth(env);
  let failures = 0;
  while (attempt(auth, WRONG).status === 401) failures += 1;
  return failures;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('admin auth lockout threshold', () => {
  it('locks after exactly one failure when the threshold is one', async () => {
    const auth = await loadAdminAuth({ MAX_AUTH_FAILURES: '1' });

    expect(attempt(auth, WRONG).status).toBe(401);
    expect(attempt(auth, WRONG).status).toBe(429);
    expect(attempt(auth, VALID)).toEqual({ status: 429, passed: false });
  });

  it('allows exactly the configured number of failures', async () => {
    expect(await failuresBeforeLock({ MAX_AUTH_FAILURES: '2' })).toBe(2);
    expect(await failuresBeforeLock({ MAX_AUTH_FAILURES: undefined })).toBe(
      MAX_AUTH_FAILURES_DEFAULT,
    );
  });

  it('counts a missing key as a failure', async () => {
    const auth = await loadAdminAuth({ MAX_AUTH_FAILURES: '1' });

    expect(attempt(auth, {}).status).toBe(401);
    expect(attempt(auth, VALID).status).toBe(429);
  });

  it('applies the threshold to the first failure of a new window', async () => {
    vi.useFakeTimers({ now: 0 });
    const auth = await loadAdminAuth({
      MAX_AUTH_FAILURES: '1',
      AUTH_FAILURE_WINDOW_MS: '1000',
      AUTH_LOCKOUT_DURATION_MS: '500',
    });

    expect(attempt(auth, WRONG).status).toBe(401);
    vi.setSystemTime(2_000);
    expect(attempt(auth, WRONG).status).toBe(401);
    expect(attempt(auth, WRONG).status).toBe(429);
  });

  it('admits a valid key after an ordinary failure and after the lock expires', async () => {
    vi.useFakeTimers({ now: 0 });
    const auth = await loadAdminAuth({ MAX_AUTH_FAILURES: '2', AUTH_LOCKOUT_DURATION_MS: '500' });

    expect(attempt(auth, WRONG).status).toBe(401);
    expect(attempt(auth, VALID).passed).toBe(true);
    expect(attempt(auth, WRONG).status).toBe(401);
    expect(attempt(auth, WRONG).status).toBe(401);
    expect(attempt(auth, VALID).status).toBe(429);
    vi.setSystemTime(501);
    expect(attempt(auth, VALID).passed).toBe(true);
  });
});

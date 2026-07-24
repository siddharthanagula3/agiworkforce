import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('server-only', () => ({}));

const { mockRateLimitHandler } = vi.hoisted(() => ({ mockRateLimitHandler: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({
  withRateLimitHandler:
    (handler: (...args: unknown[]) => unknown, key: string) =>
    (...args: unknown[]) => {
      mockRateLimitHandler(key);
      return handler(...args);
    },
}));

const mockClerkAuth = vi.fn(() => Promise.resolve({ userId: 'user-auth-id' }));
vi.mock('@clerk/nextjs/server', () => ({ auth: () => mockClerkAuth() }));

// assertAccountActive (getClerkAuthUser) reads account_status and fails closed on
// error; provide an active row so this suite exercises the route, not auth denial.
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: vi.fn().mockResolvedValue([{ account_status: 'active' }]) }),
}));

const mockDeductCredits = vi.fn();
vi.mock('@/lib/services/credit-service', () => ({
  CreditService: { deductCredits: (...args: unknown[]) => mockDeductCredits(...args) },
}));

import { POST } from '@/app/api/usage/deduct/route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/usage/deduct', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/usage/deduct', () => {
  beforeEach(() => {
    mockClerkAuth.mockClear();
    mockDeductCredits.mockClear();
    mockClerkAuth.mockResolvedValue({ userId: 'user-auth-id' });
  });

  it('stays authenticated', async () => {
    mockClerkAuth.mockRejectedValueOnce(new Error('Unauthorized'));

    const response = await POST(makeRequest({ amount_cents: 100 }));

    expect(response.status).toBe(401);
  });

  it('returns Gone without accepting a client-controlled deduction', async () => {
    const response = await POST(
      makeRequest({
        amount_cents: 1_000_000,
        description: 'client-selected charge',
        metadata: { conversion: 'private' },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body).toEqual({
      error: {
        code: 'ENDPOINT_RETIRED',
        message: 'Usage is recorded by managed operations.',
      },
    });
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it('remains rate limited', async () => {
    await POST(makeRequest({}));
    expect(mockRateLimitHandler).toHaveBeenCalledWith('usage-deduct');
  });

  it('has no Desktop caller that can submit raw usage', () => {
    const desktopSourceRoot = '../desktop/src';
    const sourceFiles: string[] = [];
    const visit = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) visit(path);
        else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) sourceFiles.push(path);
      }
    };
    visit(desktopSourceRoot);

    expect(
      sourceFiles.filter((path) => readFileSync(path, 'utf8').includes('/api/usage/deduct')),
    ).toEqual([]);
  });
});

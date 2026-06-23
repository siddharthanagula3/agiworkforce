/**
 * L1 Security - Privacy / Trust Boundaries
 *
 * Local, BYOK, and Managed Cloud are separate trust boundaries (CLAUDE.md).
 * These tests exercise the REAL boundary logic:
 *   - apps/web/lib/byok-access.ts        → Local provider classification
 *   - apps/web/lib/managed-compute-gate.ts → Managed Cloud is gated until the
 *                                            private-beta flag is set
 *
 * They verify that:
 *   1. Local providers are classified as Local (run on-device), never folded
 *      into a remote/BYOK bucket.
 *   2. Managed Cloud requests are blocked (403) unless the private-beta flag is
 *      explicitly enabled — i.e. no silent public routing to managed compute.
 *   3. The only exception (free-trial economy prompts) is opt-in per request.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { NextRequest } from 'next/server';
import { LOCAL_PROVIDER_KEYS } from '@/lib/byok-access';
import {
  buildManagedComputeGateResponse,
  isManagedComputePrivateBetaEnabled,
  MANAGED_COMPUTE_PRIVATE_BETA_ENV,
} from '@/lib/managed-compute-gate';

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/llm/v2/chat', { method: 'POST' });
}

describe('L1 Security - Privacy Boundaries (Local)', () => {
  test('SECURITY: on-device providers are classified as Local', () => {
    // These run fully on the user's device — they must be in the Local set.
    for (const localKey of ['local', 'ollama', 'lmstudio', 'executorch', 'llamacpp']) {
      expect(LOCAL_PROVIDER_KEYS.has(localKey)).toBe(true);
    }
  });

  test('SECURITY: remote/managed providers are NOT classified as Local', () => {
    // Routing any of these as "Local" would leak chats off-device — must be false.
    for (const remoteKey of ['openai', 'anthropic', 'google', 'managed_cloud', 'byok']) {
      expect(LOCAL_PROVIDER_KEYS.has(remoteKey)).toBe(false);
    }
  });
});

describe('L1 Security - Privacy Boundaries (Managed Cloud gate)', () => {
  const originalFlag = process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV];
    } else {
      process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV] = originalFlag;
    }
  });

  test('SECURITY: managed compute is blocked (403) when private-beta flag is off', () => {
    delete process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV];
    expect(isManagedComputePrivateBetaEnabled()).toBe(false);

    const res = buildManagedComputeGateResponse(makeRequest(), {
      provider: 'anthropic',
      model: 'claude-opus-4-8',
      feature: 'chat',
    });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  test('SECURITY: blocked response carries the public-launch-blocked code (no silent route)', async () => {
    delete process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV];
    const res = buildManagedComputeGateResponse(makeRequest(), {
      provider: 'openai',
      model: 'gpt-5.5',
    });
    const json = await res!.json();
    expect(json.error.code).toBe('public_launch_blocked');
    expect(json.managed_compute.allowed).toBe(false);
  });

  test('HAPPY_PATH: managed compute is allowed (gate returns null) when flag is on', () => {
    process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV] = '1';
    expect(isManagedComputePrivateBetaEnabled()).toBe(true);

    const res = buildManagedComputeGateResponse(makeRequest(), {
      provider: 'anthropic',
      model: 'claude-opus-4-8',
    });
    // null === gate passed; the route may proceed.
    expect(res).toBeNull();
  });

  test('SECURITY: free-trial economy prompt is the only opt-in exception when flag is off', () => {
    delete process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV];
    const res = buildManagedComputeGateResponse(makeRequest(), {
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      isFreeTrial: true,
    });
    // Explicit per-request opt-in lets brand-new users try the product.
    expect(res).toBeNull();
  });
});

/**
 * L1 Security - Privacy / Trust Boundaries
 *
 * Local, BYOK, and Managed Cloud are separate trust boundaries (CLAUDE.md).
 * These tests exercise the REAL boundary logic:
 *   - apps/web/lib/byok-access.ts        → Local provider classification
 *   - apps/web/lib/managed-compute-gate.ts → Managed Cloud is open by default
 *                                            (public alpha, 2026-06-27); the
 *                                            AGI_MANAGED_COMPUTE_PRIVATE_BETA
 *                                            env is an incident kill-switch
 *
 * They verify that:
 *   1. Local providers are classified as Local (run on-device), never folded
 *      into a remote/BYOK bucket.
 *   2. Managed Cloud requests are blocked (403) only when the kill-switch env
 *      re-gates access ('0'/'false'/'off'); open by default otherwise — and
 *      Local is never silently routed to managed compute.
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
  return new NextRequest('http://localhost/api/llm/v1/chat/completions', { method: 'POST' });
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

  test('PUBLIC_ALPHA: managed compute is open by default (no private-beta gate)', () => {
    // Public Alpha (2026-06-27): the private-beta launch gate was removed.
    // Unset env => managed compute is GA/open and the gate returns null.
    delete process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV];
    expect(isManagedComputePrivateBetaEnabled()).toBe(true);

    const res = buildManagedComputeGateResponse(makeRequest(), {
      provider: 'anthropic',
      model: 'fixture-model',
      feature: 'chat',
    });
    expect(res).toBeNull();
  });

  test('KILL_SWITCH: managed compute re-gates (403, public-launch-blocked) when env set to 0', async () => {
    // The env var is retained as an incident-response kill-switch.
    process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV] = '0';
    expect(isManagedComputePrivateBetaEnabled()).toBe(false);

    const res = buildManagedComputeGateResponse(makeRequest(), {
      provider: 'openai',
      model: 'fixture-model',
    });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    const json = await res!.json();
    expect(json.error.code).toBe('public_launch_blocked');
    expect(json.managed_compute.allowed).toBe(false);
  });

  test('HAPPY_PATH: managed compute is allowed (gate returns null) when flag is on', () => {
    process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV] = '1';
    expect(isManagedComputePrivateBetaEnabled()).toBe(true);

    const res = buildManagedComputeGateResponse(makeRequest(), {
      provider: 'anthropic',
      model: 'fixture-model',
    });
    // null === gate passed; the route may proceed.
    expect(res).toBeNull();
  });

  test('SECURITY: the kill-switch refuses free-trial prompts too, with no carve-out', () => {
    // INVERTED 2026-08-08 by founder decision. Previously asserted that a
    // free-trial prompt was ALLOWED through an engaged kill-switch, which was
    // correct while this flag gated the private-beta launch. Since 2026-06-27
    // it is the incident-response kill-switch, and the gateway
    // (services/api-gateway/src/middleware/managedComputeGate.ts) already
    // blocked everything — so the two surfaces disagreed about what "engaged"
    // meant, with web still serving the traffic class cheapest to create in
    // bulk. A partial kill is the failure mode a kill-switch exists to prevent.
    process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV] = '0';
    const res = buildManagedComputeGateResponse(makeRequest(), {
      provider: 'anthropic',
      model: 'fixture-model',
      isFreeTrial: true,
    });
    expect(res).not.toBeNull();
    expect(res?.status).toBe(403);
  });
});

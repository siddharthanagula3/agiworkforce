
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
    for (const localKey of ['local', 'ollama', 'lmstudio', 'executorch', 'llamacpp']) {
      expect(LOCAL_PROVIDER_KEYS.has(localKey)).toBe(true);
    }
  });

  test('SECURITY: remote/managed providers are NOT classified as Local', () => {
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
    expect(res).toBeNull();
  });

  test('SECURITY: the kill-switch refuses free-trial prompts too, with no carve-out', () => {
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

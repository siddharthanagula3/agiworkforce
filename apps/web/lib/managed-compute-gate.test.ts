import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  buildManagedComputeGateResponse,
  MANAGED_COMPUTE_ORG_HEADER,
  MANAGED_COMPUTE_PRIVATE_BETA_ENV,
} from './managed-compute-gate';

function request(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/llm/v1/chat/completions', { headers });
}

describe('web managed compute gate', () => {
  beforeEach(() => {
    delete process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV];
  });

  it('fails closed when managed compute private beta is disabled', async () => {
    const response = buildManagedComputeGateResponse(request(), {
      provider: 'openai',
      model: 'gpt-test',
    });

    expect(response?.status).toBe(403);
    const body = await response!.json();
    expect(body.error.code).toBe('public_launch_blocked');
    expect(body.managed_compute.allowed).toBe(false);
  });

  it('allows requests when the server private-beta flag is enabled', () => {
    process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV] = '1';
    const response = buildManagedComputeGateResponse(
      request({ [MANAGED_COMPUTE_ORG_HEADER]: 'org-1' }),
      {
        provider: 'anthropic',
        model: 'claude-test',
      },
    );

    expect(response).toBeNull();
  });

  it('allows a free-trial request through even when the private-beta flag is disabled', () => {
    // This is the path the free-tier/demo chat relies on: gpt-5.4-mini is a
    // managed-compute model, the prod private-beta flag is NOT set, yet free
    // users must still be able to chat. The route sets isFreeTrial=true for
    // free/no-subscription users (route.ts), which must bypass the gate.
    delete process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV];
    const response = buildManagedComputeGateResponse(request(), {
      provider: 'openai',
      model: 'gpt-5.4-mini',
      isFreeTrial: true,
    });

    expect(response).toBeNull();
  });
});

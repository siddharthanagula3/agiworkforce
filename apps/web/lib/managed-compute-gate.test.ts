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

  it('is open by default (public alpha — no private-beta gate)', () => {
    // Public Alpha (2026-06-27): the private-beta launch gate was removed.
    // With the env var unset, managed compute is GA/open and the gate allows.
    const response = buildManagedComputeGateResponse(request(), {
      provider: 'openai',
      model: 'gpt-test',
    });

    expect(response).toBeNull();
  });

  it('allows requests when the env is explicitly enabled (1)', () => {
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

  it('re-gates (403) when the kill-switch env is set to 0', async () => {
    // The env var is retained as an incident-response kill-switch. Setting it to
    // '0'/'false'/'off' re-closes the gate.
    process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV] = '0';
    const response = buildManagedComputeGateResponse(request(), {
      provider: 'openai',
      model: 'gpt-test',
    });

    expect(response?.status).toBe(403);
    const body = await response!.json();
    expect(body.error.code).toBe('public_launch_blocked');
    expect(body.managed_compute.allowed).toBe(false);
  });

  it('allows a free-trial request through even when the kill-switch is engaged', () => {
    // Free-tier chat must work even if an operator re-engages the kill-switch.
    process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV] = '0';
    const response = buildManagedComputeGateResponse(request(), {
      provider: 'openai',
      model: 'gpt-5.4-mini',
      isFreeTrial: true,
    });

    expect(response).toBeNull();
  });
});

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
    const response = buildManagedComputeGateResponse(request(), {
      provider: 'openai',
      model: 'fixture-model',
    });

    expect(response).toBeNull();
  });

  it('allows requests when the env is explicitly enabled (1)', () => {
    process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV] = '1';
    const response = buildManagedComputeGateResponse(
      request({ [MANAGED_COMPUTE_ORG_HEADER]: 'org-1' }),
      {
        provider: 'anthropic',
        model: 'fixture-model',
      },
    );

    expect(response).toBeNull();
  });

  it('re-gates (403) when the kill-switch env is set to 0', async () => {
    process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV] = '0';
    const response = buildManagedComputeGateResponse(request(), {
      provider: 'openai',
      model: 'fixture-model',
    });

    expect(response?.status).toBe(403);
    const body = await response!.json();
    expect(body.error.code).toBe('public_launch_blocked');
    expect(body.managed_compute.allowed).toBe(false);
  });

  it('refuses a free-trial request too when the kill-switch is engaged', () => {
    process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV] = '0';
    const response = buildManagedComputeGateResponse(request(), {
      provider: 'openai',
      model: 'fixture-model',
      isFreeTrial: true,
    });

    expect(response).not.toBeNull();
    expect(response?.status).toBe(403);
  });

  it('still allows free-trial requests when the kill-switch is NOT engaged', () => {
    delete process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV];
    const response = buildManagedComputeGateResponse(request(), {
      provider: 'openai',
      model: 'fixture-model',
      isFreeTrial: true,
    });

    expect(response).toBeNull();
  });
});

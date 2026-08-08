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

  it('refuses a free-trial request too when the kill-switch is engaged', () => {
    // INVERTED 2026-08-08 by founder decision, and the inversion is the point.
    //
    // This test previously asserted the opposite, and was right to while this
    // flag was the private-beta LAUNCH GATE — exempting trials let new users
    // chat without the env var set. The 2026-06-27 decision repurposed the same
    // flag as the incident-response kill-switch and the exemption was never
    // revisited, so web kept serving free-trial traffic while the gateway
    // blocked everything. An operator flipping the switch during an abuse wave
    // got the cheapest-to-create traffic class still flowing.
    //
    // A kill-switch with a carve-out is the failure mode kill-switches exist to
    // avoid. Engaging it now stops onboarding too.
    process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV] = '0';
    const response = buildManagedComputeGateResponse(request(), {
      provider: 'openai',
      model: 'gpt-5.6-terra',
      isFreeTrial: true,
    });

    expect(response).not.toBeNull();
    expect(response?.status).toBe(403);
  });

  it('still allows free-trial requests when the kill-switch is NOT engaged', () => {
    // The switch is off by default (public alpha), so the ordinary path must be
    // untouched by the change above — this is what proves the inversion did not
    // simply break free-tier chat.
    delete process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV];
    const response = buildManagedComputeGateResponse(request(), {
      provider: 'openai',
      model: 'gpt-5.6-terra',
      isFreeTrial: true,
    });

    expect(response).toBeNull();
  });
});

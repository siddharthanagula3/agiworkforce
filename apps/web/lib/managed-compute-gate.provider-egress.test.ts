import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ recordAuditEvent: vi.fn(async () => undefined) }));

vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mocks.recordAuditEvent }));

import { buildProviderEgressGateResponse } from './managed-compute-gate';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('provider egress gate', () => {
  it('allows a managed turn on the platform key', async () => {
    const response = await buildProviderEgressGateResponse({
      mode: 'managed',
      surface: 'web',
      userId: 'user_1',
      routeKeyAttribution: 'platform-key',
    });

    expect(response).toBeNull();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('refuses a platform key for a BYOK caller and records the refusal', async () => {
    const response = await buildProviderEgressGateResponse({
      mode: 'byok',
      surface: 'web',
      userId: 'user_1',
      routeKeyAttribution: 'platform-key',
    });

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toMatchObject({
      error: { code: 'platform_key_not_permitted', type: 'trust_boundary' },
      trust_mode: { mode: 'byok', allowed: false, reason: 'platform-key-not-permitted' },
    });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'provider_egress_refused',
        outcome: 'denied',
        retentionClass: 'security',
      }),
    );
  });

  it('refuses an unapproved fallback in Local and allows the approved one', async () => {
    const refused = await buildProviderEgressGateResponse({
      mode: 'local',
      surface: 'desktop',
      userId: 'user_1',
      routeKeyAttribution: 'none',
      isFallback: true,
    });
    expect(refused?.status).toBe(403);
    await expect(refused?.json()).resolves.toMatchObject({
      error: { code: 'fallback_needs_approval' },
    });

    const approved = await buildProviderEgressGateResponse({
      mode: 'local',
      surface: 'desktop',
      userId: 'user_1',
      routeKeyAttribution: 'none',
      isFallback: true,
      fallbackApproved: true,
    });
    expect(approved).toBeNull();
  });

  it('reads an unknown mode as the strictest one rather than the loosest', async () => {
    const response = await buildProviderEgressGateResponse({
      mode: 'not-a-mode',
      surface: 'web',
      userId: null,
      routeKeyAttribution: 'platform-key',
      isFallback: true,
    });

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toMatchObject({ trust_mode: { mode: 'local' } });
  });

  it('refuses a payload carrying a credential in every mode', async () => {
    const response = await buildProviderEgressGateResponse({
      mode: 'managed',
      surface: 'web',
      userId: 'user_1',
      routeKeyAttribution: 'platform-key',
      payload: `here is my key ${['sk', 'live', 'x'.repeat(24)].join('_')}`,
    });

    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toMatchObject({
      error: { code: 'secret_in_payload' },
    });
  });
});

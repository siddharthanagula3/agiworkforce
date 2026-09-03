import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  resolveIpAllowListPolicy: vi.fn(),
  recordAuditEvent: vi.fn(async (_event: unknown) => undefined),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn(() => ({})) }));
vi.mock('@/lib/services/organization-policy-gate', () => ({
  resolveIpAllowListPolicy: mocks.resolveIpAllowListPolicy,
}));
vi.mock('@/lib/security-audit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security-audit')>();
  return { ...actual, recordAuditEvent: mocks.recordAuditEvent };
});

const { assertIpAllowList, isIpNotAllowedError } = await import('../ip-allow-list-gate');

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

function requestFromIp(forwardedFor: string): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/usage', {
    headers: { 'x-forwarded-for': forwardedFor },
  });
}

describe('assertIpAllowList', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves for a personal-scope request regardless of client ip', async () => {
    mocks.resolveIpAllowListPolicy.mockResolvedValue({ cidrs: [], organizationId: null });

    await expect(
      assertIpAllowList('user-1', requestFromIp('198.51.100.9')),
    ).resolves.toBeUndefined();
  });

  it('resolves when the workspace has an empty allow list', async () => {
    mocks.resolveIpAllowListPolicy.mockResolvedValue({
      cidrs: [],
      organizationId: ORGANIZATION_ID,
    });

    await expect(
      assertIpAllowList('user-1', requestFromIp('198.51.100.9')),
    ).resolves.toBeUndefined();
  });

  it('resolves for an IPv4 caller inside the allowed subnet', async () => {
    mocks.resolveIpAllowListPolicy.mockResolvedValue({
      cidrs: ['203.0.113.0/24'],
      organizationId: ORGANIZATION_ID,
    });

    await expect(
      assertIpAllowList('user-1', requestFromIp('203.0.113.5')),
    ).resolves.toBeUndefined();
  });

  it('resolves for an IPv6 caller inside the allowed subnet', async () => {
    mocks.resolveIpAllowListPolicy.mockResolvedValue({
      cidrs: ['2001:db8::/32'],
      organizationId: ORGANIZATION_ID,
    });

    await expect(
      assertIpAllowList('user-1', requestFromIp('2001:db8::1')),
    ).resolves.toBeUndefined();
  });

  it('throws a recognizable, plain-copy error for a caller outside every allowed subnet', async () => {
    mocks.resolveIpAllowListPolicy.mockResolvedValue({
      cidrs: ['203.0.113.0/24'],
      organizationId: ORGANIZATION_ID,
    });

    let caught: unknown;
    try {
      await assertIpAllowList('user-1', requestFromIp('198.51.100.9'));
    } catch (error) {
      caught = error;
    }

    expect(isIpNotAllowedError(caught)).toBe(true);
    expect((caught as Error).message).toContain('network');
  });

  it('records a denial audit event naming the resource, never the raw decision detail beyond status', async () => {
    mocks.resolveIpAllowListPolicy.mockResolvedValue({
      cidrs: ['203.0.113.0/24'],
      organizationId: ORGANIZATION_ID,
    });

    await assertIpAllowList('user-1', requestFromIp('198.51.100.9')).catch(() => undefined);

    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
    const event = mocks.recordAuditEvent.mock.calls[0]![0] as {
      eventType: string;
      organizationId: string;
      outcome: string;
    };
    expect(event.eventType).toBe('ip_not_allowed');
    expect(event.organizationId).toBe(ORGANIZATION_ID);
    expect(event.outcome).toBe('denied');
  });

  it('is not fooled by a spoofed leading x-forwarded-for entry; only the last hop is trusted', async () => {
    mocks.resolveIpAllowListPolicy.mockResolvedValue({
      cidrs: ['203.0.113.0/24'],
      organizationId: ORGANIZATION_ID,
    });

    // A client can set any prefix on x-forwarded-for; the edge appends the real
    // connecting address as the LAST hop. A spoofed "allowed" address up front
    // must not grant access for the real, non-allowed connecting address.
    const request = requestFromIp('203.0.113.5, 198.51.100.9');

    await expect(assertIpAllowList('user-1', request)).rejects.toSatisfy((error: unknown) =>
      isIpNotAllowedError(error),
    );
  });
});

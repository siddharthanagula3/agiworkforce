import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveComplianceCaller: vi.fn(),
  readOrganizationPolicy: vi.fn(),
  evaluateOrganizationPolicy: vi.fn(),
  recordAuditEvent: vi.fn(async () => undefined),
  iterate: vi.fn(),
  withRateLimit: vi.fn(async () => null),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/error-handler', () => ({
  withErrorHandler:
    (handler: (request: unknown) => Promise<Response>) =>
    async (request: unknown): Promise<Response> => {
      try {
        return await handler(request);
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode ?? 500;
        return new Response(JSON.stringify({ error: (error as Error).message }), { status });
      }
    },
}));
vi.mock('@/lib/cors', () => ({ handleCorsPreflightRequest: () => null }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mocks.recordAuditEvent }));
vi.mock('@/lib/server/compliance-caller', () => ({
  resolveComplianceCaller: mocks.resolveComplianceCaller,
}));
vi.mock('@/lib/services/organization-policy-service', () => ({
  readOrganizationPolicy: mocks.readOrganizationPolicy,
}));
vi.mock('@/lib/services/organization-policy-evaluator', () => ({
  evaluateOrganizationPolicy: mocks.evaluateOrganizationPolicy,
}));
vi.mock('@/lib/services/enterprise-audit-service', () => ({
  iterateAuditEventsForExport: mocks.iterate,
}));

import { GET } from '../route';

const ORGANIZATION_ID = 'org_1';

function request(query = ''): never {
  return new Request(
    `https://agiworkforce.com/api/settings/organization/audit/export${query}`,
  ) as never;
}

async function linesOf(response: Response): Promise<string[]> {
  return (await response.text()).split('\n').filter((line) => line !== '');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.resolveComplianceCaller.mockResolvedValue({
    db: { query: vi.fn() },
    actorUserId: 'user_admin',
    organizationId: ORGANIZATION_ID,
    role: 'admin',
  });
  mocks.readOrganizationPolicy.mockResolvedValue(null);
  mocks.iterate.mockImplementation(async function* stream() {
    yield [{ id: 'evt-1', action: 'member.invited' }];
    yield [{ id: 'evt-2', action: 'member.removed' }];
  });
});

describe('organization audit export', () => {
  it('streams every batch the reader yields, one event per line', async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/x-ndjson');
    expect(await linesOf(response)).toEqual([
      '{"id":"evt-1","action":"member.invited"}',
      '{"id":"evt-2","action":"member.removed"}',
    ]);
  });

  it('is served behind the caller’s own authorization, with no link to hand on', async () => {
    const response = await GET(request());
    const body = await response.text();

    expect(mocks.resolveComplianceCaller).toHaveBeenCalledWith(
      expect.anything(),
      'audit.read',
      expect.any(String),
    );
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Disposition')).toContain('attachment');
    expect(body).not.toMatch(/X-Amz-Signature|X-Amz-Expires/i);
  });

  it('records the read before the stream opens, so a truncated export still leaves evidence', async () => {
    await GET(request('?action=member.invited'));

    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'data_exported',
        outcome: 'success',
        detail: expect.objectContaining({ changedKeys: ['action'] }),
      }),
    );
  });

  it('refuses when the workspace policy switches export off, and says so in the trail', async () => {
    mocks.readOrganizationPolicy.mockResolvedValue({ resources: {} });
    mocks.evaluateOrganizationPolicy.mockReturnValue({
      allowed: false,
      code: 'audit_export_disabled',
      reason: 'Audit export is disabled for this workspace.',
    });

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(mocks.iterate).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'denied' }),
    );
  });

  it('refuses a range that ends before it starts', async () => {
    const response = await GET(request('?from=2026-09-02T00:00:00Z&to=2026-09-01T00:00:00Z'));

    expect(response.status).toBe(400);
    expect(mocks.iterate).not.toHaveBeenCalled();
  });
});

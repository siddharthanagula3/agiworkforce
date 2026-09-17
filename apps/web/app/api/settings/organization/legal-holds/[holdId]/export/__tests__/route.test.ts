import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  resolveCaller: vi.fn(),
  recordAuditEvent: vi.fn(async (_event: unknown) => undefined),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mocks.query(...args) }),
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: mocks.recordAuditEvent,
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/lib/server/compliance-caller', () => ({
  resolveComplianceCaller: mocks.resolveCaller,
}));

import { GET } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';
const HOLD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function holdRow(scope: 'organization' | 'member', subject: string | null) {
  return {
    id: HOLD,
    organization_id: ORG,
    name: 'Matter 9',
    reason: null,
    scope,
    subject_user_id: subject,
    created_by_user_id: 'admin',
    released_at: null,
    released_by_user_id: null,
    created_at: '2026-09-01T00:00:00.000Z',
  };
}

function call(holdId = HOLD) {
  return GET(new Request(`https://app.test/api/x/${holdId}/export`) as never, {
    params: Promise.resolve({ holdId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveCaller.mockResolvedValue({
    kind: 'admin_api_key',
    actorUserId: 'admin_api_key:key-1',
    organizationId: ORG,
    role: 'admin_api_key',
  });
});

describe('GET legal hold eDiscovery export', () => {
  it('streams the held member records as JSONL and records the export first', async () => {
    mocks.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (/from public\.legal_holds/.test(sql)) return [holdRow('member', 'held-user')];
      if (/from public\.web_conversations c\s+where/.test(sql)) {
        expect(params.slice(0, 2)).toEqual([ORG, 'held-user']);
        return [{ id: 'c1', user_id: 'held-user', title: 'Deal', created_at: '2026-01-01' }];
      }
      if (/from public\.web_messages/.test(sql)) {
        return [
          {
            id: 'm1',
            conversation_id: 'c1',
            role: 'user',
            content: 'hi',
            created_at: '2026-01-01',
          },
        ];
      }
      return [];
    });

    const res = await call();
    const lines = (await res.text())
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/ndjson/);
    expect(lines.map((line) => line.type)).toEqual(['hold', 'conversation', 'message']);
    expect(mocks.resolveCaller).toHaveBeenCalledWith(
      expect.anything(),
      'content.govern',
      expect.any(String),
    );
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'ediscovery_export',
        userId: 'admin_api_key:key-1',
        severity: 'critical',
      }),
    );
  });

  it('exports the whole workspace for an organization-wide hold', async () => {
    const subjects: unknown[] = [];
    mocks.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (/from public\.legal_holds/.test(sql)) return [holdRow('organization', null)];
      subjects.push(params[1]);
      return [];
    });

    await (await call()).text();

    expect(subjects.length).toBeGreaterThan(0);
    expect(subjects.every((subject) => subject === null)).toBe(true);
  });

  it('answers 404 for a hold in another workspace and exports nothing', async () => {
    mocks.query.mockResolvedValue([]);

    const res = await call();

    expect(res.status).toBe(404);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('rejects a malformed hold id before authorizing', async () => {
    const res = await call('nope');

    expect(res.status).toBe(400);
    expect(mocks.resolveCaller).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  sendSupportEmail: vi.fn(),
  logSecurityEvent: vi.fn(async () => undefined),
  loggerError: vi.fn(),
}));

vi.hoisted(() => {
  process.env['AGI_SUPPORT_FALLBACK_EMAIL'] = 'ip-ops@agiworkforce.com';
  process.env['AGI_SUPPORT_FROM_EMAIL'] = 'support@agiworkforce.com';
  process.env['RESEND_API_KEY'] = 'test-resend-key';
  process.env['ALLOWED_ORIGINS'] = 'https://agiworkforce.com';
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: null })) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: mocks.loggerError, debug: vi.fn() },
}));
vi.mock('@/lib/support/handoff/resend-client', () => ({
  sendSupportEmail: mocks.sendSupportEmail,
}));
vi.mock('@/lib/security-audit', () => ({
  logSecurityEvent: mocks.logSecurityEvent,
  getClientIp: () => '203.0.113.9',
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));

const { db } = vi.hoisted(() => ({ db: { current: null as unknown } }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => db.current }));

const recordCopyrightNotice = vi.fn(async () => ({ reference: 'REF' }));
vi.mock('@/lib/server/copyright-notices', () => ({
  recordCopyrightNotice: (...args: Parameters<typeof recordCopyrightNotice>) =>
    recordCopyrightNotice(...args),
}));

import { POST } from '../route';

const SHARE_TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ARTIFACT_TOKEN = 'bbbbbbbbbbbbbbbbbbbbbbbb';

type Row = Record<string, unknown>;

function seed() {
  return {
    shares: [
      {
        token: SHARE_TOKEN,
        owner_id: 'user-owner',
        title: 'Leaked chat',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ] as Row[],
    artifacts: [
      {
        token: ARTIFACT_TOKEN,
        user_id: 'user-publisher',
        title: 'Infringing page',
        created_at: '2026-02-02T00:00:00.000Z',
      },
    ] as Row[],
  };
}

function fakeDb(state: ReturnType<typeof seed>) {
  return {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      const token = params[0] as string;
      const table = sql.includes('shared_sessions') ? state.shares : state.artifacts;
      return table.filter((row) => row['token'] === token);
    }),
    execute: vi.fn(async () => 0),
  };
}

const NOTICE = {
  contentUrl: `https://agiworkforce.com/share/${SHARE_TOKEN}`,
  reporterName: 'Ada Rightsholder',
  reporterEmail: 'Ada@Example.com',
  reporterPhone: '+1 555 0100',
  reporterAddress: '1 Example Street, Springfield',
  workDescription: 'Chapter 4 of my novel, reproduced verbatim.',
  signature: 'Ada Rightsholder',
  goodFaith: true,
  accurate: true,
  authorized: true,
};

function request(body: unknown) {
  return new NextRequest('https://agiworkforce.com/api/copyright-notice', {
    method: 'POST',
    headers: { Origin: 'https://agiworkforce.com', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/copyright-notice', () => {
  let state: ReturnType<typeof seed>;

  beforeEach(() => {
    vi.clearAllMocks();
    state = seed();
    db.current = fakeDb(state);
    mocks.sendSupportEmail.mockResolvedValue({ delivered: true, providerMessageId: 'msg_1' });
  });

  it('accepts an anonymous notice about a live share and hands the operator the takedown token', async () => {
    const response = await POST(request(NOTICE));

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      reference: string;
      kind: string;
      operatorNotified: boolean;
    };
    expect(body.reference).toMatch(/^IP-[0-9A-HJ-NP-TV-Z]{10}$/u);
    expect(body.kind).toBe('conversation-share');
    expect(body.operatorNotified).toBe(true);

    const sent = mocks.sendSupportEmail.mock.calls[0]?.[0];
    expect(sent.to).toBe('ip-ops@agiworkforce.com');
    expect(sent.replyTo).toBe('ada@example.com');
    expect(sent.idempotencyKey).toBe(`copyright-notice:${body.reference}`);
    expect(sent.text).toContain(SHARE_TOKEN);
    expect(sent.text).toContain('/api/admin/takedown');
    expect(sent.text).toContain('user-owner');
    expect(sent.text).toContain('Chapter 4 of my novel, reproduced verbatim.');
  });

  it('records the notice against the resolved target in the security audit log', async () => {
    await POST(request(NOTICE));

    expect(mocks.logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/api/copyright-notice',
        details: expect.objectContaining({
          action: 'copyright_notice_received',
          kind: 'conversation-share',
          token: SHARE_TOKEN,
          ownerId: 'user-owner',
          reporterEmail: 'ada@example.com',
        }),
      }),
    );
  });

  it('resolves a published artifact reported by its public URL', async () => {
    const response = await POST(
      request({
        ...NOTICE,
        contentUrl: `https://agiworkforce.com/shared-artifact/${ARTIFACT_TOKEN}?utm_source=x`,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ kind: 'published-artifact' });
  });

  it('never unpublishes anything itself, removal stays admin-gated', async () => {
    await POST(request(NOTICE));

    const queries = (db.current as { query: { mock: { calls: unknown[][] } } }).query.mock.calls;
    expect(queries.length).toBeGreaterThan(0);
    for (const [sql] of queries) {
      expect(String(sql).toLowerCase()).not.toContain('delete');
    }
    expect(state.shares).toHaveLength(1);
  });

  it('rejects a URL that serves no public content, so no notice is filed against nothing', async () => {
    const response = await POST(
      request({ ...NOTICE, contentUrl: 'https://agiworkforce.com/share/cccccccccccccccccccccccc' }),
    );

    expect(response.status).toBe(404);
    expect(mocks.sendSupportEmail).not.toHaveBeenCalled();
  });

  it('rejects a link that is not a public share or artifact URL', async () => {
    const response = await POST(
      request({ ...NOTICE, contentUrl: 'https://example.com/blog/post' }),
    );

    expect(response.status).toBe(400);
    expect(mocks.sendSupportEmail).not.toHaveBeenCalled();
  });

  it('refuses a notice with an unaffirmed statement', async () => {
    const response = await POST(request({ ...NOTICE, authorized: false }));

    expect(response.status).toBe(400);
    expect(mocks.sendSupportEmail).not.toHaveBeenCalled();
  });

  it('returns the reference but records the failure when the operator alert cannot be delivered', async () => {
    mocks.sendSupportEmail.mockResolvedValue({
      delivered: false,
      reason: 'not_configured',
      detail: 'RESEND_API_KEY missing',
    });

    const response = await POST(request(NOTICE));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ operatorNotified: false });
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'copyright_notice_alert_undeliverable' }),
      expect.any(String),
    );
  });
});

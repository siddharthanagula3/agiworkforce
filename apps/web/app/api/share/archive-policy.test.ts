import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  secretMode: vi.fn(async (..._args: unknown[]) => ({
    mode: 'redact' as 'warn' | 'redact' | 'block',
    organizationId: null as string | null,
  })),
  authUser: vi.fn(async (..._args: unknown[]) => ({ userId: 'user-1' })),
  rateLimit: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: (...a: unknown[]) => mocks.authUser(...a) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: (...a: unknown[]) => mocks.rateLimit(...a) }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mocks.query(...args),
    execute: (...args: unknown[]) => mocks.execute(...args),
  })),
}));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: vi.fn(async () => undefined),
  BLOCK_APPEAL_PATH: '/support',
  logAuthFailure: vi.fn(async () => undefined),
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/lib/services/organization-policy-gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/organization-policy-gate')>()),
  resolveSecretHandlingPolicy: (...a: unknown[]) => mocks.secretMode(...a),
}));

const { GET, POST } = await import('./route');

const CONVERSATION_ID = '4f0c2b8e-6a1d-4c3e-9b7a-2d5e8f1a3c6b';
const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
const MESSAGE = { role: 'assistant', content: 'The runway is eleven months.' };

function sqlOf(call: unknown[]): string {
  return String(call[0]);
}

function callsMatching(pattern: RegExp): unknown[][] {
  return mocks.query.mock.calls.filter((call) => pattern.test(sqlOf(call)));
}

function share() {
  return POST(
    new NextRequest('https://agiworkforce.com/api/share', {
      method: 'POST',
      body: JSON.stringify({
        conversation_id: CONVERSATION_ID,
        title: 'Runway plan',
        messages: [MESSAGE],
      }),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authUser.mockResolvedValue({ userId: 'user-1' });
  mocks.rateLimit.mockResolvedValue(null);
  mocks.query.mockImplementation(async (sql: unknown) => {
    if (/from web_conversations/i.test(String(sql))) return [{ is_temporary: false }];
    if (/insert into shared_sessions/i.test(String(sql))) {
      return [{ token: 'tok-new', expires_at: FUTURE, total_messages: 1, visibility: 'link' }];
    }
    return [];
  });
});

describe('a share outlives archiving of the conversation it came from', () => {
  it('publishes from a conversation whose archived flag is set, because archiving is not deletion', async () => {
    const response = await share();

    expect(response.status).toBe(201);
    const lookup = callsMatching(/from web_conversations/i)[0];
    expect(sqlOf(lookup!)).toContain('deleted_at is null');
    expect(sqlOf(lookup!)).not.toMatch(/\barchived\b/);
  });

  it('copies the transcript into the share row, so the source can change afterwards', async () => {
    await share();

    const insert = callsMatching(/insert into shared_sessions/i)[0];
    const params = insert![1] as unknown[];
    expect(JSON.parse(String(params[5]))).toEqual([MESSAGE]);
    expect(sqlOf(insert!)).not.toMatch(/conversation_id/);
    expect(params).not.toContain(CONVERSATION_ID);
  });

  it('lists the share by owner alone, never through the conversation it was taken from', async () => {
    mocks.query.mockResolvedValue([]);

    await GET(new NextRequest('https://agiworkforce.com/api/share'));

    const listed = callsMatching(/from shared_sessions/i)[0];
    expect(sqlOf(listed!)).toContain('owner_id = $1');
    expect(sqlOf(listed!)).not.toMatch(/web_conversations|archived/);
  });
});

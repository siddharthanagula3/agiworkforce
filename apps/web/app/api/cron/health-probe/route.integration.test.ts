import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getNeonDb: vi.fn(),
}));

vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: mocks.getNeonDb }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/key-value', () => ({ getKeyValueStore: vi.fn(() => null) }));

import { GET } from './route';

const CRON_SECRET = 'probe-drill-secret';

function authorizedRequest() {
  return new Request('http://localhost/api/cron/health-probe', {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  }) as never;
}

const savedEnv = { ...process.env };
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env['DATABASE_URL'];
  delete process.env['AGI_DATABASE_URL'];
  delete process.env['STRIPE_SECRET_KEY'];
  process.env['CRON_SECRET'] = CRON_SECRET;
  process.env['RESEND_API_KEY'] = 'test-key';
  process.env['AGI_SUPPORT_FROM_EMAIL'] = 'support@agiworkforce.com';
  process.env['AGI_SUPPORT_FALLBACK_EMAIL'] = 'oncall@agiworkforce.com';

  mocks.getNeonDb.mockImplementation(() => {
    throw new Error('no connection string');
  });

  fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'msg_drill' }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  process.env = { ...savedEnv };
  vi.unstubAllGlobals();
});

describe('health probe drill', () => {
  it('turns a real unhealthy result into a real outbound alert', async () => {
    const response = await GET(authorizedRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'unhealthy',
      alerted: true,
      delivery: 'delivered',
      severity: 'critical',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    const payload = JSON.parse(String(init.body)) as {
      to: string[];
      subject: string;
      text: string;
    };
    expect(payload.to).toEqual(['oncall@agiworkforce.com']);
    expect(payload.subject).toContain('CRITICAL');
    expect(payload.text).toContain('database: unhealthy');
    expect(payload.text).toContain('environment: unhealthy');
  });

  it('reports 500 when the transport rejects the alert', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 422 }));

    const response = await GET(authorizedRequest());

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ delivery: 'undeliverable' });
  });

  it('401s an unauthenticated caller so the probe cannot be used to spam the mailbox', async () => {
    const response = await GET(new Request('http://localhost/api/cron/health-probe') as never);

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

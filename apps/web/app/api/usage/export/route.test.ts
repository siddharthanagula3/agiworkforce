// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type ScanModule0 = typeof import('@/lib/logger');
type ScanModule1 = typeof import('@/lib/server/rls-db');
type ScanModule2 = typeof import('@/lib/rate-limit');
type ScanModule3 = typeof import('@/lib/services/account-usage-history-service');

const mocks = vi.hoisted(() => ({ userScopedDb: vi.fn(), records: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  getUserScopedDb: (...args: unknown[]) => mocks.userScopedDb(...args),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  withRateLimitHandler: (handler: unknown) => handler,
}));
vi.mock('@/lib/services/account-usage-history-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  readAccountUsageRecords: (...args: unknown[]) => mocks.records(...args),
}));

import { ApiKeyScopeError } from '@/lib/api-key-scope-error';
import { IpNotAllowedError } from '@/lib/ip-allow-list-gate';
import { MfaRequiredError } from '@/lib/mfa-policy-gate';
import {
  USAGE_EXPORT_ROW_LIMIT,
  usageHistoryWindowStart,
  type AccountUsageRecord,
} from '@/lib/services/account-usage-history-service';
import { GET } from './route';

const USER = 'user_2abcDEF';
const DB = { query: vi.fn() };
const FROM = '2026-08-01T00:00:00.000Z';
const TO = '2026-08-31T00:00:00.000Z';

function record(over: Partial<AccountUsageRecord> = {}): AccountUsageRecord {
  return {
    requestId: 'agi.chat.web.send.turn-0001',
    createdAt: '2026-08-22T10:00:00.000Z',
    finalizedAt: '2026-08-22T10:00:04.000Z',
    workload: 'chat',
    operation: 'send',
    model: 'model-a',
    projectId: 'project-1',
    projectName: 'Launch plan',
    inputTokens: 1_200,
    outputTokens: 300,
    credits: 1.23456,
    ...over,
  };
}

function exportUsage(query = ''): Promise<Response> {
  return GET(new NextRequest(`http://localhost:3000/api/usage/export${query}`));
}

function lines(csv: string): string[] {
  return csv.trimEnd().split('\n');
}

beforeEach(() => {
  mocks.userScopedDb.mockResolvedValue({ db: DB, userId: USER, organizationId: null });
  mocks.records.mockResolvedValue([record()]);
});

describe('GET /api/usage/export', () => {
  it('downloads the settled requests of the window as CSV in credits', async () => {
    const response = await exportUsage(`?from=${FROM}&to=${TO}`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="usage-2026-08-01-to-2026-08-31.csv"',
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.records).toHaveBeenCalledWith(DB, USER, { from: FROM, to: TO });
    expect(lines(await response.text())).toEqual([
      `# window_from,${FROM}`,
      `# window_to,${TO}`,
      '# rows,1',
      '# truncated,false',
      'created_at,request_id,product_area,operation,model,project,input_tokens,output_tokens,credits',
      '2026-08-22T10:00:00.000Z,agi.chat.web.send.turn-0001,chat,send,model-a,Launch plan,1200,300,1.2346',
    ]);
  });

  it('falls back to the project ID, and leaves unattributed columns empty', async () => {
    mocks.records.mockResolvedValue([
      record({ workload: null, operation: null, projectName: null }),
      record({ projectId: null, projectName: null, credits: 0 }),
    ]);

    const [, , , , , first, second] = lines(await (await exportUsage()).text());

    expect(first).toBe(
      '2026-08-22T10:00:00.000Z,agi.chat.web.send.turn-0001,,,model-a,project-1,1200,300,1.2346',
    );
    expect(second).toBe(
      '2026-08-22T10:00:00.000Z,agi.chat.web.send.turn-0001,chat,send,model-a,,1200,300,0',
    );
  });

  it('quotes a project name with a comma and defuses one that reads as a formula', async () => {
    mocks.records.mockResolvedValue([
      record({ projectName: 'Q3, launch' }),
      record({ projectName: '=HYPERLINK("https://example.com")' }),
    ]);

    const csv = await (await exportUsage()).text();

    expect(csv).toContain(',"Q3, launch",');
    expect(csv).toContain(`,"'=HYPERLINK(""https://example.com"")",`);
  });

  it('flags an export cut at the row limit as truncated', async () => {
    mocks.records.mockResolvedValue(
      Array.from({ length: USAGE_EXPORT_ROW_LIMIT }, (_, index) =>
        record({ requestId: `agi.chat.web.send.turn-${String(index).padStart(5, '0')}` }),
      ),
    );

    const [, , rows, truncated] = lines(await (await exportUsage()).text());

    expect(rows).toBe(`# rows,${USAGE_EXPORT_ROW_LIMIT}`);
    expect(truncated).toBe('# truncated,true');
  });

  it('exports the same window the history shows for the chosen grouping', async () => {
    const now = new Date();
    await exportUsage('?granularity=week');

    const [, , window] = mocks.records.mock.calls[0] as [unknown, string, { from: string }];
    expect(window.from).toBe(usageHistoryWindowStart('week', now).toISOString());
  });

  it('refuses an API key, since the export is a download for the signed-in account', async () => {
    mocks.userScopedDb.mockRejectedValue(
      new ApiKeyScopeError('API keys are not permitted for this endpoint'),
    );

    const response = await exportUsage();

    expect(response.status).toBe(403);
    expect(mocks.userScopedDb).toHaveBeenCalledWith(expect.anything());
    expect(mocks.records).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a workspace that requires MFA',
      new MfaRequiredError('Multi-factor authentication is required'),
    ],
    ['an address outside the workspace allow list', new IpNotAllowedError()],
  ])('passes through the refusal for %s', async (_case, error) => {
    mocks.userScopedDb.mockRejectedValue(error);

    const response = await exportUsage();

    expect(response.status).toBe(403);
    expect(mocks.records).not.toHaveBeenCalled();
  });

  it('refuses a caller who is not signed in', async () => {
    mocks.userScopedDb.mockRejectedValue(new Error('no session'));

    const response = await exportUsage();

    expect(response.status).toBe(401);
    expect(mocks.records).not.toHaveBeenCalled();
  });

  it('answers 500 without the database message when the read fails', async () => {
    mocks.records.mockRejectedValue(new Error('relation "managed_usage_requests" does not exist'));

    const response = await exportUsage();

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('managed_usage_requests');
  });
});

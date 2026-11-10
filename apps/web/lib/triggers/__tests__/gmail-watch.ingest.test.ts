import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), ingest: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@agiworkforce/types', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/types')>()),
  connectorsReleased: () => true,
}));
vi.mock('@/lib/connectors/oauth-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connectors/oauth-access')>()),
  resolveConnectorAccessToken: mocks.resolve,
}));
vi.mock('../trigger-ingest', () => ({ ingestTriggerEvent: mocks.ingest }));

import { readGmailNotice } from '../gmail-watch';

const ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  user_id: 'user-1',
  organization_id: null,
  task_id: '22222222-2222-4222-8222-222222222222',
  name: 'Inbox',
  source: 'gmail',
  event_types: ['message.received'],
  source_account: 'person@example.com',
  conditions: [],
  debounce_seconds: 0,
  max_attempts: 5,
  is_enabled: true,
  verification_status: 'verified',
  verified_at: '2026-09-17T00:00:00.000Z',
  last_fired_at: null,
  created_at: '2026-09-17T00:00:00.000Z',
  updated_at: '2026-09-17T00:00:00.000Z',
  watch_history_id: '100',
};

function gmailResponses() {
  return vi.fn(async (url: string) => {
    const body = url.includes('/history?')
      ? { history: [{ id: '101', messagesAdded: [{ message: { id: 'm1' } }] }], historyId: '102' }
      : { id: 'm1', internalDate: '1789000000000', snippet: 'hi', labelIds: ['INBOX'] };
    return { ok: true, status: 200, json: async () => body };
  });
}

function database() {
  const execute = vi.fn(async () => 1);
  return { db: { query: vi.fn(async () => [ROW]), execute } as never, execute };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue({ status: 'ready', accessToken: 'token', grantedScopes: [] });
  vi.stubGlobal('fetch', gmailResponses());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readGmailNotice when a message could not be queued', () => {
  it('asks for redelivery and keeps the history position so the message is read again', async () => {
    mocks.ingest.mockResolvedValue([
      { triggerId: ROW.id, outcome: 'failed', detail: 'The run could not be queued: down' },
    ]);
    const { db, execute } = database();

    const outcome = await readGmailNotice(db, {
      emailAddress: 'person@example.com',
      historyId: '102',
    });

    expect(outcome.retry).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it('moves the history position forward once every message was queued', async () => {
    mocks.ingest.mockResolvedValue([{ triggerId: ROW.id, outcome: 'enqueued', detail: null }]);
    const { db, execute } = database();

    const outcome = await readGmailNotice(db, {
      emailAddress: 'person@example.com',
      historyId: '102',
    });

    expect(outcome).toMatchObject({ retry: false, queued: 1 });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

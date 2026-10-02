import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { MANAGED_CLOUD_ORGANIZATION_HEADER } from '@agiworkforce/cloud-contracts';
type ScanModule0 = typeof import('@/lib/services/organization-policy-gate');

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  secretMode: vi.fn(async (..._args: unknown[]) => ({
    mode: 'redact' as 'warn' | 'redact' | 'block',
    organizationId: null as string | null,
  })),
  authUser: vi.fn(async (..._args: unknown[]) => ({ userId: 'user-1' })),
  rateLimit: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
  recordAuditEvent: vi.fn(async (..._args: unknown[]) => undefined),
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
  recordAuditEvent: (...a: unknown[]) => mocks.recordAuditEvent(...a),
  BLOCK_APPEAL_PATH: '/support',
  logAuthFailure: vi.fn(async () => undefined),
  logRateLimitExceeded: vi.fn(),
}));

vi.mock('@/lib/services/organization-policy-gate', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  resolveSecretHandlingPolicy: (...a: unknown[]) => mocks.secretMode(...a),
}));

const { DELETE, GET, POST, PUT } = await import('./route');

const CONVERSATION_ID = '4f0c2b8e-6a1d-4c3e-9b7a-2d5e8f1a3c6b';
const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

function row(overrides: Record<string, unknown> = {}) {
  return {
    token: 'tok-1',
    title: 'Planning session',
    model_id: 'model-a',
    provider: 'anthropic',
    total_messages: 12,
    expires_at: FUTURE,
    created_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

const call = () => GET(new NextRequest('https://agiworkforce.com/api/share'));

const NEW_SHARE = { id: 'share-new', token: 'tok-new', expires_at: FUTURE, total_messages: 0 };

function insertReturns(inserted: Record<string, unknown> = NEW_SHARE): void {
  mocks.query.mockResolvedValue([inserted]);
}

function sharedSessionWrites(): string[] {
  return mocks.query.mock.calls
    .map((call) => String(call[0]))
    .filter((sql) => /(insert into|update|delete from) shared_sessions/i.test(sql));
}

describe('GET /api/share', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser.mockResolvedValue({ userId: 'user-1' });
    mocks.rateLimit.mockResolvedValue(null);
  });

  it('returns the callers own shares with a usable URL', async () => {
    mocks.query.mockResolvedValue([row()]);

    const body = await (await call()).json();

    expect(body.shares).toHaveLength(1);
    expect(body.shares[0]).toMatchObject({
      token: 'tok-1',
      title: 'Planning session',
      messageCount: 12,
      expired: false,
    });
    expect(body.shares[0].shareUrl).toContain('/share/tok-1');
  });

  it('scopes the query to the authenticated owner', async () => {
    mocks.query.mockResolvedValue([]);
    await call();

    const [sql, params] = mocks.query.mock.calls[0]!;
    expect(sql).toContain('owner_id = $1');
    expect(params).toEqual(['user-1']);
  });

  it('never returns the conversation bodies', async () => {
    mocks.query.mockResolvedValue([]);
    await call();

    const [sql] = mocks.query.mock.calls[0]!;
    expect(sql).not.toMatch(/\bmessages\b/);
  });

  it('marks expired shares instead of hiding them', async () => {
    mocks.query.mockResolvedValue([row({ token: 'old', expires_at: PAST })]);

    const body = await (await call()).json();

    expect(body.shares).toHaveLength(1);
    expect(body.shares[0].expired).toBe(true);
  });

  it('falls back to a title when the row has none', async () => {
    mocks.query.mockResolvedValue([row({ title: null })]);
    const body = await (await call()).json();
    expect(body.shares[0].title).toBe('Shared Session');
  });

  it('returns an empty list rather than failing when nothing is shared', async () => {
    mocks.query.mockResolvedValue([]);
    const response = await call();
    expect(response.status).toBe(200);
    expect((await response.json()).shares).toEqual([]);
  });

  it('reads one conversation’s links when asked, with the workspace they can be aimed at', async () => {
    const organizationId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from shared_sessions')) return [row()];
      if (sql.includes('count(*) as member_count')) return [{ member_count: '3' }];
      if (sql.includes('from public.organization_members')) {
        return [{ organization_id: organizationId }];
      }
      return [];
    });

    const response = await GET(
      new NextRequest(`https://agiworkforce.com/api/share?conversation_id=${CONVERSATION_ID}`, {
        headers: { [MANAGED_CLOUD_ORGANIZATION_HEADER]: organizationId },
      }),
    );

    expect(response.status).toBe(200);
    const [sql, params] = mocks.query.mock.calls[0]!;
    expect(sql).toContain('owner_id = $1');
    expect(sql).toContain('conversation_id = $2');
    expect(params).toEqual(['user-1', CONVERSATION_ID]);
    const body = await response.json();
    expect(body.shares).toHaveLength(1);
    expect(body.workspace).toEqual({ memberCount: 3 });
  });

  it('refuses a conversation filter that is not a conversation id', async () => {
    const response = await GET(
      new NextRequest('https://agiworkforce.com/api/share?conversation_id=conv-1'),
    );

    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

describe('POST /api/share, link lifetime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser.mockResolvedValue({ userId: 'user-1' });
    mocks.rateLimit.mockResolvedValue(null);
  });

  function post(body: Record<string, unknown>) {
    insertReturns();
    return POST(
      new NextRequest('https://agiworkforce.com/api/share', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );
  }

  // Selected by SQL rather than by call index: the route asks the workspace
  // sharing policy before it writes, so the insert is no longer the first
  // query this mock sees.
  function insertCall(): unknown[] {
    const call = mocks.query.mock.calls.find((c) =>
      /insert into shared_sessions/i.test(String(c[0])),
    );
    if (!call) throw new Error('no insert into shared_sessions was issued');
    return call[1] as unknown[];
  }

  function insertedExpiryDays(): number {
    const params = insertCall();
    const expiresAt = new Date(String(params[params.length - 1]));
    return Math.round((expiresAt.getTime() - Date.now()) / 86_400_000);
  }

  it('defaults to seven days when the caller says nothing', async () => {
    await post({ conversation_id: CONVERSATION_ID, title: 'Session' });
    expect(insertedExpiryDays()).toBe(7);
  });

  it('honors a caller-supplied lifetime', async () => {
    await post({ conversation_id: CONVERSATION_ID, title: 'Session', expires_in_days: 1 });
    expect(insertedExpiryDays()).toBe(1);
  });

  it('rejects a lifetime outside the allowed set', async () => {
    const response = await post({
      conversation_id: CONVERSATION_ID,
      title: 'Session',
      expires_in_days: 3650,
    });
    expect(response.status).toBe(400);
    expect(
      mocks.query.mock.calls.some((c) => /insert into shared_sessions/i.test(String(c[0]))),
      'a rejected lifetime must not reach the insert',
    ).toBe(false);
  });
});

describe('POST /api/share, secret redaction', () => {
  const STRIPE_KEY = `sk_live_${'a'.repeat(30)}`;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser.mockResolvedValue({ userId: 'user-1' });
    mocks.rateLimit.mockResolvedValue(null);
    insertReturns();
  });

  function insertedMessages(): Array<Record<string, unknown>> {
    const call = mocks.query.mock.calls.find((c) =>
      /insert into shared_sessions/i.test(String(c[0])),
    );
    if (!call) throw new Error('no insert into shared_sessions was issued');
    const params = call[1] as unknown[];
    return JSON.parse(params[5] as string) as Array<Record<string, unknown>>;
  }

  it('redacts a secret found in a message before it is stored', async () => {
    await POST(
      new NextRequest('https://agiworkforce.com/api/share', {
        method: 'POST',
        body: JSON.stringify({
          conversation_id: CONVERSATION_ID,
          title: 'Session',
          messages: [{ role: 'user', content: `use ${STRIPE_KEY} to bill` }],
        }),
      }),
    );

    const stored = JSON.stringify(insertedMessages());
    expect(stored).not.toContain(STRIPE_KEY);
    expect(stored).toContain('[REDACTED]');
  });

  it('records an audit event naming the pattern without the secret value', async () => {
    await POST(
      new NextRequest('https://agiworkforce.com/api/share', {
        method: 'POST',
        body: JSON.stringify({
          conversation_id: CONVERSATION_ID,
          title: 'Session',
          messages: [{ role: 'user', content: `use ${STRIPE_KEY} to bill` }],
        }),
      }),
    );

    const secretEvents = mocks.recordAuditEvent.mock.calls
      .map((call) => call[0] as { eventType: string; detail: Record<string, unknown> })
      .filter((candidate) => candidate.eventType === 'secret_detected');
    expect(secretEvents).toHaveLength(1);
    const event = secretEvents[0]!;
    expect(event.detail['status']).toBe('redacted');
    expect(event.detail['resourceId']).toBe('share-new');
    expect(JSON.stringify(event)).not.toContain('tok-new');
    expect(JSON.stringify(event)).not.toContain(STRIPE_KEY);
  });

  it('refuses to publish when the workspace blocks outbound secrets', async () => {
    mocks.secretMode.mockResolvedValueOnce({ mode: 'block', organizationId: 'org-1' });

    const res = await POST(
      new NextRequest('https://agiworkforce.com/api/share', {
        method: 'POST',
        body: JSON.stringify({
          conversation_id: CONVERSATION_ID,
          title: 'Session',
          messages: [{ role: 'user', content: `use ${STRIPE_KEY} to bill` }],
        }),
      }),
    );

    expect(res.status).toBe(400);
    expect(
      mocks.query.mock.calls.some((c) => /insert into shared_sessions/i.test(String(c[0]))),
    ).toBe(false);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'dlp_content_blocked', organizationId: 'org-1' }),
    );
  });

  it('records only the new link, by id, when nothing is redacted', async () => {
    await POST(
      new NextRequest('https://agiworkforce.com/api/share', {
        method: 'POST',
        body: JSON.stringify({
          conversation_id: CONVERSATION_ID,
          title: 'Session',
          messages: [{ role: 'user', content: 'hi' }],
        }),
      }),
    );

    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
    const event = mocks.recordAuditEvent.mock.calls[0]![0] as {
      eventType: string;
      detail: Record<string, unknown>;
    };
    expect(event.eventType).toBe('share_link_created');
    expect(event.detail).toEqual({
      resourceType: 'share_link',
      resourceId: 'share-new',
      conversationId: CONVERSATION_ID,
    });
    expect(JSON.stringify(event)).not.toContain('tok-new');
  });
});

describe('POST /api/share, local path redaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser.mockResolvedValue({ userId: 'user-1' });
    mocks.rateLimit.mockResolvedValue(null);
    insertReturns();
  });

  function insertedMessages(): Array<Record<string, unknown>> {
    const call = mocks.query.mock.calls.find((c) =>
      /insert into shared_sessions/i.test(String(c[0])),
    );
    if (!call) throw new Error('no insert into shared_sessions was issued');
    return JSON.parse((call[1] as unknown[])[5] as string) as Array<Record<string, unknown>>;
  }

  it('scrubs local paths inside tool calls, where the viewer actually renders them', async () => {
    await POST(
      new NextRequest('https://agiworkforce.com/api/share', {
        method: 'POST',
        body: JSON.stringify({
          conversation_id: CONVERSATION_ID,
          title: 'Session',
          messages: [
            {
              role: 'assistant',
              content: 'Read the file.',
              tool_calls: [
                { tool_name: 'read_file', display_args: 'read /Users/alice/secrets/keys.txt' },
                { tool_name: 'shell', display_args: { cwd: '/home/alice/repo', cmd: 'ls' } },
              ],
            },
          ],
        }),
      }),
    );

    const [message] = insertedMessages();
    expect(JSON.stringify(message)).not.toContain('/Users/alice');
    expect(JSON.stringify(message)).not.toContain('/home/alice');
    expect(message?.['tool_calls']).toEqual([
      { tool_name: 'read_file', display_args: 'read [local-path]' },
      { tool_name: 'shell', display_args: { cwd: '[local-path]', cmd: 'ls' } },
    ]);
    expect(message?.['content']).toBe('Read the file.');
  });

  it('still scrubs a top-level display_args field', async () => {
    await POST(
      new NextRequest('https://agiworkforce.com/api/share', {
        method: 'POST',
        body: JSON.stringify({
          conversation_id: CONVERSATION_ID,
          title: 'Session',
          messages: [{ role: 'assistant', content: 'x', display_args: 'open /var/tmp/a/b' }],
        }),
      }),
    );

    expect(insertedMessages()[0]?.['display_args']).toBe('open [local-path]');
  });
});

describe('POST /api/share, temporary chat policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser.mockResolvedValue({ userId: 'user-1' });
    mocks.rateLimit.mockResolvedValue(null);
  });

  function conversationLookup(rows: unknown[]) {
    mocks.query.mockImplementation(async (sql: unknown) => {
      if (/from web_conversations/i.test(String(sql))) return rows;
      return [{ id: 'share-new', token: 'tok-new', expires_at: FUTURE, total_messages: 1 }];
    });
  }

  function share(body: Record<string, unknown>) {
    return POST(
      new NextRequest('https://agiworkforce.com/api/share', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Session',
          messages: [{ role: 'user', content: 'hi' }],
          ...body,
        }),
      }),
    );
  }

  function inserted(): boolean {
    return mocks.query.mock.calls.some((c) => /insert into shared_sessions/i.test(String(c[0])));
  }

  it('refuses to publish a temporary conversation and writes nothing', async () => {
    conversationLookup([{ is_temporary: true }]);

    const response = await share({ conversation_id: CONVERSATION_ID });

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/temporary chat cannot be shared/i);
    expect(inserted()).toBe(false);
  });

  it('looks the conversation up under the caller, never another owner', async () => {
    conversationLookup([{ is_temporary: false }]);

    const response = await share({ conversation_id: CONVERSATION_ID });

    expect(response.status).toBe(201);
    const lookup = mocks.query.mock.calls.find((c) => /from web_conversations/i.test(String(c[0])));
    expect(lookup?.[0]).toMatch(/user_id = \$2/);
    expect(lookup?.[1]).toEqual([CONVERSATION_ID, 'user-1']);
    expect(inserted()).toBe(true);
  });

  it('answers not found for a conversation the caller does not own', async () => {
    conversationLookup([]);

    const response = await share({ conversation_id: CONVERSATION_ID });

    expect(response.status).toBe(404);
    expect(inserted()).toBe(false);
  });

  it('publishes a share that names no conversation, as the desktop client sends it', async () => {
    conversationLookup([]);

    const response = await share({});

    expect(response.status).toBeLessThan(300);
    expect(inserted()).toBe(true);
    expect(mocks.query.mock.calls.some((c) => /from web_conversations/i.test(String(c[0])))).toBe(
      false,
    );
  });
});

describe('POST /api/share on a chat that is already shared', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser.mockResolvedValue({ userId: 'user-1' });
    mocks.rateLimit.mockResolvedValue(null);
    mocks.query.mockImplementation(async (sql: unknown) => {
      if (/from web_conversations/i.test(String(sql))) return [{ is_temporary: false }];
      if (/insert into shared_sessions/i.test(String(sql))) {
        return [{ ...NEW_SHARE, total_messages: 1, visibility: 'public' }];
      }
      if (/update shared_sessions/i.test(String(sql))) {
        return [{ id: 'share-live', token: 'tok-live', created_at: '2026-09-01T00:00:00.000Z' }];
      }
      return [];
    });
  });

  it('creates a new link and leaves the live one untouched, as a create-only client expects', async () => {
    const response = await POST(
      new NextRequest('https://agiworkforce.com/api/share', {
        method: 'POST',
        body: JSON.stringify({
          conversation_id: CONVERSATION_ID,
          title: 'Session',
          messages: [{ role: 'user', content: 'sent from the phone' }],
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      token: 'tok-new',
      shareUrl: expect.stringContaining('/share/tok-new'),
      visibility: 'public',
    });
    expect(sharedSessionWrites()).toEqual([expect.stringMatching(/insert into shared_sessions/i)]);
    const events = mocks.recordAuditEvent.mock.calls.map(
      (call) => call[0] as { eventType: string; detail: Record<string, unknown> },
    );
    expect(events.map((event) => [event.eventType, event.detail['resourceId']])).toEqual([
      ['share_link_created', 'share-new'],
    ]);
  });
});

describe('PUT /api/share?conversation_id, Update link', () => {
  const STRIPE_KEY = `sk_live_${'b'.repeat(30)}`;
  const REFRESHED = [
    { id: 'share-newer', token: 'tok-newer' },
    { id: 'share-older', token: 'tok-older' },
  ];
  const LIVE_LINKS = REFRESHED.map(({ id }) => ({
    id,
    visibility: 'public',
    organization_id: null,
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser.mockResolvedValue({ userId: 'user-1' });
    mocks.rateLimit.mockResolvedValue(null);
    mocks.query.mockImplementation(async (sql: unknown) => {
      if (/from web_conversations/i.test(String(sql))) return [{ is_temporary: false }];
      if (/left join organization_shared_sessions/i.test(String(sql))) return LIVE_LINKS;
      if (/update shared_sessions/i.test(String(sql))) return REFRESHED;
      return [];
    });
  });

  function update(
    body: Record<string, unknown> = {},
    url = `https://agiworkforce.com/api/share?conversation_id=${CONVERSATION_ID}`,
  ) {
    return PUT(
      new NextRequest(url, {
        method: 'PUT',
        body: JSON.stringify({
          tokens: ['tok-newer', 'tok-older'],
          title: 'Session',
          messages: [
            { role: 'user', content: 'first' },
            { role: 'assistant', content: 'second' },
          ],
          ...body,
        }),
      }),
    );
  }

  function refreshCall(): [string, unknown[]] {
    const found = mocks.query.mock.calls.find((c) => /update shared_sessions/i.test(String(c[0])));
    if (!found) throw new Error('no live share was refreshed');
    return found as [string, unknown[]];
  }

  it('re-snapshots only the links the owner was shown, in place, and says which', async () => {
    const response = await update();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      refreshed: 2,
      tokens: ['tok-newer', 'tok-older'],
      messageCount: 2,
    });
    const [sql, params] = refreshCall();
    expect(sql).toMatch(/owner_id = \$1/);
    expect(sql).toMatch(/conversation_id = \$2/);
    expect(sql).toMatch(/token = any\(\$3::text\[\]\)/);
    expect(sql).toMatch(/expires_at > now\(\)/);
    expect(sql).not.toMatch(/expires_at\s*=/);
    expect(params.slice(0, 3)).toEqual(['user-1', CONVERSATION_ID, ['tok-newer', 'tok-older']]);
    expect(sharedSessionWrites()).toHaveLength(1);
    const updated = mocks.recordAuditEvent.mock.calls
      .map((call) => call[0] as { eventType: string; detail: Record<string, unknown> })
      .filter((event) => event.eventType === 'share_link_updated')
      .map((event) => event.detail['resourceId']);
    expect(updated).toEqual(['share-newer', 'share-older']);
  });

  it('redacts the refreshed snapshot exactly as it would a new one', async () => {
    await update({ messages: [{ role: 'user', content: `use ${STRIPE_KEY} to bill` }] });

    const stored = String(refreshCall()[1][6]);
    expect(stored).not.toContain(STRIPE_KEY);
    expect(stored).toContain('[REDACTED]');
  });

  it('answers not found and creates nothing when none of the links is still live', async () => {
    mocks.query.mockImplementation(async (sql: unknown) =>
      /from web_conversations/i.test(String(sql)) ? [{ is_temporary: false }] : [],
    );

    const response = await update();

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/revoked or has expired/);
    expect(sharedSessionWrites()).toEqual([]);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('refuses an empty snapshot without touching any link', async () => {
    const response = await update({ messages: [] });

    expect(response.status).toBe(400);
    expect(sharedSessionWrites()).toEqual([]);
  });

  it('refuses without naming the conversation', async () => {
    const response = await update({}, 'https://agiworkforce.com/api/share');

    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('answers not found for a conversation the caller does not own', async () => {
    mocks.query.mockImplementation(async (sql: unknown) =>
      /from web_conversations/i.test(String(sql)) ? [] : REFRESHED,
    );

    const response = await update();

    expect(response.status).toBe(404);
    const lookup = mocks.query.mock.calls.find((c) => /from web_conversations/i.test(String(c[0])));
    expect(lookup?.[1]).toEqual([CONVERSATION_ID, 'user-1']);
    expect(sharedSessionWrites()).toEqual([]);
  });

  it('refreshes nothing when the workspace blocks the content', async () => {
    mocks.secretMode.mockResolvedValueOnce({ mode: 'block', organizationId: 'org-1' });

    const response = await update({
      messages: [{ role: 'user', content: `use ${STRIPE_KEY} to bill` }],
    });

    expect(response.status).toBe(400);
    expect(sharedSessionWrites()).toEqual([]);
  });
});

describe('DELETE /api/share?conversation_id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser.mockResolvedValue({ userId: 'user-1' });
    mocks.query.mockImplementation(async (sql: unknown) =>
      /delete from shared_sessions/i.test(String(sql))
        ? [{ id: 'share-newer' }, { id: 'share-older' }]
        : [],
    );
  });

  it('revokes every live link of the chat the caller owns', async () => {
    const response = await DELETE(
      new NextRequest(`https://agiworkforce.com/api/share?conversation_id=${CONVERSATION_ID}`, {
        method: 'DELETE',
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, revoked: 2 });
    const [sql, params] = mocks.query.mock.calls.find((c) =>
      /delete from shared_sessions/i.test(String(c[0])),
    )!;
    expect(sql).toMatch(/owner_id = \$1/);
    expect(sql).toMatch(/conversation_id = \$2/);
    expect(sql).toMatch(/expires_at > now\(\)/);
    expect(params).toEqual(['user-1', CONVERSATION_ID]);
    const revoked = mocks.recordAuditEvent.mock.calls
      .map((call) => call[0] as { eventType: string; detail: Record<string, unknown> })
      .filter((event) => event.eventType === 'share_link_revoked')
      .map((event) => event.detail['resourceId']);
    expect(revoked).toEqual(['share-newer', 'share-older']);
  });

  it('refuses to revoke without naming the conversation', async () => {
    const response = await DELETE(
      new NextRequest('https://agiworkforce.com/api/share', { method: 'DELETE' }),
    );

    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

describe('POST and PUT /api/share, the workspace that stores the chat decides', () => {
  const ORG = '11111111-1111-4111-8111-111111111111';
  let selectedWorkspace: string | null;
  let externalSharing: boolean;
  let permissions: string[];
  let links: Array<{ id: string; visibility: string; organization_id: string | null }>;

  function policyRow() {
    return {
      organization_id: ORG,
      default_privacy_mode: 'byok',
      allowed_privacy_modes: ['local', 'byok'],
      allow_managed_compute: false,
      require_local_to_byok_preview: true,
      chat_sync_surfaces: ['web'],
      allow_cli_cloud_sync: false,
      allow_vscode_cloud_sync: false,
      allow_chrome_cloud_sync: false,
      audit_export_enabled: true,
      retention_days: 365,
      retention_enforced: false,
      external_sharing_enabled: externalSharing,
      allow_memory: true,
      metadata: {},
      updated_at: '2026-09-16T00:00:00.000Z',
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser.mockResolvedValue({ userId: 'user-1' });
    mocks.rateLimit.mockResolvedValue(null);
    selectedWorkspace = ORG;
    externalSharing = false;
    permissions = ['content.read', 'content.share'];
    links = [{ id: 'share-live', visibility: 'public', organization_id: null }];
    mocks.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (/from web_conversations/i.test(sql))
        return [{ is_temporary: false, organization_id: ORG }];
      if (/left join organization_shared_sessions/i.test(sql)) return links;
      if (/from public\.user_settings/i.test(sql)) {
        return selectedWorkspace ? [{ organization_id: selectedWorkspace }] : [];
      }
      if (/from public\.organization_admin_policies/i.test(sql)) {
        return params[0] === ORG ? [policyRow()] : [];
      }
      if (/organization_member_permissions/i.test(sql)) return [{ permissions }];
      if (/from public\.organization_members/i.test(sql)) {
        return [{ organization_id: ORG, role: 'member' }];
      }
      if (/insert into shared_sessions/i.test(sql)) return [NEW_SHARE];
      if (/update shared_sessions/i.test(sql)) return [{ id: 'share-live', token: 'tok-live' }];
      return [];
    });
  });

  function create(headers: Record<string, string> = {}) {
    return POST(
      new NextRequest('https://agiworkforce.com/api/share', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          conversation_id: CONVERSATION_ID,
          title: 'Workspace plan',
          messages: [{ role: 'user', content: 'workspace text' }],
        }),
      }),
    );
  }

  function update(headers: Record<string, string> = {}) {
    return PUT(
      new NextRequest(`https://agiworkforce.com/api/share?conversation_id=${CONVERSATION_ID}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          tokens: ['tok-live'],
          title: 'Workspace plan',
          messages: [{ role: 'user', content: 'new workspace text' }],
        }),
      }),
    );
  }

  const personal = { [MANAGED_CLOUD_ORGANIZATION_HEADER]: 'personal' };

  it('refuses to publish a workspace chat for x-agi-organization-id: personal', async () => {
    const response = await create(personal);

    expect(response.status).toBe(403);
    expect(sharedSessionWrites()).toEqual([]);
  });

  it('refuses to update the links of a workspace chat for x-agi-organization-id: personal', async () => {
    const response = await update(personal);

    expect(response.status).toBe(403);
    expect(sharedSessionWrites()).toEqual([]);
  });

  it('asks the chat’s workspace before publishing while the selected workspace is personal', async () => {
    selectedWorkspace = null;

    const response = await create();

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('external_sharing_disabled');
    expect(sharedSessionWrites()).toEqual([]);
  });

  it('asks the chat’s workspace before updating a public link while the selected workspace is personal', async () => {
    selectedWorkspace = null;

    const response = await update();

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('external_sharing_disabled');
    expect(sharedSessionWrites()).toEqual([]);
  });

  it('still refuses to update a public link while the workspace keeps public sharing off', async () => {
    const response = await update();

    expect(response.status).toBe(403);
    expect(sharedSessionWrites()).toEqual([]);
  });

  it('updates workspace-only links while the workspace keeps public sharing off', async () => {
    links = [{ id: 'share-live', visibility: 'organization', organization_id: ORG }];

    const response = await update();

    expect(response.status).toBe(200);
    expect(sharedSessionWrites()).toEqual([expect.stringMatching(/update shared_sessions/i)]);
  });

  it('writes only the links whose audience it checked', async () => {
    links = [{ id: 'share-live', visibility: 'organization', organization_id: ORG }];

    await update();

    const write = mocks.query.mock.calls.find((c) => /update shared_sessions/i.test(String(c[0])));
    expect(write?.[0]).toMatch(/id = any\(\$9::uuid\[\]\)/);
    expect((write?.[1] as unknown[])[8]).toEqual(['share-live']);
  });

  it('needs share permission in the workspace to update a workspace-only link', async () => {
    links = [{ id: 'share-live', visibility: 'organization', organization_id: ORG }];
    externalSharing = true;
    permissions = ['content.read'];

    const response = await update();

    expect(response.status).toBe(403);
    expect(JSON.stringify(await response.json())).toContain('read-only');
    expect(sharedSessionWrites()).toEqual([]);
  });
});

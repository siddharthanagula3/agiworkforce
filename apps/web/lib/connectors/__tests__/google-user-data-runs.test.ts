import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const {
  connectorIdsReachGoogleUserData,
  retrievalDocumentHoldsGoogleUserData,
  retrievalQueryMayCarryGoogleUserData,
  runMessagesCarryGoogleUserData,
  toolsReachGoogleUserData,
  withoutGoogleUserDataTools,
} = await import('../google-user-data-runs');
const { GMAIL_CONNECTOR_ID } = await import('@/lib/connectors/gmail-actions');
const { GOOGLE_DRIVE_CONNECTOR_ID } = await import('@/lib/connectors/google-drive-files');
const { CONNECTOR_RECONNECT_TOOL_NAME } = await import('@/lib/mcp-tool-executor');

type Responder = (sql: string, params: unknown[]) => unknown[];

function fakeDb(respond: Responder) {
  const query = vi.fn(async (sql: string, params: unknown[] = []) => respond(sql, params));
  return { db: { query } as never, query };
}

const CONVERSATION = '11111111-1111-4111-8111-111111111111';

function conversationRow(marked: boolean): Responder {
  return (sql) => {
    if (sql.includes('google_user_data_at is not null as marked')) {
      return [{ marked, project_id: null }];
    }
    if (sql.includes('select conversation_id')) return [{ conversation_id: CONVERSATION }];
    return [];
  };
}

describe('connector reach', () => {
  it('treats a run offered any Google connector as reaching Google user data', () => {
    expect(connectorIdsReachGoogleUserData(['linear', GMAIL_CONNECTOR_ID])).toBe(true);
    expect(connectorIdsReachGoogleUserData(['linear', 'github'])).toBe(false);
    expect(toolsReachGoogleUserData([{ serverId: GOOGLE_DRIVE_CONNECTOR_ID }])).toBe(true);
  });

  it('drops every Google connector tool, the reconnect tool included, and keeps the rest', () => {
    const tools = [
      { serverId: GMAIL_CONNECTOR_ID, toolName: 'search_threads' },
      { serverId: GMAIL_CONNECTOR_ID, toolName: CONNECTOR_RECONNECT_TOOL_NAME },
      { serverId: GOOGLE_DRIVE_CONNECTOR_ID, toolName: 'read_file' },
      { serverId: 'linear', toolName: 'list_issues' },
    ];
    expect(withoutGoogleUserDataTools(tools)).toEqual([
      { serverId: 'linear', toolName: 'list_issues' },
    ]);
  });

  it('recognises a resumed transcript that already called a Google tool', () => {
    expect(runMessagesCarryGoogleUserData([{ role: 'user', content: 'hi' }])).toBe(false);
    expect(
      runMessagesCarryGoogleUserData([
        { role: 'user', content: 'summarise my inbox' },
        {
          role: 'assistant',
          tool_calls: [
            { id: 'c', function: { name: `mcp__${GMAIL_CONNECTOR_ID}__search_threads` } },
          ],
        },
      ]),
    ).toBe(true);
  });
});

describe('retrievalDocumentHoldsGoogleUserData', () => {
  it('follows the marker of a conversation document', async () => {
    const { db } = fakeDb(conversationRow(true));
    await expect(
      retrievalDocumentHoldsGoogleUserData(db, {
        source_kind: 'conversation',
        source_id: CONVERSATION,
        user_id: 'user-1',
      }),
    ).resolves.toBe(true);
  });

  it.each(['artifact', 'research_report', 'library_file'])(
    'follows the marker of the conversation a %s came from, scoped to the owner',
    async (sourceKind) => {
      const marked = fakeDb(conversationRow(true));
      await expect(
        retrievalDocumentHoldsGoogleUserData(marked.db, {
          source_kind: sourceKind,
          source_id: 'source-1',
          user_id: 'user-1',
        }),
      ).resolves.toBe(true);
      const [originSql, originParams] = marked.query.mock.calls[0]!;
      expect(originSql).toContain('user_id = $2');
      expect(originParams).toEqual(['source-1', 'user-1']);

      const clean = fakeDb(conversationRow(false));
      await expect(
        retrievalDocumentHoldsGoogleUserData(clean.db, {
          source_kind: sourceKind,
          source_id: 'source-1',
          user_id: 'user-1',
        }),
      ).resolves.toBe(false);
    },
  );

  it('does not treat a source with no origin conversation as Google data', async () => {
    const { db } = fakeDb((sql) =>
      sql.includes('select conversation_id') ? [{ conversation_id: null }] : [],
    );
    await expect(
      retrievalDocumentHoldsGoogleUserData(db, {
        source_kind: 'artifact',
        source_id: 'source-1',
        user_id: 'user-1',
      }),
    ).resolves.toBe(false);
  });

  it.each([true, false])(
    'reads whether a project file was imported from a Google connector (%s)',
    async (google) => {
      const { db, query } = fakeDb(() => [{ google }]);
      await expect(
        retrievalDocumentHoldsGoogleUserData(db, {
          source_kind: 'project_knowledge',
          source_id: 'file-1',
          user_id: 'user-1',
        }),
      ).resolves.toBe(google);
      const [sql, params] = query.mock.calls[0]!;
      expect(sql).toContain('external_resource_references');
      expect(sql).toContain('p.user_id = $3');
      expect(params).toEqual([
        'file-1',
        expect.arrayContaining([GMAIL_CONNECTOR_ID, GOOGLE_DRIVE_CONNECTOR_ID]),
        'user-1',
      ]);
    },
  );

  it('never treats a developer session as Google data', async () => {
    const { db, query } = fakeDb(() => []);
    await expect(
      retrievalDocumentHoldsGoogleUserData(db, {
        source_kind: 'developer_session',
        source_id: 'session-1',
        user_id: 'user-1',
      }),
    ).resolves.toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown source kind', 'future_kind', () => []],
    [
      'an unreadable origin',
      'artifact',
      () => {
        throw new Error('connection reset');
      },
    ],
  ])('fails closed on %s', async (_label, sourceKind, respond) => {
    const { db } = fakeDb(respond as Responder);
    await expect(
      retrievalDocumentHoldsGoogleUserData(db, {
        source_kind: sourceKind,
        source_id: 'source-1',
        user_id: 'user-1',
      }),
    ).resolves.toBe(true);
  });
});

describe('retrievalQueryMayCarryGoogleUserData', () => {
  it('is true while any live chat of the account is marked', async () => {
    const { db, query } = fakeDb(() => [{ holds: true }]);
    await expect(retrievalQueryMayCarryGoogleUserData(db, 'user-1')).resolves.toBe(true);
    expect(query.mock.calls[0]![1]).toEqual(['user-1']);
  });

  it('is false when no chat is marked and true when the markers cannot be read', async () => {
    await expect(
      retrievalQueryMayCarryGoogleUserData(fakeDb(() => [{ holds: false }]).db, 'user-1'),
    ).resolves.toBe(false);
    await expect(
      retrievalQueryMayCarryGoogleUserData(
        fakeDb(() => {
          throw new Error('connection reset');
        }).db,
        'user-1',
      ),
    ).resolves.toBe(true);
  });
});

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import firstPartyTargets from '@/lib/connectors/directory/sources/first-party.json';
import vendorDirectory from '@/lib/connectors/directory/sources/vendor-directory.json';
import { directoryServerId } from '@/lib/connectors/mcp-directory-targets';
import { CONNECTOR_OAUTH_SCOPE_CEILINGS } from '@/lib/connectors/oauth-scope-allowlist';
import { MANAGED_CLOUD_TRIGGER_SOURCES } from '@agiworkforce/cloud-contracts';
import {
  conversationHoldsGoogleUserData,
  GOOGLE_USER_DATA_CONNECTOR_IDS,
  GOOGLE_USER_DATA_TRIGGER_SOURCES,
  isGoogleApiUrl,
  storedMessageToolServerIds,
  isGoogleUserDataConnector,
  isGoogleUserDataToolName,
  messagesCarryGoogleToolUse,
  resolveGoogleUserDataTurn,
  turnHoldsGoogleUserData,
} from '../google-user-data';

const CONVERSATION_ID = '52d14f7e-0b3d-40c7-952d-987e841033c5';

function database(answer: (sql: string) => unknown[] | Promise<unknown[]>) {
  const query = vi.fn(async (sql: string, _params?: unknown[]) => answer(sql));
  return { db: { query } as never, query };
}

const plainTurn = {
  conversationId: undefined,
  messages: [{ role: 'user', content: 'hello' }],
  connectorToolsEnabled: true,
  disabledConnectorIds: undefined,
  researchConnectorIds: undefined,
};

describe('Google user data tool names', () => {
  it('recognizes each Google connector and nothing else', () => {
    expect(isGoogleUserDataToolName('mcp__gmail__search_threads')).toBe(true);
    expect(isGoogleUserDataToolName('mcp__gmail__read_attachments')).toBe(true);
    expect(isGoogleUserDataToolName('mcp__google-calendar__list_events')).toBe(true);
    expect(isGoogleUserDataToolName('mcp__google-drive__read_file_content')).toBe(true);
    expect(isGoogleUserDataToolName('mcp__google-contacts__search_contacts')).toBe(true);
    expect(isGoogleUserDataToolName('mcp__gmail__agi_reconnect')).toBe(false);
    expect(isGoogleUserDataToolName('mcp__github__search_issues')).toBe(false);
    expect(isGoogleUserDataToolName('web_search')).toBe(false);
  });

  it('finds a Google tool call anywhere in the history', () => {
    expect(
      messagesCarryGoogleToolUse([
        { role: 'user', content: 'hi' },
        {
          role: 'assistant',
          tool_calls: [{ id: 'c', function: { name: 'mcp__google-drive__search_files' } }],
        },
      ]),
    ).toBe(true);
    expect(messagesCarryGoogleToolUse([{ role: 'user', content: 'mcp__gmail__x' }])).toBe(false);
  });
});

describe('conversationHoldsGoogleUserData', () => {
  it('is sticky once the conversation is marked', async () => {
    const { db } = database(() => [{ marked: true, project_id: null }]);
    await expect(conversationHoldsGoogleUserData(db, 'user-1', CONVERSATION_ID)).resolves.toBe(
      true,
    );
  });

  it('marks the conversation when its project holds a source imported from Google Drive', async () => {
    const { db, query } = database((sql) => {
      if (sql.includes('as marked')) return [{ marked: false, project_id: 'project-1' }];
      if (sql.includes('project_knowledge_files')) return [{ holds: true }];
      return [];
    });

    await expect(conversationHoldsGoogleUserData(db, 'user-1', CONVERSATION_ID)).resolves.toBe(
      true,
    );
    const update = query.mock.calls.find(([sql]) => sql.includes('set google_user_data_at'));
    expect(update?.[1]).toEqual([CONVERSATION_ID, 'user-1']);
  });

  it('fails closed when the marker cannot be read', async () => {
    const { db } = database(() => {
      throw new Error('column "google_user_data_at" does not exist');
    });
    await expect(conversationHoldsGoogleUserData(db, 'user-1', CONVERSATION_ID)).resolves.toBe(
      true,
    );
  });
});

describe('resolveGoogleUserDataTurn', () => {
  it('forces a turn where a connected Google connector is on', async () => {
    const { db } = database((sql) =>
      sql.includes('connector_oauth_grants') ? [{ connector_id: 'google-calendar' }] : [],
    );
    await expect(resolveGoogleUserDataTurn(db, 'user-1', plainTurn)).resolves.toBe('connectors');
  });

  it('leaves a turn alone when every connected Google connector is off for the chat', async () => {
    const { db } = database((sql) =>
      sql.includes('connector_oauth_grants') ? [{ connector_id: 'gmail' }] : [],
    );
    await expect(
      resolveGoogleUserDataTurn(db, 'user-1', { ...plainTurn, disabledConnectorIds: ['gmail'] }),
    ).resolves.toBeNull();
    await expect(
      resolveGoogleUserDataTurn(db, 'user-1', { ...plainTurn, connectorToolsEnabled: false }),
    ).resolves.toBeNull();
  });

  it('forces a research turn that reads a Google connector', async () => {
    const { db } = database(() => []);
    await expect(
      resolveGoogleUserDataTurn(db, 'user-1', {
        ...plainTurn,
        connectorToolsEnabled: false,
        researchConnectorIds: ['google-drive'],
      }),
    ).resolves.toBe('connectors');
  });

  it('forces a plain-text turn in a conversation that already holds Google data', async () => {
    const { db } = database((sql) =>
      sql.includes('as marked') ? [{ marked: true, project_id: null }] : [],
    );
    await expect(
      resolveGoogleUserDataTurn(db, 'user-1', {
        ...plainTurn,
        conversationId: CONVERSATION_ID,
        connectorToolsEnabled: false,
      }),
    ).resolves.toBe('conversation');
  });

  it('treats unreadable connector state as connected', async () => {
    const { db } = database(() => {
      throw new Error('connection reset');
    });
    await expect(resolveGoogleUserDataTurn(db, 'user-1', plainTurn)).resolves.toBe('connectors');
  });
});

describe('the Google connector set covers every Google-owned connector', () => {
  const inSet = new Set(GOOGLE_USER_DATA_CONNECTOR_IDS);

  it('includes every first-party connector served from a Google API host', () => {
    const google = (firstPartyTargets as Array<{ connectorId: string; url: string }>)
      .filter((target) => isGoogleApiUrl(target.url))
      .map((target) => target.connectorId);
    expect(google.length).toBeGreaterThan(0);
    expect(google.filter((id) => !inSet.has(id))).toEqual([]);
  });

  it('includes every directory entry Google publishes or hosts', () => {
    const google = (
      vendorDirectory as Array<{
        id: string;
        mcpUrl?: string | null;
        publisher?: { name?: string };
      }>
    )
      .filter(
        (entry) =>
          /^google\b/i.test(entry.publisher?.name ?? '') ||
          (entry.mcpUrl ? isGoogleApiUrl(entry.mcpUrl) : false),
      )
      .map((entry) => entry.id);
    expect(google).toContain('bigquery');
    expect(google.filter((id) => !inSet.has(id))).toEqual([]);
  });

  it('includes every OAuth connector that asks for a Google API scope', () => {
    const google = Object.entries(CONNECTOR_OAUTH_SCOPE_CEILINGS)
      .filter(([, scopes]) => [...scopes].some((scope) => isGoogleApiUrl(String(scope))))
      .map(([connectorId]) => connectorId);
    expect(google).toEqual(expect.arrayContaining(['gmail', 'google-sheets', 'youtube', 'gcp']));
    expect(google.filter((id) => !inSet.has(id))).toEqual([]);
  });

  it('recognizes a Google connector under its directory server id', () => {
    expect(isGoogleUserDataConnector(directoryServerId('bigquery'))).toBe(true);
    expect(isGoogleUserDataToolName(`mcp__${directoryServerId('bigquery')}__execute_sql`)).toBe(
      true,
    );
    expect(isGoogleUserDataConnector(directoryServerId('linear'))).toBe(false);
  });

  it('treats every trigger source named for a Google product as Google data', () => {
    const google = MANAGED_CLOUD_TRIGGER_SOURCES.filter((source) =>
      /^(gmail|google|youtube)/.test(source),
    );
    expect(google.length).toBeGreaterThan(0);
    expect(google.filter((source) => !GOOGLE_USER_DATA_TRIGGER_SOURCES.has(source))).toEqual([]);
  });
});

describe('turnHoldsGoogleUserData', () => {
  it('holds when a Google tool ran in a turn with no conversation', async () => {
    const { db, query } = database(() => []);
    await expect(
      turnHoldsGoogleUserData(db, 'user-1', {
        conversationId: null,
        messages: [],
        googleToolRan: true,
      }),
    ).resolves.toBe(true);
    expect(query).not.toHaveBeenCalled();
  });

  it('reads the conversation marker, and treats an unreadable one as holding', async () => {
    const clean = database(() => [{ marked: false, project_id: null }]);
    await expect(
      turnHoldsGoogleUserData(clean.db, 'user-1', {
        conversationId: CONVERSATION_ID,
        messages: [],
        googleToolRan: false,
      }),
    ).resolves.toBe(false);

    const broken = database(() => {
      throw new Error('connection reset');
    });
    await expect(
      turnHoldsGoogleUserData(broken.db, 'user-1', {
        conversationId: CONVERSATION_ID,
        messages: [],
        googleToolRan: false,
      }),
    ).resolves.toBe(true);
  });
});

describe('Google API hosts', () => {
  it('matches the host by domain suffix after parsing, never by substring', () => {
    expect(isGoogleApiUrl('https://sheets.googleapis.com/mcp')).toBe(true);
    expect(isGoogleApiUrl('https://googleapis.com/mcp')).toBe(true);
    expect(isGoogleApiUrl('https://mcp.google.com./v1')).toBe(true);
    expect(isGoogleApiUrl('https://evilgoogleapis.com/mcp')).toBe(false);
    expect(isGoogleApiUrl('https://googleapis.com.attacker.example/mcp')).toBe(false);
    expect(isGoogleApiUrl('https://attacker.example/?u=https://x.googleapis.com')).toBe(false);
    expect(isGoogleApiUrl('not a url')).toBe(false);
  });
});

describe('custom connectors served from Google', () => {
  function customDb(url: string) {
    return database((sql) =>
      sql.includes('from public.user_custom_connectors') ? [{ short_id: 'abc123', url }] : [],
    );
  }

  it('forces a turn where a Google-hosted custom connector is available', async () => {
    const { db } = customDb('https://bigquery.googleapis.com/mcp');
    await expect(resolveGoogleUserDataTurn(db, 'user-1', plainTurn)).resolves.toBe('connectors');
  });

  it('leaves a turn alone when that connector is off for the chat or is not Google-hosted', async () => {
    const google = customDb('https://bigquery.googleapis.com/mcp');
    await expect(
      resolveGoogleUserDataTurn(google.db, 'user-1', {
        ...plainTurn,
        disabledConnectorIds: ['custom-abc123'],
      }),
    ).resolves.toBeNull();
    const other = customDb('https://mcp.example.com/mcp');
    await expect(resolveGoogleUserDataTurn(other.db, 'user-1', plainTurn)).resolves.toBeNull();
  });

  it('forces research that names a Google-hosted custom connector', async () => {
    const { db } = customDb('https://bigquery.googleapis.com/mcp');
    await expect(
      resolveGoogleUserDataTurn(db, 'user-1', {
        ...plainTurn,
        connectorToolsEnabled: false,
        researchConnectorIds: ['custom-abc123'],
      }),
    ).resolves.toBe('connectors');
  });
});

describe('stored message evidence', () => {
  it('reads tool entries, observed offers and tool calls the way the backfill does', () => {
    expect(
      storedMessageToolServerIds({
        tools: [{ connectorId: 'gmail' }, { name: 'mcp__google-drive__search' }],
        toolInvocations: { observed: true, offered: ['mcp__youtube__search'] },
        tool_calls: [{ function: { name: 'mcp__custom-abc123__read' } }],
      }),
    ).toEqual(['gmail', 'google-drive', 'youtube', 'custom-abc123']);
    expect(
      storedMessageToolServerIds({
        toolInvocations: { observed: false, offered: ['mcp__gmail__search'] },
      }),
    ).toEqual([]);
  });

  it('treats a generic connector trigger as possibly Google', () => {
    expect(GOOGLE_USER_DATA_TRIGGER_SOURCES.has('connector')).toBe(true);
  });
});

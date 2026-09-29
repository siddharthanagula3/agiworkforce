import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  conversationHoldsGoogleUserData,
  isGoogleUserDataToolName,
  messagesCarryGoogleToolUse,
  resolveGoogleUserDataTurn,
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

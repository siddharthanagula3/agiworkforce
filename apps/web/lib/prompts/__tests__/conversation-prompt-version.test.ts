import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import {
  CHAT_SYSTEM_PROMPT_LEGACY_VERSION,
  CHAT_SYSTEM_PROMPT_PINNED_VERSION,
} from '../chat-system-prompt';
import {
  parseChatSystemPromptVersion,
  resolveConversationChatSystemPromptVersion,
  startsConversation,
} from '../conversation-prompt-version';

const scope = { conversationId: '00000000-0000-4000-8000-000000000001', userId: 'user-1' };

function fakeDb(query: (sql: string, params: unknown[]) => Promise<unknown[]>) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return query(sql, params);
    }),
  } as unknown as DatabaseAdapter;
  return { db, calls };
}

describe('the chat system prompt version a conversation keeps', () => {
  it('serves the version the conversation recorded, without writing', async () => {
    const { db, calls } = fakeDb(async () => []);

    await expect(
      resolveConversationChatSystemPromptVersion({
        db,
        scope,
        recorded: '2',
        startsConversation: true,
      }),
    ).resolves.toBe(2);
    expect(calls).toHaveLength(0);
  });

  it('keeps the legacy version for a conversation that began before versions were recorded', async () => {
    const { db, calls } = fakeDb(async () => []);

    await expect(
      resolveConversationChatSystemPromptVersion({
        db,
        scope,
        recorded: null,
        startsConversation: false,
      }),
    ).resolves.toBe(CHAT_SYSTEM_PROMPT_LEGACY_VERSION);
    expect(calls).toHaveLength(0);
  });

  it('records the pinned version on the first turn, once, and serves what the row holds', async () => {
    const { db, calls } = fakeDb(async (_sql, params) => [
      { chat_system_prompt_version: params[2] },
    ]);

    await expect(
      resolveConversationChatSystemPromptVersion({
        db,
        scope,
        recorded: null,
        startsConversation: true,
      }),
    ).resolves.toBe(CHAT_SYSTEM_PROMPT_PINNED_VERSION);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toMatch(/coalesce\(chat_system_prompt_version, \$3\)/);
    expect(calls[0]?.sql).toMatch(/where id = \$1\s+and user_id = \$2/);
    expect(calls[0]?.params).toEqual([
      scope.conversationId,
      scope.userId,
      CHAT_SYSTEM_PROMPT_PINNED_VERSION,
    ]);
  });

  it('serves the version a concurrent first turn already recorded', async () => {
    const { db } = fakeDb(async () => [{ chat_system_prompt_version: 3 }]);

    await expect(
      resolveConversationChatSystemPromptVersion({
        db,
        scope,
        recorded: null,
        startsConversation: true,
      }),
    ).resolves.toBe(3);
  });

  it.each([
    ['the column is not migrated yet', Object.assign(new Error('missing'), { code: '42703' })],
    ['the write fails', new Error('connection reset')],
  ])('falls back to the legacy version when %s', async (_case, error) => {
    const { db } = fakeDb(async () => {
      throw error;
    });

    await expect(
      resolveConversationChatSystemPromptVersion({
        db,
        scope,
        recorded: null,
        startsConversation: true,
      }),
    ).resolves.toBe(CHAT_SYSTEM_PROMPT_LEGACY_VERSION);
  });

  it('reads only versions the manifest holds', () => {
    expect(parseChatSystemPromptVersion('1')).toBe(1);
    expect(parseChatSystemPromptVersion(4)).toBe(4);
    expect(parseChatSystemPromptVersion('9999')).toBeNull();
    expect(parseChatSystemPromptVersion(null)).toBeNull();
    expect(parseChatSystemPromptVersion('two')).toBeNull();
  });

  it('treats a history with no assistant reply as the start of the conversation', () => {
    expect(startsConversation([{ role: 'system' }, { role: 'user' }])).toBe(true);
    expect(startsConversation([{ role: 'user' }, { role: 'assistant' }, { role: 'user' }])).toBe(
      false,
    );
  });
});

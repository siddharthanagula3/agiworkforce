import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: 'user-abc',
    organizationId: null,
  })),
}));

import { GET } from '@/app/api/search/route';
import { parseNewChatEntry } from '@features/chat/lib/new-chat-entry';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222';
const PROJECT_ID = '33333333-3333-4333-8333-333333333333';
const FILE_ID = '44444444-4444-4444-8444-444444444444';

const NOW = '2026-09-01T00:00:00.000Z';

function rowsFor(sql: string): unknown[] {
  if (sql.includes('from web_conversations')) {
    return [{ id: CONVERSATION_ID, title: 'Runway plan', created_at: NOW, updated_at: NOW }];
  }
  if (sql.includes('from user_projects')) {
    return [
      {
        id: PROJECT_ID,
        name: 'Runway model',
        description: 'runway spreadsheet',
        created_at: NOW,
        updated_at: NOW,
      },
    ];
  }
  if (sql.includes('from media_assets')) {
    return [
      {
        id: FILE_ID,
        kind: 'file',
        prompt: 'runway chart',
        metadata: { filename: 'runway.csv' },
        created_at: NOW,
      },
    ];
  }
  if (sql.includes('from web_messages')) {
    return [
      {
        id: MESSAGE_ID,
        conversation_id: CONVERSATION_ID,
        role: 'assistant',
        content: 'Our runway is eleven months at the current burn.',
        created_at: NOW,
        updated_at: NOW,
        session_title: 'Runway plan',
      },
    ];
  }
  return [];
}

function entryFor(href: string) {
  return parseNewChatEntry(new URLSearchParams(href.split('?')[1] ?? ''));
}

beforeEach(() => {
  mocks.query.mockReset();
  mocks.query.mockImplementation(async (sql: string) => rowsFor(String(sql)));
});

describe('GET /api/search, new chat from a result', () => {
  it('hands every result kind a new-chat link naming its own source', async () => {
    const response = await GET(new NextRequest('http://localhost/api/search?q=runway'));
    const body = (await response.json()) as {
      results: Array<{ type: string; newChatHref: string }>;
      projects: Array<{ newChatHref: string }>;
      files: Array<{ newChatHref: string }>;
    };

    const session = body.results.find((result) => result.type === 'session');
    const message = body.results.find((result) => result.type === 'message');

    expect(entryFor(session!.newChatHref)?.source).toEqual({
      kind: 'conversation',
      id: CONVERSATION_ID,
    });
    expect(entryFor(message!.newChatHref)?.source).toEqual({ kind: 'message', id: MESSAGE_ID });
    expect(entryFor(body.projects[0]!.newChatHref)?.source).toEqual({
      kind: 'project',
      id: PROJECT_ID,
    });
    expect(entryFor(body.files[0]!.newChatHref)?.source).toEqual({ kind: 'file', id: FILE_ID });
  });

  it('seeds the composer with the matched passage, quoted', async () => {
    const response = await GET(new NextRequest('http://localhost/api/search?q=runway'));
    const body = (await response.json()) as {
      results: Array<{ type: string; newChatHref: string }>;
    };

    const message = body.results.find((result) => result.type === 'message');
    const draft = entryFor(message!.newChatHref)?.draft ?? '';

    expect(draft.startsWith('> ')).toBe(true);
    expect(draft).toContain('runway is eleven months');
  });

  it('opens the new chat in chat mode, never in a work mode the user did not pick', async () => {
    const response = await GET(new NextRequest('http://localhost/api/search?q=runway'));
    const body = (await response.json()) as { results: Array<{ newChatHref: string }> };

    for (const result of body.results) {
      expect(result.newChatHref).not.toContain('mode=');
      expect(entryFor(result.newChatHref)?.workMode).toBe('chat');
    }
  });
});

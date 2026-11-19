import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { searchCloudAgentRuns } from './cloud-agent-run-search';
import { listCloudAgentRuns } from './cloud-agent-run-service';

const USER = 'user-owner';
const PROJECT = '44444444-4444-4444-8444-444444444444';
const CURSOR = {
  updatedAt: '2026-10-30T00:00:00.000Z',
  id: '00000000-0000-4000-8000-000000000009',
};

function runRow(index: number) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    user_id: USER,
    request_id: `agi.chat.web.send.turn-${index}`,
    conversation_id: null,
    origin_surface: 'web',
    work_mode: 'agiwork',
    state: 'completed',
    provider: 'anthropic',
    model: 'model-under-test',
    last_event_sequence: 1,
    cancellation_requested_at: null,
    completed_at: null,
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: `2026-11-01T10:00:${String(59 - index).padStart(2, '0')}.000Z`,
    conversation_title: `Invoice ${index}`,
  };
}

const query = vi.fn();
const db = { query } as unknown as DatabaseAdapter;

function issued(): { sql: string; params: unknown[] } {
  expect(query).toHaveBeenCalledTimes(1);
  const [sql, params] = query.mock.calls[0] as [string, unknown[]];
  return { sql, params };
}

function likeMatches(pattern: string, value: string): boolean {
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern.charAt(index);
    if (char === '\\') {
      index += 1;
      source += pattern.charAt(index).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else if (char === '%') source += '[\\s\\S]*';
    else if (char === '_') source += '[\\s\\S]';
    else source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`, 'i').test(value);
}

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue([]);
});

describe('searching Cloud tasks in SQL', () => {
  it('matches the title or the whole first prompt, ignoring case, in the list read itself', async () => {
    await searchCloudAgentRuns(db, {
      userId: USER,
      states: ['completed'],
      workModes: ['agiwork'],
      text: 'Quarterly report',
    });

    const { sql, params } = issued();
    expect(sql).toContain("conversations.title ilike $9 escape '\\'");
    expect(sql).toContain("first_prompt.content ilike $9 escape '\\'");
    expect(sql).toMatch(/\) as preview,\s+message\.content\s+from public\.web_messages message/);
    expect(params[8]).toBe('%Quarterly report%');
    expect(params).toHaveLength(9);
  });

  it('keeps the owner, state, cursor, work mode and project scope beside the text filter', async () => {
    await searchCloudAgentRuns(db, {
      userId: USER,
      states: ['completed'],
      workModes: ['agiwork'],
      projectId: PROJECT,
      before: CURSOR,
      limit: 2,
      text: 'invoice',
    });

    const { sql, params } = issued();
    expect(sql).toContain('runs.user_id = $1');
    expect(sql).toContain('runs.state = any($2::text[])');
    expect(sql).toContain('(runs.updated_at, runs.id) < ($4::timestamptz, $5::uuid)');
    expect(sql).toContain('runs.work_mode = any($7::text[])');
    expect(sql).toContain('conversations.project_id = $8::text');
    expect(params[0]).toBe(USER);
    expect(params[1]).toEqual(expect.arrayContaining(['completed']));
    expect(params[3]).toBe(CURSOR.updatedAt);
    expect(params[4]).toBe(CURSOR.id);
    expect(params[5]).toBe(3);
    expect(params[6]).toEqual(['agiwork']);
    expect(params[7]).toBe(PROJECT);
    expect(params[8]).toBe('%invoice%');
  });

  it('treats %, _ and the escape character as plain text', async () => {
    const cases: Array<{ text: string; pattern: string; hit: string; miss: string }> = [
      {
        text: '100%_done',
        pattern: '%100\\%\\_done%',
        hit: 'Compare 100%_done filings',
        miss: '100 x done',
      },
      { text: '100_', pattern: '%100\\_%', hit: 'ran 100_ times', miss: 'ran 1000 times' },
      { text: '%', pattern: '%\\%%', hit: 'grew 5% today', miss: 'grew today' },
      {
        text: 'C:\\temp',
        pattern: '%C:\\\\temp%',
        hit: 'open c:\\TEMP now',
        miss: 'open C:temp now',
      },
    ];

    for (const { text, pattern, hit, miss } of cases) {
      query.mockClear();
      await searchCloudAgentRuns(db, { userId: USER, states: ['completed'], text });
      const bound = String(issued().params[8]);

      expect(bound).toBe(pattern);
      expect(likeMatches(bound, hit)).toBe(true);
      expect(likeMatches(bound, miss)).toBe(false);
    }
  });

  it('trims the text and refuses an empty search before reading anything', async () => {
    await searchCloudAgentRuns(db, { userId: USER, states: ['completed'], text: '  invoice  ' });
    expect(issued().params[8]).toBe('%invoice%');

    query.mockClear();
    await expect(
      searchCloudAgentRuns(db, { userId: USER, states: ['completed'], text: '   ' }),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('leaves the list read without a text filter when nothing is searched', async () => {
    await listCloudAgentRuns(db, { userId: USER, states: ['completed'], projectId: PROJECT });

    const { sql, params } = issued();
    expect(sql).not.toContain('ilike');
    expect(params).toHaveLength(8);
    expect(params.at(-1)).toBe(PROJECT);
  });

  it('pages through matches with one read per page and no scan cap', async () => {
    const first = runRow(1);
    const second = runRow(2);
    query.mockResolvedValueOnce([first, second, runRow(3)]);

    const result = await searchCloudAgentRuns(db, {
      userId: USER,
      states: ['completed'],
      limit: 2,
      text: 'invoice',
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(result.runs.map((run) => run.id)).toEqual([first.id, second.id]);
    expect(result.next).toEqual({ updatedAt: second.updated_at, id: second.id });
  });

  it('ends the search on the last page', async () => {
    const only = runRow(1);
    query.mockResolvedValueOnce([only]);

    const result = await searchCloudAgentRuns(db, {
      userId: USER,
      states: ['completed'],
      limit: 2,
      text: 'invoice',
    });

    expect(result.runs.map((run) => run.id)).toEqual([only.id]);
    expect(result.next).toBeNull();
  });
});

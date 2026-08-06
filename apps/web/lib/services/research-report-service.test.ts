import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  ResearchReportValidationError,
  getResearchReportByRequestId,
  listResearchReports,
  saveResearchReport,
  type SaveResearchReportInput,
} from './research-report-service';

const ROW = {
  id: '0190a000-0000-7000-8000-000000000001',
  user_id: 'user-1',
  request_id: 'agi.chat.web.send.turn-1',
  conversation_id: '0190a000-0000-7000-8000-000000000099',
  query: 'What changed in 2026 pricing?',
  title: 'Pricing changes in 2026',
  summary: 'Prices rose across the board.',
  content: '## Overview\n\nPrices rose [1].',
  citations: [
    {
      id: '1',
      title: 'Source A',
      url: 'https://example.com/a',
      accessedAt: '2026-08-05T10:00:00.000Z',
    },
  ],
  steps: [{ id: 'step-1', type: 'search', description: 'Search pricing', status: 'completed' }],
  key_findings: ['Prices rose'],
  status: 'completed',
  sources_consulted: '7',
  duration_ms: '45000',
  error: null,
  model: 'gemini-3.6-flash',
  provider: 'google',
  created_at: '2026-08-05T10:00:00.000Z',
  updated_at: '2026-08-05T10:00:45.000Z',
  completed_at: '2026-08-05T10:00:45.000Z',
};

function database(rows: unknown[] = [ROW]): DatabaseAdapter & { query: ReturnType<typeof vi.fn> } {
  const db = {
    query: vi.fn().mockResolvedValue(rows),
    execute: vi.fn(),
    transaction: vi.fn(),
    withUser: vi.fn(),
    dispose: vi.fn(),
  };
  return db as unknown as DatabaseAdapter & { query: ReturnType<typeof vi.fn> };
}

function input(overrides: Partial<SaveResearchReportInput> = {}): SaveResearchReportInput {
  return {
    userId: 'user-1',
    requestId: 'agi.chat.web.send.turn-1',
    conversationId: '0190a000-0000-7000-8000-000000000099',
    query: 'What changed in 2026 pricing?',
    title: 'Pricing changes in 2026',
    summary: 'Prices rose across the board.',
    content: '## Overview\n\nPrices rose [1].',
    citations: [
      {
        id: '1',
        title: 'Source A',
        url: 'https://example.com/a',
        accessedAt: '2026-08-05T10:00:00.000Z',
      },
    ],
    steps: [{ id: 'step-1', type: 'search', description: 'Search pricing', status: 'completed' }],
    keyFindings: ['Prices rose'],
    status: 'completed',
    sourcesConsulted: 7,
    durationMs: 45_000,
    model: 'gemini-3.6-flash',
    provider: 'google',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('saveResearchReport', () => {
  it('upserts on (user_id, request_id) and returns the contract-shaped report', async () => {
    const db = database();

    const report = await saveResearchReport(db, input());

    const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('insert into public.research_reports');
    expect(sql).toContain('on conflict (user_id, request_id) do update set');
    expect(params[0]).toBe('user-1');
    expect(params[1]).toBe('agi.chat.web.send.turn-1');
    expect(params[2]).toBe('0190a000-0000-7000-8000-000000000099');
    expect(params[10]).toBe('completed');
    expect(params[11]).toBe(7);
    expect(params[12]).toBe(45_000);

    expect(report).toMatchObject({
      id: ROW.id,
      queryId: 'agi.chat.web.send.turn-1',
      requestId: 'agi.chat.web.send.turn-1',
      userId: 'user-1',
      conversationId: '0190a000-0000-7000-8000-000000000099',
      status: 'completed',
      sourcesConsulted: 7,
      totalDurationMs: 45_000,
      keyFindings: ['Prices rose'],
    });
    expect(report.citations).toHaveLength(1);
    expect(report.steps).toHaveLength(1);
  });

  it('sets completed_at only for a completed run', async () => {
    const db = database([{ ...ROW, status: 'interrupted', completed_at: null }]);

    const report = await saveResearchReport(db, input({ status: 'interrupted' }));

    const [sql] = db.query.mock.calls[0] as [string];
    expect(sql).toContain("case when $11 = 'completed' then now() else null end");
    expect(sql).toContain("when excluded.status = 'completed' then now()");
    expect(report.status).toBe('interrupted');
    expect(report.completedAt).toBeUndefined();
  });

  it('persists an interrupted run with its honest error text', async () => {
    const db = database([
      { ...ROW, status: 'interrupted', completed_at: null, error: 'client cancelled' },
    ]);

    const report = await saveResearchReport(
      db,
      input({ status: 'interrupted', error: 'client cancelled' }),
    );

    const [, params] = db.query.mock.calls[0] as [string, unknown[]];
    expect(params[13]).toBe('client cancelled');
    expect(report.error).toBe('client cancelled');
  });

  it('drops malformed citations and steps rather than storing stubs', async () => {
    const db = database();

    await saveResearchReport(
      db,
      input({
        citations: [
          { id: '1', title: 'Good', url: 'https://ok.com', accessedAt: 'now' },
          { id: '2', title: 'No url', url: '', accessedAt: 'now' },
          null as never,
        ],
        steps: [
          { id: 'a', type: 'search', description: 'ok', status: 'completed' },
          { id: '', type: 'search', description: 'bad id', status: 'completed' },
          { id: 'c', type: 'browse', description: 'bad type', status: 'completed' } as never,
        ],
      }),
    );

    const [, params] = db.query.mock.calls[0] as [string, unknown[]];
    expect(JSON.parse(params[7] as string)).toHaveLength(1);
    expect(JSON.parse(params[8] as string)).toHaveLength(1);
  });

  it('clamps oversized model output instead of writing an unbounded row', async () => {
    const db = database();

    await saveResearchReport(db, input({ content: 'x'.repeat(600_000), title: 'y'.repeat(900) }));

    const [, params] = db.query.mock.calls[0] as [string, unknown[]];
    expect((params[6] as string).length).toBe(400_000);
    expect((params[4] as string).length).toBe(500);
  });

  it('rejects an unknown status, a missing user, and a missing request id', async () => {
    const db = database();

    await expect(
      saveResearchReport(db, input({ status: 'cancelled' as never })),
    ).rejects.toBeInstanceOf(ResearchReportValidationError);
    await expect(saveResearchReport(db, input({ userId: '  ' }))).rejects.toBeInstanceOf(
      ResearchReportValidationError,
    );
    await expect(saveResearchReport(db, input({ requestId: '' }))).rejects.toBeInstanceOf(
      ResearchReportValidationError,
    );
    expect(db.query).not.toHaveBeenCalled();
  });

  it('throws instead of reporting success when RLS returns no row', async () => {
    const db = database([]);

    await expect(saveResearchReport(db, input())).rejects.toThrow(/row-level security/i);
  });

  it('normalizes a non-finite duration and a negative source count', async () => {
    const db = database();

    await saveResearchReport(db, input({ durationMs: Number.NaN, sourcesConsulted: -3 }));

    const [, params] = db.query.mock.calls[0] as [string, unknown[]];
    expect(params[12]).toBeNull();
    expect(params[11]).toBe(0);
  });
});

describe('getResearchReportByRequestId', () => {
  it('scopes the read to the owning user and request', async () => {
    const db = database();

    const report = await getResearchReportByRequestId(db, {
      userId: 'user-1',
      requestId: 'agi.chat.web.send.turn-1',
    });

    const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('where user_id = $1 and request_id = $2');
    expect(params).toEqual(['user-1', 'agi.chat.web.send.turn-1']);
    expect(report?.id).toBe(ROW.id);
  });

  it('returns null without querying when identifiers are missing', async () => {
    const db = database();

    expect(await getResearchReportByRequestId(db, { userId: '', requestId: 'r' })).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('reports an out-of-contract stored status as failed rather than casting it', async () => {
    const db = database([{ ...ROW, status: 'weird' }]);

    const report = await getResearchReportByRequestId(db, {
      userId: 'user-1',
      requestId: 'r',
    });

    expect(report?.status).toBe('failed');
  });
});

describe('listResearchReports', () => {
  it('filters by conversation when one is given and caps the limit', async () => {
    const db = database();

    await listResearchReports(db, {
      userId: 'user-1',
      conversationId: 'conv-1',
      limit: 5_000,
    });

    const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('and conversation_id = $2');
    expect(params).toEqual(['user-1', 'conv-1', 100]);
  });

  it('falls back to the user-wide list with a default limit', async () => {
    const db = database();

    await listResearchReports(db, { userId: 'user-1' });

    const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toContain('conversation_id');
    expect(params).toEqual(['user-1', 20]);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const mocks = vi.hoisted(() => ({ privilegedQuery: vi.fn(), scopedQuery: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: mocks.privilegedQuery }),
}));

const { resolveProductLink } = await import('../product-link-resolver');

const ID = '5b0f1c1e-1d7a-4c55-9a8e-6f1f6f3f2a10';
const db = { query: mocks.scopedQuery } as unknown as DatabaseAdapter;
const NOW = new Date('2026-09-17T12:00:00.000Z');

function scopedRows(rows: unknown[]) {
  mocks.scopedQuery.mockResolvedValue(rows);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.privilegedQuery.mockResolvedValue([]);
});

describe('resolveProductLink', () => {
  it('opens a Work run in Work history', async () => {
    scopedRows([{ id: ID, origin_surface: 'web' }]);
    await expect(resolveProductLink(db, 'user-1', { target: 'work', id: ID })).resolves.toEqual({
      status: 'ready',
      href: `/tasks?run=${ID}`,
    });
    expect(mocks.scopedQuery.mock.calls[0]![1]).toEqual([ID, 'user-1']);
  });

  it('opens a browser task only for a run the Chrome extension started', async () => {
    scopedRows([{ id: ID, origin_surface: 'chrome' }]);
    await expect(
      resolveProductLink(db, 'user-1', { target: 'browser-task', id: ID }),
    ).resolves.toMatchObject({ status: 'ready' });

    scopedRows([{ id: ID, origin_surface: 'web' }]);
    await expect(
      resolveProductLink(db, 'user-1', { target: 'browser-task', id: ID }),
    ).resolves.toEqual({ status: 'not_found' });
  });

  it('opens a research report in the chat that produced it', async () => {
    scopedRows([
      { conversation_id: 'conv-1', conversation_deleted_at: null, conversation_exists: true },
    ]);
    await expect(resolveProductLink(db, 'user-1', { target: 'research', id: ID })).resolves.toEqual(
      { status: 'ready', href: '/chat/conv-1' },
    );
  });

  it('reports a research report whose chat was deleted as deleted', async () => {
    scopedRows([
      {
        conversation_id: 'conv-1',
        conversation_deleted_at: '2026-09-10T00:00:00.000Z',
        conversation_exists: true,
      },
    ]);
    await expect(resolveProductLink(db, 'user-1', { target: 'research', id: ID })).resolves.toEqual(
      { status: 'deleted' },
    );
  });

  it('focuses a live schedule and calls an ended one expired', async () => {
    scopedRows([{ id: ID, status: 'active', expires_at: null }]);
    await expect(
      resolveProductLink(db, 'user-1', { target: 'schedule', id: ID }, NOW),
    ).resolves.toEqual({ status: 'ready', href: `/chat/schedules?schedule=${ID}` });

    scopedRows([{ id: ID, status: 'active', expires_at: '2026-09-01T00:00:00.000Z' }]);
    await expect(
      resolveProductLink(db, 'user-1', { target: 'schedule', id: ID }, NOW),
    ).resolves.toEqual({ status: 'expired' });

    scopedRows([{ id: ID, status: 'expired', expires_at: null }]);
    await expect(
      resolveProductLink(db, 'user-1', { target: 'schedule', id: ID }, NOW),
    ).resolves.toEqual({ status: 'expired' });
  });

  it('opens a file or artifact in Library on the right tab, searched down to it', async () => {
    scopedRows([
      { id: ID, surface: 'artifact', filename: 'dashboard.html', prompt: null, deleted_at: null },
    ]);
    await expect(resolveProductLink(db, 'user-1', { target: 'artifact', id: ID })).resolves.toEqual(
      {
        status: 'ready',
        href: `/chat/library?surface=artifact&item=${ID}&q=dashboard.html`,
      },
    );
  });

  it('reports a soft-deleted file as deleted', async () => {
    scopedRows([
      {
        id: ID,
        surface: 'file',
        filename: 'q3.pdf',
        prompt: null,
        deleted_at: '2026-09-15T00:00:00.000Z',
      },
    ]);
    await expect(resolveProductLink(db, 'user-1', { target: 'file', id: ID })).resolves.toEqual({
      status: 'deleted',
    });
  });

  it('tells apart something that belongs to another account from something that does not exist', async () => {
    scopedRows([]);
    mocks.privilegedQuery.mockResolvedValueOnce([{ found: 1 }]);
    await expect(resolveProductLink(db, 'user-1', { target: 'work', id: ID })).resolves.toEqual({
      status: 'unauthorized',
    });
    expect(mocks.privilegedQuery.mock.calls[0]![0]).toContain('from public.cloud_agent_runs');

    mocks.privilegedQuery.mockResolvedValueOnce([]);
    await expect(resolveProductLink(db, 'user-1', { target: 'file', id: ID })).resolves.toEqual({
      status: 'not_found',
    });
    expect(mocks.privilegedQuery.mock.calls[1]![0]).toContain('from public.media_assets');
  });

  it('never queries for an id that cannot be a row key', async () => {
    await expect(
      resolveProductLink(db, 'user-1', { target: 'schedule', id: 'not-a-uuid' }),
    ).resolves.toEqual({ status: 'not_found' });
    expect(mocks.scopedQuery).not.toHaveBeenCalled();
    expect(mocks.privilegedQuery).not.toHaveBeenCalled();
  });
});

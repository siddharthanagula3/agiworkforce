import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const query = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  getNeonDb: () => ({ query }),
}));

import { parseReportAsset, readContentReportQueue } from '../content-report-triage';

function row(asset: unknown) {
  return {
    id: 'r-1',
    client_report_id: 'client-1',
    user_id: null,
    message_id: 'm-1',
    conversation_id: 'c-1',
    category: 'harmful',
    content_excerpt: 'a prompt',
    user_note: '',
    asset,
    status: 'received',
    reviewer_id: null,
    reviewer_note: null,
    reviewed_at: null,
    created_at: '2026-11-08T00:00:00.000Z',
  };
}

describe('the media a content report carries', () => {
  beforeEach(() => query.mockReset());

  it('reads the stored asset reference with the queue', async () => {
    query.mockResolvedValue([row({ kind: 'video', url: 'https://cdn.example/v.mp4' })]);

    const [report] = await readContentReportQueue();

    expect(query.mock.calls[0]![0]).toContain("metadata -> 'asset' as asset");
    expect(report?.asset).toEqual({
      kind: 'video',
      reference: 'https://cdn.example/v.mp4',
      inlineHeaderOnly: false,
    });
  });

  it('marks an inline data header so it is not mistaken for a locatable file', () => {
    expect(parseReportAsset({ kind: 'image', url: 'data:image/png;base64' })).toEqual({
      kind: 'image',
      reference: 'data:image/png;base64',
      inlineHeaderOnly: true,
    });
  });

  it('reports no asset for a report that carried none or a malformed one', async () => {
    query.mockResolvedValue([
      row(null),
      row({ kind: 'audio', url: 'https://cdn.example/a.mp3' }),
      row({ kind: 'image', url: '   ' }),
      row('https://cdn.example/x.png'),
    ]);

    const reports = await readContentReportQueue();

    expect(reports.map((report) => report.asset)).toEqual([null, null, null, null]);
  });

  it('bounds the reference it hands to a reviewer', () => {
    const parsed = parseReportAsset({
      kind: 'image',
      url: `https://cdn.example/${'a'.repeat(5000)}`,
    });
    expect(parsed?.reference.length).toBe(2048);
  });
});

type ImportedModule0 = typeof import('@/lib/server/neon-db');

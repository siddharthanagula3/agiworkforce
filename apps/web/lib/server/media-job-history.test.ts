import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/media-storage', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  authenticatedMediaUrl: (assetId: string) => `/api/media/${assetId}`,
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { listMediaJobHistory } from './media-job-history';

const CREATED = '2026-11-09T10:00:00.000Z';

function imageRow(overrides: Record<string, unknown>) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    status: 'failed',
    operation: 'generate',
    prompt: 'a lighthouse',
    model: 'image-model',
    retryable: false,
    attempts: 1,
    max_attempts: 3,
    terminal_at: null,
    public_error: 'The image service is busy.',
    cancel_requested_at: null,
    conversation_id: null,
    created_at: CREATED,
    updated_at: CREATED,
    asset_ids: [],
    ...overrides,
  };
}

function dbReturning(images: Array<Record<string, unknown>>): DatabaseAdapter {
  return {
    query: vi.fn(async (sql: string) => (sql.includes('image_generation_jobs') ? images : [])),
  } as unknown as DatabaseAdapter;
}

async function onlyJob(row: Record<string, unknown>) {
  const jobs = await listMediaJobHistory(dbReturning([row]), 'user-1', null);
  expect(jobs).toHaveLength(1);
  return jobs[0]!;
}

describe('image jobs awaiting their next attempt in the media history', () => {
  it('shows a deferred attempt as queued and cancellable, not as a terminal failure', async () => {
    const job = await onlyJob(imageRow({ retryable: true }));
    expect(job.status).toBe('queued');
    expect(job.cancellable).toBe(true);
    expect(job.retryable).toBe(true);
    expect(job.error).toBeNull();
  });

  it('keeps a deferred attempt whose cancellation is pending queued but not cancellable again', async () => {
    const job = await onlyJob(
      imageRow({ retryable: true, cancel_requested_at: '2026-11-09T10:01:00.000Z' }),
    );
    expect(job.status).toBe('queued');
    expect(job.cancellable).toBe(false);
    expect(job.retryable).toBe(false);
  });

  it('shows a closed failure as failed with its reason and no cancel', async () => {
    const job = await onlyJob(imageRow({ terminal_at: CREATED }));
    expect(job.status).toBe('failed');
    expect(job.cancellable).toBe(false);
    expect(job.error).toBe('The image service is busy.');
  });

  it('shows a failure with no attempts left as failed even if it still reads as retryable', async () => {
    const job = await onlyJob(imageRow({ retryable: true, attempts: 3 }));
    expect(job.status).toBe('failed');
    expect(job.cancellable).toBe(false);
    expect(job.retryable).toBe(false);
  });

  it('keeps a running attempt running and cancellable', async () => {
    const job = await onlyJob(imageRow({ status: 'processing' }));
    expect(job.status).toBe('running');
    expect(job.cancellable).toBe(true);
  });
});

type ImportedModule0 = typeof import('@/lib/server/media-storage');

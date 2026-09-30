import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { MEDIA_JOB_HISTORY_MAX, type MediaJobEntry } from '@agiworkforce/cloud-contracts';

import { authenticatedMediaUrl } from '@/lib/server/media-storage';

type MediaJobStatus = MediaJobEntry['status'];

const IMAGE_JOB_STATUS: Readonly<Record<string, MediaJobStatus>> = {
  queued: 'queued',
  processing: 'running',
  completed: 'done',
  failed: 'failed',
  canceled: 'cancelled',
};

const VIDEO_JOB_STATUS: Readonly<Record<string, MediaJobStatus>> = {
  submitting: 'queued',
  queued: 'queued',
  processing: 'running',
  completed: 'done',
  failed: 'failed',
  outcome_unknown: 'failed',
};

const RETRYABLE_IMAGE_OPERATION = 'generate';
const UNDEFINED_TABLE = '42P01';

interface ImageJobRow {
  id: string;
  status: string;
  operation: string;
  prompt: string;
  model: string;
  retryable: boolean;
  public_error: string | null;
  cancel_requested_at: string | Date | null;
  conversation_id: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  asset_ids: string[] | null;
}

interface VideoJobRow {
  id: string;
  status: string;
  prompt: string;
  model: string;
  public_error: string | null;
  cancel_requested_at: string | Date | null;
  progress: number | null;
  asset_id: string | null;
  conversation_id: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isUndefinedTable(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === UNDEFINED_TABLE;
}

function inFlight(status: MediaJobStatus): boolean {
  return status === 'queued' || status === 'running';
}

async function imageJobs(
  db: DatabaseAdapter,
  userId: string,
  organizationId: string | null,
): Promise<MediaJobEntry[]> {
  const rows = await db.query<ImageJobRow>(
    `select jobs.id, jobs.status, jobs.operation, jobs.prompt, jobs.model, jobs.retryable,
            jobs.public_error, jobs.cancel_requested_at, jobs.conversation_id,
            jobs.created_at, jobs.updated_at,
            array_remove(array_agg(assets.asset_id order by assets.candidate_index), null) as asset_ids
       from public.image_generation_jobs jobs
       left join public.image_generation_job_assets assets
              on assets.job_id = jobs.id and assets.user_id = $1
      where jobs.user_id = $1
        and jobs.organization_id is not distinct from $2::uuid
        and not exists (
          select 1 from public.web_conversations c
           where c.id = jobs.conversation_id
             and (coalesce(c.is_temporary, false) or c.deleted_at is not null)
        )
        and (
          not jobs.temporary_chat
          or exists (
            select 1 from public.web_conversations c
             where c.id = jobs.conversation_id
               and not coalesce(c.is_temporary, false)
               and c.deleted_at is null
          )
        )
      group by jobs.id
      order by jobs.created_at desc
      limit $3`,
    [userId, organizationId, MEDIA_JOB_HISTORY_MAX],
  );
  return rows.map((row) => {
    const status = IMAGE_JOB_STATUS[row.status] ?? 'failed';
    return {
      id: row.id,
      kind: 'image',
      status,
      prompt: row.prompt,
      model: row.model,
      created_at: iso(row.created_at),
      updated_at: iso(row.updated_at),
      error: status === 'failed' ? row.public_error : null,
      retryable:
        status === 'failed' && row.retryable && row.operation === RETRYABLE_IMAGE_OPERATION,
      cancellable: inFlight(status) && row.cancel_requested_at === null,
      progress: null,
      result_urls: (row.asset_ids ?? []).map(authenticatedMediaUrl),
      conversation_id: row.conversation_id,
    };
  });
}

async function videoJobs(
  db: DatabaseAdapter,
  userId: string,
  organizationId: string | null,
): Promise<MediaJobEntry[]> {
  const rows = await db.query<VideoJobRow>(
    `select id, status, prompt, model, public_error, cancel_requested_at, progress, asset_id,
            conversation_id, created_at, updated_at
       from public.video_generation_jobs jobs
      where jobs.user_id = $1
        and jobs.organization_id is not distinct from $2::uuid
        and not exists (
          select 1 from public.web_conversations c
           where c.id = jobs.conversation_id
             and (coalesce(c.is_temporary, false) or c.deleted_at is not null)
        )
        and (
          not jobs.temporary_chat
          or exists (
            select 1 from public.web_conversations c
             where c.id = jobs.conversation_id
               and not coalesce(c.is_temporary, false)
               and c.deleted_at is null
          )
        )
      order by jobs.created_at desc
      limit $3`,
    [userId, organizationId, MEDIA_JOB_HISTORY_MAX],
  );
  return rows.map((row) => {
    const status = VIDEO_JOB_STATUS[row.status] ?? 'failed';
    return {
      id: row.id,
      kind: 'video',
      status,
      prompt: row.prompt,
      model: row.model,
      created_at: iso(row.created_at),
      updated_at: iso(row.updated_at),
      error: status === 'failed' ? row.public_error : null,
      retryable: false,
      cancellable: inFlight(status) && row.cancel_requested_at === null,
      progress: inFlight(status) ? row.progress : null,
      result_urls: row.asset_id ? [authenticatedMediaUrl(row.asset_id)] : [],
      conversation_id: row.conversation_id,
    };
  });
}

async function orEmpty(read: Promise<MediaJobEntry[]>): Promise<MediaJobEntry[]> {
  try {
    return await read;
  } catch (error) {
    if (isUndefinedTable(error)) return [];
    throw error;
  }
}

export async function listMediaJobHistory(
  db: DatabaseAdapter,
  userId: string,
  organizationId: string | null,
): Promise<MediaJobEntry[]> {
  const [images, videos] = await Promise.all([
    orEmpty(imageJobs(db, userId, organizationId)),
    orEmpty(videoJobs(db, userId, organizationId)),
  ]);
  return [...images, ...videos]
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
    .slice(0, MEDIA_JOB_HISTORY_MAX);
}

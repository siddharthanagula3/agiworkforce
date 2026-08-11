import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { authenticatedMediaUrl } from '@/lib/server/media-storage';
import type { VideoGenerationJob } from '@/lib/server/video-generation-jobs';

export type VideoTranscriptSyncDisposition = 'updated' | 'detached' | 'not_found';

export interface VideoTranscriptFailureRow {
  content: string;
  model: string | null;
  provider: string | null;
  metadata: Record<string, unknown>;
}

export type UnboundVideoTranscriptFailureResult =
  | { disposition: 'updated' | 'protected'; message: VideoTranscriptFailureRow }
  | { disposition: 'not_found' };

function transcriptStatus(
  status: VideoGenerationJob['status'],
): 'queued' | 'processing' | 'completed' | 'failed' {
  if (status === 'submitting') return 'queued';
  if (status === 'outcome_unknown') return 'failed';
  return status;
}

/**
 * Project the durable paid-job state into its original Web chat placeholder.
 *
 * The job remains authoritative. This update is an idempotent projection and
 * explicitly joins the owning conversation/user, so a system Workflow cannot
 * write an identically-shaped message belonging to another tenant. Chat rows
 * may be deleted independently; a detached projection never aborts billing or
 * provider reconciliation.
 */
export async function syncVideoGenerationTranscript(
  db: DatabaseAdapter,
  job: VideoGenerationJob,
): Promise<VideoTranscriptSyncDisposition> {
  if (!job.conversationId || !job.assistantMessageId) return 'detached';

  const status = transcriptStatus(job.status);
  const metadataPatch: Record<string, unknown> = {
    toolType: 'video-generation',
    videoTaskId: job.id,
    videoStatus: status,
    videoProvider: job.provider,
    videoModel: job.model,
    ...(job.progress == null ? {} : { videoProgress: job.progress }),
    ...(status === 'completed' && job.assetId
      ? { videoUrl: authenticatedMediaUrl(job.assetId) }
      : {}),
    ...(status === 'failed' && job.publicError ? { videoError: job.publicError } : {}),
    videoRetryable: job.status === 'failed',
  };
  const terminalError =
    status === 'failed' ? (job.publicError ?? 'Video generation failed.') : null;
  const rows = await db.query<{ id: string }>(
    `update public.web_messages message
        set model = $4,
            provider = $5,
            content = case when $6::text is null then message.content else $6::text end,
            metadata = coalesce(message.metadata, '{}'::jsonb) || $7::jsonb
       from public.web_conversations conversation
      where message.id = $1
        and message.conversation_id = $2
        and message.role = 'assistant'
        and conversation.id = message.conversation_id
        and conversation.user_id = $3
        and conversation.deleted_at is null
      returning message.id`,
    [
      job.assistantMessageId,
      job.conversationId,
      job.userId,
      job.model,
      job.provider,
      terminalError,
      JSON.stringify(metadataPatch),
    ],
  );
  return rows[0] ? 'updated' : 'not_found';
}

/**
 * Persist a definite HTTP start rejection without racing a server-owned job.
 * The absence of videoTaskId is the compare-and-set boundary: once job
 * creation binds that id in the same transaction, no client-observed error can
 * replace its authoritative queued/completed/failure projection.
 */
export async function failUnboundVideoGenerationTranscript(input: {
  db: DatabaseAdapter;
  userId: string;
  conversationId: string;
  assistantMessageId: string;
  publicError: string;
}): Promise<UnboundVideoTranscriptFailureResult> {
  const publicError = input.publicError.trim().slice(0, 500) || 'Video generation did not start.';
  const content = `Video generation failed: ${publicError}`;
  const metadataPatch = JSON.stringify({
    toolType: 'video-generation',
    videoStatus: 'failed',
    videoError: publicError,
    videoRetryable: true,
  });
  const rows = await input.db.query<VideoTranscriptFailureRow>(
    `update public.web_messages message
        set content = $4,
            metadata = coalesce(message.metadata, '{}'::jsonb) || $5::jsonb
       from public.web_conversations conversation
      where message.id = $1
        and message.conversation_id = $2
        and message.role = 'assistant'
        and message.metadata->>'toolType' = 'video-generation'
        and nullif(btrim(message.metadata->>'videoTaskId'), '') is null
        and conversation.id = message.conversation_id
        and conversation.user_id = $3
        and conversation.deleted_at is null
      returning message.content, message.model, message.provider, message.metadata`,
    [input.assistantMessageId, input.conversationId, input.userId, content, metadataPatch],
  );
  if (rows[0]) return { disposition: 'updated', message: rows[0] };

  const existing = await input.db.query<VideoTranscriptFailureRow>(
    `select message.content, message.model, message.provider, message.metadata
       from public.web_messages message
       join public.web_conversations conversation
         on conversation.id = message.conversation_id
      where message.id = $1
        and message.conversation_id = $2
        and message.role = 'assistant'
        and message.metadata->>'toolType' = 'video-generation'
        and conversation.user_id = $3
        and conversation.deleted_at is null
      limit 1`,
    [input.assistantMessageId, input.conversationId, input.userId],
  );
  return existing[0]
    ? { disposition: 'protected', message: existing[0] }
    : { disposition: 'not_found' };
}

import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import {
  claimVideoCompletionNotice,
  type VideoGenerationJob,
} from '@/lib/server/video-generation-jobs';
import { recordNotification } from './notification-service';
import { sendPushToUser } from './push-notification-service';

/**
 * Tell a video job's owner it finished.
 *
 * The job is driven to its terminal state by its own Workflow, so it completes
 * whether or not the tab that started it is still open. The transcript row was
 * already updated for the next load; what was missing was any way to learn that
 * without going back and looking. This is that delivery, over the push
 * transports the account has already registered -- no new channel, and no
 * notice at all for an account that registered none.
 *
 * Delivery is at most once by construction: the claim is a conditional update
 * on the job row, so of the several reconcilers that can observe one terminal
 * transition exactly one sends. A transport failure is logged rather than
 * retried, because the result it announces is already durable and the next load
 * shows it regardless.
 */

const MAX_ERROR_CHARS = 140;

/** The mobile client's `data.type` and route for a notice that opens a chat. */
const MOBILE_NOTIFICATION_TYPE = 'chat_message';
const MOBILE_ROUTE = '/(app)/(tabs)/chat';

function describe(job: VideoGenerationJob): { title: string; body: string } {
  if (job.status === 'completed') {
    return { title: 'Your video is ready', body: 'Open the chat to watch it.' };
  }
  if (job.status === 'outcome_unknown') {
    return {
      title: 'Your video could not be confirmed',
      body: 'The provider did not report an outcome. Open the chat to see where it stands.',
    };
  }
  const reason = job.publicError?.trim().slice(0, MAX_ERROR_CHARS);
  return {
    title: 'Your video did not finish',
    body: reason || 'Video generation failed. Open the chat to try again.',
  };
}

export async function deliverVideoCompletionNotice(
  db: DatabaseAdapter,
  job: VideoGenerationJob,
): Promise<boolean> {
  let claimed: boolean;
  try {
    claimed = await claimVideoCompletionNotice({ db, jobId: job.id, userId: job.userId });
  } catch (error) {
    logger.warn({ error, jobId: job.id }, '[notifications] video completion notice claim failed');
    return false;
  }
  if (!claimed) return false;

  const { title, body } = describe(job);
  await recordNotification(db, {
    userId: job.userId,
    category: 'media',
    severity:
      job.status === 'completed'
        ? 'success'
        : job.status === 'outcome_unknown'
          ? 'warning'
          : 'error',
    title,
    message: body,
    target: job.conversationId ? { kind: 'chat', id: job.conversationId } : null,
    dedupeKey: `video-job:${job.id}`,
  });
  const data: Record<string, string> = {
    type: MOBILE_NOTIFICATION_TYPE,
    route: MOBILE_ROUTE,
    videoJobId: job.id,
    ...(job.conversationId ? { conversationId: job.conversationId } : {}),
    ...(job.assistantMessageId ? { messageId: job.assistantMessageId } : {}),
  };

  try {
    const result = await sendPushToUser(job.userId, { title, body, data });
    return result.sent > 0;
  } catch (error) {
    logger.warn({ error, jobId: job.id }, '[notifications] video completion notice failed');
    return false;
  }
}

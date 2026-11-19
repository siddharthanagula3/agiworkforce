import { api, apiFetch } from '@/services/api';
import { ApiHttpError } from '@/services/apiErrors';
import {
  FEEDBACK_PATH,
  managedCloudMessagePath,
  RESPONSE_RATING_COMMENT_MAX_CHARS,
  responseRatingFeedbackBody,
  responseRatingRemovePath,
  type ResponseRating,
  type ResponseRatingReason,
} from '@agiworkforce/cloud-contracts';
import { feedbackClientContext } from '@/src/features/feedback/clientContext';
import {
  assertCloudAccountEpochCurrent,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';

function isNotFound(error: unknown): boolean {
  return error instanceof ApiHttpError && error.status === 404;
}

export async function deleteCloudMessagesRemote(
  conversationId: string,
  messageIds: readonly string[],
  accountEpoch?: CloudAccountEpoch | null,
): Promise<void> {
  for (const messageId of messageIds) {
    if (accountEpoch !== undefined) assertCloudAccountEpochCurrent(accountEpoch);
    try {
      await api.delete(managedCloudMessagePath(conversationId, messageId));
    } catch (error) {
      if (isNotFound(error)) continue;
      throw error;
    }
  }
}

export async function setCloudMessageReactionRemote(
  conversationId: string,
  messageId: string,
  reaction: 'thumbsUp' | 'thumbsDown' | null,
  accountEpoch?: CloudAccountEpoch | null,
): Promise<void> {
  if (accountEpoch !== undefined) assertCloudAccountEpochCurrent(accountEpoch);
  await api.patch(managedCloudMessagePath(conversationId, messageId), { reaction });
}

export interface ResponseRatingDetailsInput {
  reason: ResponseRatingReason | null;
  comment: string;
}

function responseRatingRequest(
  conversationId: string,
  messageId: string,
  rating: ResponseRating | null,
  details?: ResponseRatingDetailsInput,
): [path: string, init: RequestInit] {
  if (rating === null) return [responseRatingRemovePath(messageId), { method: 'DELETE' }];
  const client = feedbackClientContext('cloud');
  const comment = details?.comment.trim().slice(0, RESPONSE_RATING_COMMENT_MAX_CHARS);
  const body = responseRatingFeedbackBody({
    rating,
    messageId,
    conversationId,
    surface: 'mobile',
    platform: client.platform,
    version: client.appVersion ?? 'unknown',
    userAgent: [client.platform, client.osVersion, client.deviceClass].join(' '),
    ...(details?.reason ? { reason: details.reason } : {}),
    ...(comment ? { comment } : {}),
  });
  return [FEEDBACK_PATH, { method: 'POST', body: JSON.stringify(body) }];
}

export async function recordResponseRatingRemote(
  conversationId: string,
  messageId: string,
  rating: ResponseRating | null,
  accountEpoch?: CloudAccountEpoch | null,
  details?: ResponseRatingDetailsInput,
): Promise<void> {
  if (accountEpoch !== undefined) assertCloudAccountEpochCurrent(accountEpoch);
  const [path, init] = responseRatingRequest(conversationId, messageId, rating, details);
  const response = await apiFetch(path, init, accountEpoch ? { accountEpoch } : {});
  if (!response.ok) {
    throw new ApiHttpError(`Response rating failed (HTTP ${response.status})`, response.status);
  }
}

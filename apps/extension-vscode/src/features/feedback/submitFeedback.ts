import * as vscode from 'vscode';
import { getAccountToken, getCloudWebOrigin } from '../../utils/api';
import { platformRequestHeaders } from '../../platform/platformHeaders';
import { getExtensionUserAgent, getExtensionVersion } from '../../platform/version';

export type FeedbackKind = 'bug' | 'feature' | 'general';
export type AnswerRating = 'up' | 'down';

const FEEDBACK_KIND_LABELS: Record<FeedbackKind, string> = {
  bug: 'Bug report',
  feature: 'Feature request',
  general: 'Feedback',
};
const SUBJECT_PREVIEW_CHARS = 60;

export type FeedbackOutcome =
  { status: 'sent' } | { status: 'signed-out' } | { status: 'failed'; reason: string };

interface FeedbackBody {
  subject: string;
  message: string;
  metadata?: Record<string, string>;
}

async function postFeedback(
  secrets: vscode.SecretStorage,
  body: FeedbackBody,
): Promise<FeedbackOutcome> {
  const token = await getAccountToken(secrets);
  if (token === undefined || token === '') return { status: 'signed-out' };
  try {
    const response = await fetch(`${getCloudWebOrigin()}/api/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...platformRequestHeaders(),
      },
      body: JSON.stringify({
        subject: body.subject,
        message: body.message,
        metadata: {
          source: 'vscode',
          platform: `${vscode.env.appName} ${vscode.version} on ${process.platform}`,
          version: getExtensionVersion(),
          user_agent: getExtensionUserAgent(),
          ...body.metadata,
        },
      }),
    });
    return response.ok
      ? { status: 'sent' }
      : { status: 'failed', reason: `AGI Workforce answered HTTP ${response.status}` };
  } catch (error) {
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : 'AGI Workforce could not be reached',
    };
  }
}

export function submitFeedback(
  secrets: vscode.SecretStorage,
  kind: FeedbackKind,
  text: string,
): Promise<FeedbackOutcome> {
  const message = text.trim();
  return postFeedback(secrets, {
    subject: `${FEEDBACK_KIND_LABELS[kind]}: ${message.slice(0, SUBJECT_PREVIEW_CHARS)}`,
    message,
  });
}

export function submitAnswerRating(
  secrets: vscode.SecretStorage,
  rating: AnswerRating,
  answer: { messageId: string; conversationId?: string; modelLabel?: string },
): Promise<FeedbackOutcome> {
  return postFeedback(secrets, {
    subject: `Response rated ${rating}`,
    message: `${answer.modelLabel === undefined ? 'An answer' : `An answer from ${answer.modelLabel}`} in VS Code. The answer text stays on the user's device.`,
    metadata: {
      feedback_context: 'response_rating',
      rating,
      message_id: answer.messageId,
      ...(answer.conversationId === undefined ? {} : { conversation_id: answer.conversationId }),
    },
  });
}

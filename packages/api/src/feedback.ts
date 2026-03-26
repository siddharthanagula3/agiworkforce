/**
 * Feedback API — typed wrappers for submit_feedback, record_message_feedback,
 * and get_filtered_logs Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface FeedbackMetadata {
  platform: string;
  version: string;
  userAgent: string;
}

// ---- Commands ----

export async function submitFeedback(
  subject: string,
  message: string,
  userId: string | undefined,
  metadata: FeedbackMetadata,
  logs: string | null,
): Promise<void> {
  return command<void>('submit_feedback', { subject, message, userId, metadata, logs });
}

export async function recordMessageFeedback(
  messageId: string,
  conversationId: string | null,
  feedbackType: string,
  correction: string | null,
  category: string | null,
): Promise<void> {
  return command<void>('record_message_feedback', {
    messageId,
    conversationId,
    feedbackType,
    correction,
    category,
  });
}

export async function getFilteredLogs(): Promise<string[]> {
  return command<string[]>('get_filtered_logs');
}

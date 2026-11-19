export const RESPONSE_RATING_REASONS = [
  'inaccurate',
  'ignored_instructions',
  'incomplete',
  'unwarranted_refusal',
  'style',
  'other',
] as const;

export type ResponseRatingReason = (typeof RESPONSE_RATING_REASONS)[number];

export type ResponseRating = 'up' | 'down';

export const RESPONSE_RATING_COMMENT_MAX_CHARS = 2_000;

export const RESPONSE_RATING_MESSAGE_MAX_CHARS = 200;

export const RESPONSE_RATING_REASON_LABELS: Readonly<Record<ResponseRatingReason, string>> = {
  inaccurate: 'Not factually correct',
  ignored_instructions: 'Did not follow instructions',
  incomplete: 'Incomplete response',
  unwarranted_refusal: 'Refused when it should not have',
  style: 'Wrong style or tone',
  other: 'Other',
};

export const RESPONSE_RATING_SHARING_NOTE =
  'Your rating, reason and comment are saved with your account, this chat and response IDs, and your browser and device details. The response text is not attached.';

export const RESPONSE_RATING_SEND_FAILED = 'Could not send that. Please try again.';

export const RESPONSE_RATING_REMOVE_FAILED = 'Could not remove your rating. Please try again.';

export const RESPONSE_RATING_RATE_LIMITED =
  "You've sent a lot of feedback in the last hour. Try again later.";

export const FEEDBACK_SOURCES = ['desktop', 'web', 'vscode', 'cli', 'chrome', 'mobile'] as const;

export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];

export const WEB_RESPONSE_RATING_MESSAGE =
  'An answer in web chat. The answer text is not attached.';

export const CHROME_RESPONSE_RATING_MESSAGE =
  'An answer in the Chrome extension. The answer text is not attached.';

export const MOBILE_RESPONSE_RATING_MESSAGE =
  'An answer in the mobile app. The answer text is not attached.';

export type ResponseRatingSurface = Extract<FeedbackSource, 'web' | 'chrome' | 'mobile'>;

export const ANSWERLESS_RESPONSE_RATING_MESSAGES: Readonly<Record<ResponseRatingSurface, string>> =
  {
    web: WEB_RESPONSE_RATING_MESSAGE,
    chrome: CHROME_RESPONSE_RATING_MESSAGE,
    mobile: MOBILE_RESPONSE_RATING_MESSAGE,
  };

export function answerlessResponseRatingMessage(source: FeedbackSource): string | undefined {
  return source in ANSWERLESS_RESPONSE_RATING_MESSAGES
    ? ANSWERLESS_RESPONSE_RATING_MESSAGES[source as ResponseRatingSurface]
    : undefined;
}

export const FEEDBACK_PATH = '/api/feedback';

export interface ResponseRatingFeedbackInput {
  rating: ResponseRating;
  messageId: string;
  conversationId?: string;
  reason?: ResponseRatingReason;
  comment?: string;
  surface: ResponseRatingSurface;
  platform: string;
  version: string;
  userAgent: string;
}

export interface ResponseRatingFeedbackBody {
  subject: string;
  message: string;
  metadata: {
    source: ResponseRatingSurface;
    platform: string;
    version: string;
    user_agent: string;
    feedback_context: 'response_rating';
    rating: ResponseRating;
    message_id: string;
    conversation_id?: string;
    reason?: ResponseRatingReason;
    comment?: string;
  };
}

export function responseRatingFeedbackBody(
  input: ResponseRatingFeedbackInput,
): ResponseRatingFeedbackBody {
  return {
    subject: input.reason
      ? `Response rated ${input.rating}: ${RESPONSE_RATING_REASON_LABELS[input.reason]}`
      : `Response rated ${input.rating}`,
    message: ANSWERLESS_RESPONSE_RATING_MESSAGES[input.surface],
    metadata: {
      source: input.surface,
      platform: input.platform,
      version: input.version,
      user_agent: input.userAgent.slice(0, 500),
      feedback_context: 'response_rating',
      rating: input.rating,
      message_id: input.messageId,
      ...(input.conversationId ? { conversation_id: input.conversationId } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.comment ? { comment: input.comment } : {}),
    },
  };
}

export function responseRatingRemovePath(messageId: string): string {
  return `${FEEDBACK_PATH}?message_id=${encodeURIComponent(messageId)}`;
}

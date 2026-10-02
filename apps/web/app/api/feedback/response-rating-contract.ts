export const RESPONSE_RATING_REASONS = [
  'inaccurate',
  'ignored_instructions',
  'incomplete',
  'unwarranted_refusal',
  'style',
  'other',
] as const;

export type ResponseRatingReason = (typeof RESPONSE_RATING_REASONS)[number];

export const RESPONSE_RATING_COMMENT_MAX_CHARS = 2_000;

export const RESPONSE_RATING_MESSAGE_MAX_CHARS = 200;

export const WEB_RESPONSE_RATING_MESSAGE =
  'An answer in web chat. The answer text is not attached.';

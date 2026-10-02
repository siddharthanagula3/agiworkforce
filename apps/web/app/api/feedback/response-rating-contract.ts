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

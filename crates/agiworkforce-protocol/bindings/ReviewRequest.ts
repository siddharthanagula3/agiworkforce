import type { ReviewTarget } from './ReviewTarget';

export type ReviewRequest = { target: ReviewTarget; user_facing_hint?: string };

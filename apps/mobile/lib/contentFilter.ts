import {
  checkContentFilter as checkSharedContentFilter,
  type ContentFilterResult,
} from '@agiworkforce/types';

export type { ContentFilterResult } from '@agiworkforce/types';

export const MINOR_SAFE_REFUSAL =
  "This content isn't available in AGI for users under the minimum age in your region. " +
  'If you believe this is an error, a parent or guardian can adjust age settings in Settings > Privacy.';

/** Refusal shown when an adult has opted in to the stricter safety preference. */
export const REDUCED_SENSITIVE_CONTENT_REFUSAL =
  'This content is unavailable while Reduce sensitive content is on. ' +
  'You can change this in Settings > Safety & Security.';

export function checkContentFilter(
  prompt: string,
  enabled: boolean,
  refusal = MINOR_SAFE_REFUSAL,
): ContentFilterResult {
  return checkSharedContentFilter(prompt, enabled, refusal);
}

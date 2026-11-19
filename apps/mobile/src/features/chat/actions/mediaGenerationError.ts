export class MediaGenerationAdmissionError extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage);
  }
}

export const MEDIA_USAGE_LIMIT_MESSAGE =
  "You've reached your plan's usage limit for now. See Usage in Settings for when it resets.";

export const IMAGE_REFERENCE_UNAVAILABLE_MESSAGE =
  'This image edit cannot be retried because its original reference is no longer available. Attach the image again and send it as a new request.';

export function isUsageLimitRefusal(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { status?: unknown }).status === 402
  );
}

export function mediaGenerationFailureMessage(kind: 'image' | 'video'): string {
  return kind === 'image'
    ? 'Image generation failed. Try again.'
    : 'Video generation failed. Try again.';
}

export class MediaGenerationAdmissionError extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage);
  }
}

export function mediaGenerationFailureMessage(kind: 'image' | 'video'): string {
  return kind === 'image'
    ? 'Image generation failed. Try again.'
    : 'Video generation failed. Try again.';
}

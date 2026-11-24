export const MAX_REVIEW_FRAMES = 8;
export const MAX_REVIEW_FRAME_CHARS = 512_000;

export interface BrowserReviewFrame {
  dataUrl: string;
  toolCallId?: string;
}

export function isReviewImage(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_REVIEW_FRAME_CHARS &&
    /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value)
  );
}

export function storedReviewFrames(value: unknown): BrowserReviewFrame[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_REVIEW_FRAMES).flatMap((frame) => {
    if (!frame || !isReviewImage(frame.dataUrl)) return [];
    return [
      {
        dataUrl: frame.dataUrl,
        ...(typeof frame.toolCallId === 'string' && frame.toolCallId.length <= 200
          ? { toolCallId: frame.toolCallId }
          : {}),
      },
    ];
  });
}

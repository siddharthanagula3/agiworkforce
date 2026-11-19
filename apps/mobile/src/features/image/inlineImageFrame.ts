export const MAX_INLINE_IMAGE_HEIGHT = 512;

export function inlineImageFrame(
  availableWidth: number,
  naturalRatio: number | null,
): { width: number; height: number } {
  if (!naturalRatio || !Number.isFinite(naturalRatio) || naturalRatio <= 0) {
    return { width: availableWidth, height: availableWidth };
  }
  const height = Math.min(availableWidth / naturalRatio, MAX_INLINE_IMAGE_HEIGHT);
  return { width: height * naturalRatio, height };
}

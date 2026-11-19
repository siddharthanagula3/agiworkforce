export function clampPanOffset(
  offset: number,
  scale: number,
  frameExtent: number,
  stageExtent: number,
): number {
  'worklet';
  const limit = Math.max(0, (frameExtent * scale - stageExtent) / (2 * scale));
  return Math.max(0 - limit, Math.min(limit, offset));
}

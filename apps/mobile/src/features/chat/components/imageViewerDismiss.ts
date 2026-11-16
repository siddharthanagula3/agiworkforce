export const DISMISS_ACTIVATION_OFFSET = 12;
export const DISMISS_MAX_SCALE = 1.01;
export const DISMISS_MIN_TRAVEL = 24;
export const DISMISS_DISTANCE_RATIO = 0.2;
export const DISMISS_VELOCITY = 800;
export const DISMISS_FADE_RATIO = 0.5;
export const DISMISS_BACKDROP_FLOOR = 0.3;
export const DISMISS_SHRINK = 0.2;

export function canDismissAtScale(scale: number): boolean {
  'worklet';
  return scale <= DISMISS_MAX_SCALE;
}

export function dragDownOffset(translationY: number): number {
  'worklet';
  return Math.max(0, translationY);
}

export function shouldDismissViewer(
  translationY: number,
  velocityY: number,
  extent: number,
): boolean {
  'worklet';
  if (translationY <= DISMISS_MIN_TRAVEL) return false;
  return translationY >= extent * DISMISS_DISTANCE_RATIO || velocityY >= DISMISS_VELOCITY;
}

export function dismissProgress(offset: number, extent: number): number {
  'worklet';
  if (extent <= 0) return 0;
  return Math.min(1, Math.max(0, offset / (extent * DISMISS_FADE_RATIO)));
}

export function dismissBackdropOpacity(progress: number): number {
  'worklet';
  return 1 - (1 - DISMISS_BACKDROP_FLOOR) * progress;
}

export function dismissPictureScale(progress: number): number {
  'worklet';
  return 1 - DISMISS_SHRINK * progress;
}

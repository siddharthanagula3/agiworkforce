const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const FINE_POINTER_QUERY = '(pointer: fine)';

const PINNABLE_WIDTH_QUERY = '(min-width: 901px)';

const matches = (query: string): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia(query).matches;

export function prefersReducedMotion(): boolean {
  return matches(REDUCED_MOTION_QUERY);
}

export function hasFinePointer(): boolean {
  return matches(FINE_POINTER_QUERY);
}

export function canPinDeck(): boolean {
  return matches(PINNABLE_WIDTH_QUERY);
}

export function onPinnableChange(listener: (pinnable: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const media = window.matchMedia(PINNABLE_WIDTH_QUERY);
  const handler = (event: MediaQueryListEvent) => listener(event.matches);
  media.addEventListener('change', handler);
  return () => media.removeEventListener('change', handler);
}

export const clamp = (value: number, limit: number): number =>
  Math.min(limit, Math.max(-limit, value));

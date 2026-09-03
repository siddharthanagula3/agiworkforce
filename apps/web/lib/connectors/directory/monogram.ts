const MONOGRAM_MAX_LETTERS = 2;
const FALLBACK_MONOGRAM = '?';

export function deriveMonogram(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return FALLBACK_MONOGRAM;
  const letters = words.slice(0, MONOGRAM_MAX_LETTERS).map((word) => word[0]?.toUpperCase() ?? '');
  return letters.join('') || FALLBACK_MONOGRAM;
}

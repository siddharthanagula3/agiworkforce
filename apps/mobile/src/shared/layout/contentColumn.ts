import { MAX_GRID_CONTENT_WIDTH } from '../hooks/useResponsiveLayout';

// Body text stops being readable past about 80 characters, which is this many
// points at the 15-16pt the app sets.
export const READING_COLUMN_MAX_WIDTH = 720;

// A button or a short form stops looking deliberate past the widest phone
// window, so it keeps that width on a tablet.
export const FORM_COLUMN_MAX_WIDTH = 440;

export type ContentColumnKind = 'reading' | 'form' | 'grid';

export interface ContentColumnStyle {
  width: '100%';
  maxWidth: number;
  alignSelf: 'center';
}

const COLUMN_MAX_WIDTH: Readonly<Record<ContentColumnKind, number>> = {
  reading: READING_COLUMN_MAX_WIDTH,
  form: FORM_COLUMN_MAX_WIDTH,
  grid: MAX_GRID_CONTENT_WIDTH,
};

// A ceiling, never a floor, so the narrowest supported window still fits.
export function contentColumn(kind: ContentColumnKind): ContentColumnStyle {
  return { width: '100%', maxWidth: COLUMN_MAX_WIDTH[kind], alignSelf: 'center' };
}

export function contentColumnWidth(kind: ContentColumnKind, availableWidth: number): number {
  return Math.min(Math.max(0, availableWidth), COLUMN_MAX_WIDTH[kind]);
}

// The margin either side that centres a column in the space it is given, for a
// surface that is positioned by its edges and cannot take `alignSelf`.
export function contentColumnInset(kind: ContentColumnKind, availableWidth: number): number {
  const available = Math.max(0, availableWidth);
  return (available - contentColumnWidth(kind, available)) / 2;
}

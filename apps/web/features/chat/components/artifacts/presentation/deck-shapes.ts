export const SHAPE_KINDS = ['rect', 'rounded', 'oval', 'diamond', 'line', 'arrow'] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  rect: 'Rectangle',
  rounded: 'Rounded rectangle',
  oval: 'Oval',
  diamond: 'Diamond',
  line: 'Line',
  arrow: 'Arrow',
};

export interface DeckShape {
  id: string;
  kind: ShapeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
}

const MAX_SHAPES = 40;
const MAX_TEXT_CHARS = 200;

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function isShapeKind(value: unknown): value is ShapeKind {
  return typeof value === 'string' && (SHAPE_KINDS as readonly string[]).includes(value);
}

export function parseShapes(source: string): DeckShape[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return [];
  }
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { shapes?: unknown }).shapes)
      ? (parsed as { shapes: unknown[] }).shapes
      : [];
  return list.slice(0, MAX_SHAPES).flatMap((raw, index) => {
    if (!raw || typeof raw !== 'object') return [];
    const entry = raw as Record<string, unknown>;
    if (!isShapeKind(entry['kind'])) return [];
    const flat = entry['kind'] === 'line' || entry['kind'] === 'arrow';
    return [
      {
        id: typeof entry['id'] === 'string' && entry['id'] ? entry['id'] : `shape-${index + 1}`,
        kind: entry['kind'],
        x: clamp(entry['x'], 0, 100, 10),
        y: clamp(entry['y'], 0, 100, 10),
        w: clamp(entry['w'], flat ? 0 : 2, 100, 20),
        h: clamp(entry['h'], 0, 100, flat ? 0 : 15),
        text: typeof entry['text'] === 'string' ? entry['text'].slice(0, MAX_TEXT_CHARS) : '',
      },
    ];
  });
}

export function serializeShapes(shapes: readonly DeckShape[]): string {
  return JSON.stringify({
    shapes: shapes.map(({ id, kind, x, y, w, h, text }) => ({
      id,
      kind,
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      w: Math.round(w * 10) / 10,
      h: Math.round(h * 10) / 10,
      ...(text ? { text } : {}),
    })),
  });
}

export function newShape(kind: ShapeKind, existing: readonly DeckShape[]): DeckShape {
  const offset = (existing.length % 5) * 4;
  const flat = kind === 'line' || kind === 'arrow';
  const used = new Set(existing.map((shape) => shape.id));
  let n = existing.length + 1;
  while (used.has(`shape-${n}`)) n += 1;
  return {
    id: `shape-${n}`,
    kind,
    x: 35 + offset,
    y: flat ? 50 + offset : 35 + offset,
    w: 25,
    h: flat ? 0 : 25,
    text: '',
  };
}

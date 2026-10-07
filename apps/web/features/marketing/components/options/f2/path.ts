export type Point = { x: number; y: number };

type Segment = { a: Point; b: Point; length: number };

const MIN_SEGMENT = 0.001;
const ORIGIN: Point = { x: 0, y: 0 };

function segments(points: readonly Point[]): Segment[] {
  const out: Segment[] = [];
  points.forEach((b, i) => {
    const a = points[i - 1];
    if (a) out.push({ a, b, length: Math.hypot(b.x - a.x, b.y - a.y) });
  });
  return out;
}

export function offsetsByLength(points: readonly Point[]): number[] {
  const lengths = segments(points).map((segment) => segment.length);
  const total = lengths.reduce((sum, length) => sum + length, 0) || MIN_SEGMENT;
  let run = 0;
  return [0, ...lengths.map((length) => (run += length) / total)];
}

export function pointAt(points: readonly Point[], fraction: number): Point {
  const parts = segments(points);
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  let target = Math.max(0, Math.min(1, fraction)) * total;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (!part) continue;
    if (target <= part.length || i === parts.length - 1) {
      const t = part.length < MIN_SEGMENT ? 0 : Math.min(1, target / part.length);
      return { x: part.a.x + (part.b.x - part.a.x) * t, y: part.a.y + (part.b.y - part.a.y) * t };
    }
    target -= part.length;
  }
  return points[points.length - 1] ?? ORIGIN;
}

export function simplify(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - point.x) < 1 && Math.abs(last.y - point.y) < 1) continue;
    out.push(point);
  }
  for (let i = out.length - 2; i > 0; i -= 1) {
    const a = out[i - 1];
    const b = out[i];
    const c = out[i + 1];
    if (!a || !b || !c) continue;
    const collinear =
      (Math.abs(a.x - b.x) < 1 && Math.abs(b.x - c.x) < 1) ||
      (Math.abs(a.y - b.y) < 1 && Math.abs(b.y - c.y) < 1);
    if (collinear) out.splice(i, 1);
  }
  return out;
}

export function roundedPath(points: readonly Point[], radius: number): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return '';
  if (points.length === 1) return `M${first.x} ${first.y}`;
  const parts = [`M${first.x} ${first.y}`];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const corner = points[i];
    const next = points[i + 1];
    if (!prev || !corner || !next) continue;
    const inLength = Math.hypot(corner.x - prev.x, corner.y - prev.y);
    const outLength = Math.hypot(next.x - corner.x, next.y - corner.y);
    const r = Math.min(radius, inLength / 2, outLength / 2);
    const inX = corner.x - ((corner.x - prev.x) / (inLength || MIN_SEGMENT)) * r;
    const inY = corner.y - ((corner.y - prev.y) / (inLength || MIN_SEGMENT)) * r;
    const outX = corner.x + ((next.x - corner.x) / (outLength || MIN_SEGMENT)) * r;
    const outY = corner.y + ((next.y - corner.y) / (outLength || MIN_SEGMENT)) * r;
    parts.push(`L${inX} ${inY}`, `Q${corner.x} ${corner.y} ${outX} ${outY}`);
  }
  parts.push(`L${last.x} ${last.y}`);
  return parts.join(' ');
}

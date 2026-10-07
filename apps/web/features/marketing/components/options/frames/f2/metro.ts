import { SURFACES } from '@/features/marketing/components/landing/landing-content';
import { LANE_IDS, type LaneId } from '@/features/marketing/components/system/lanes';
import { isReleased, SURFACE_NAMES, SURFACE_STATUS, type SurfaceId } from '@/lib/surface-status';

export const LANE_STATIONS: Record<LaneId, readonly SurfaceId[]> = {
  local: ['cli'],
  byok: ['cli', 'vscode'],
  cloud: ['web', 'desktop', 'mobile'],
};

export const CLOUD_BRANCH = { lane: 'cloud' as LaneId, from: 'desktop', to: 'chrome' } as const;

export interface Point {
  x: number;
  y: number;
}

export interface Station {
  id: SurfaceId;
  key: string;
  lane: LaneId;
  name: string;
  status: string;
  live: boolean;
  href: string;
  point: Point;
  distance: number;
  labelSide: 'below' | 'right';
}

export interface Track {
  lane: LaneId;
  path: string;
  length: number;
  solidPath: string | null;
  dashedPath: string | null;
  stations: Station[];
}

export interface BranchTrack {
  lane: LaneId;
  path: string;
  length: number;
  station: Station;
}

export interface MetroLayout {
  orientation: 'horizontal' | 'vertical';
  width: number;
  height: number;
  origin: Point;
  terminus: Point;
  tracks: Track[];
  branch: BranchTrack;
}

function surfaceHref(id: SurfaceId): string {
  return SURFACES.find((surface) => surface.name === SURFACE_NAMES[id])?.href ?? '/';
}

function unit(from: Point, to: Point): Point {
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  return { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
}

function format(value: number): string {
  return Number(value.toFixed(2)).toString();
}

export function roundedPolyline(
  points: readonly Point[],
  radius: number,
): {
  d: string;
  length: number;
} {
  if (points.length < 2) return { d: '', length: 0 };
  const first = points[0]!;
  let d = `M${format(first.x)} ${format(first.y)}`;
  let length = 0;
  let cursor = first;
  for (let index = 1; index < points.length - 1; index += 1) {
    const prev = points[index - 1]!;
    const vertex = points[index]!;
    const next = points[index + 1]!;
    const inDir = unit(prev, vertex);
    const outDir = unit(vertex, next);
    const cross = inDir.x * outDir.y - inDir.y * outDir.x;
    const dot = inDir.x * outDir.x + inDir.y * outDir.y;
    const turn = Math.acos(Math.max(-1, Math.min(1, dot)));
    if (turn < 0.001) continue;
    const tangent = radius * Math.tan(turn / 2);
    const arcStart = { x: vertex.x - inDir.x * tangent, y: vertex.y - inDir.y * tangent };
    const arcEnd = { x: vertex.x + outDir.x * tangent, y: vertex.y + outDir.y * tangent };
    length += Math.hypot(arcStart.x - cursor.x, arcStart.y - cursor.y);
    d += ` L${format(arcStart.x)} ${format(arcStart.y)}`;
    d += ` A${radius} ${radius} 0 0 ${cross > 0 ? 1 : 0} ${format(arcEnd.x)} ${format(arcEnd.y)}`;
    length += radius * turn;
    cursor = arcEnd;
  }
  const last = points[points.length - 1]!;
  length += Math.hypot(last.x - cursor.x, last.y - cursor.y);
  d += ` L${format(last.x)} ${format(last.y)}`;
  return { d, length };
}

function splitAt(points: readonly Point[], at: Point): [Point[], Point[]] {
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index]!;
    const b = points[index + 1]!;
    const onSegment =
      Math.abs((b.x - a.x) * (at.y - a.y) - (b.y - a.y) * (at.x - a.x)) < 0.5 &&
      at.x >= Math.min(a.x, b.x) - 0.5 &&
      at.x <= Math.max(a.x, b.x) + 0.5 &&
      at.y >= Math.min(a.y, b.y) - 0.5 &&
      at.y <= Math.max(a.y, b.y) + 0.5;
    if (onSegment) {
      return [
        [...points.slice(0, index + 1), at],
        [at, ...points.slice(index + 1)],
      ];
    }
  }
  return [[...points], []];
}

function distanceAlong(points: readonly Point[], radius: number, at: Point): number {
  const [before] = splitAt(points, at);
  return roundedPolyline(before, radius).length;
}

interface LaneSpec {
  lane: LaneId;
  points: Point[];
  stationPoints: Point[];
}

function buildStation(
  id: SurfaceId,
  lane: LaneId,
  point: Point,
  distance: number,
  labelSide: Station['labelSide'],
): Station {
  return {
    id,
    key: `${lane}-${id}`,
    lane,
    name: SURFACE_NAMES[id],
    status: SURFACE_STATUS[id],
    live: isReleased(id),
    href: surfaceHref(id),
    point,
    distance,
    labelSide,
  };
}

function buildTrack(spec: LaneSpec, radius: number): Track {
  const { d, length } = roundedPolyline(spec.points, radius);
  const ids = LANE_STATIONS[spec.lane];
  const stations = ids.map((id, index) => {
    const point = spec.stationPoints[index]!;
    return buildStation(id, spec.lane, point, distanceAlong(spec.points, radius, point), 'below');
  });
  const lastLive = [...stations].reverse().find((station) => station.live);
  if (!lastLive) {
    return { lane: spec.lane, path: d, length, solidPath: null, dashedPath: d, stations };
  }
  const [solid, dashed] = splitAt(spec.points, lastLive.point);
  return {
    lane: spec.lane,
    path: d,
    length,
    solidPath: roundedPolyline(solid, radius).d,
    dashedPath: dashed.length > 1 ? roundedPolyline(dashed, radius).d : null,
    stations,
  };
}

function buildBranch(
  points: Point[],
  radius: number,
  labelSide: Station['labelSide'],
): BranchTrack {
  const { d, length } = roundedPolyline(points, radius);
  const end = points[points.length - 1]!;
  return {
    lane: CLOUD_BRANCH.lane,
    path: d,
    length,
    station: buildStation(CLOUD_BRANCH.to, CLOUD_BRANCH.lane, end, length, labelSide),
  };
}

const DESKTOP_RADIUS = 48;
const PHONE_RADIUS = 36;

export const DESKTOP_LAYOUT: MetroLayout = (() => {
  const origin = { x: 60, y: 240 };
  const terminus = { x: 940, y: 240 };
  const columns = [360, 560, 760];
  const specs: LaneSpec[] = [
    {
      lane: 'local',
      points: [
        { x: origin.x, y: 226 },
        { x: 150, y: 226 },
        { x: 256, y: 120 },
        { x: 786, y: 120 },
        { x: 892, y: 226 },
        { x: terminus.x, y: 226 },
      ],
      stationPoints: [{ x: columns[0]!, y: 120 }],
    },
    {
      lane: 'byok',
      points: [
        { x: origin.x, y: 240 },
        { x: terminus.x, y: 240 },
      ],
      stationPoints: [
        { x: columns[0]!, y: 240 },
        { x: columns[1]!, y: 240 },
      ],
    },
    {
      lane: 'cloud',
      points: [
        { x: origin.x, y: 254 },
        { x: 150, y: 254 },
        { x: 256, y: 360 },
        { x: 786, y: 360 },
        { x: 892, y: 254 },
        { x: terminus.x, y: 254 },
      ],
      stationPoints: [
        { x: columns[0]!, y: 360 },
        { x: columns[1]!, y: 360 },
        { x: columns[2]!, y: 360 },
      ],
    },
  ];
  return {
    orientation: 'horizontal',
    width: 1200,
    height: 480,
    origin,
    terminus,
    tracks: LANE_IDS.map((lane) =>
      buildTrack(
        specs.find((spec) => spec.lane === lane)!,
        DESKTOP_RADIUS,
      ),
    ),
    branch: buildBranch(
      [
        { x: columns[1]!, y: 360 },
        { x: 620, y: 300 },
        { x: 660, y: 300 },
      ],
      DESKTOP_RADIUS,
      'right',
    ),
  };
})();

export const PHONE_LAYOUT: MetroLayout = (() => {
  const origin = { x: 164, y: 36 };
  const terminus = { x: 164, y: 724 };
  const rows = [280, 420, 560];
  const specs: LaneSpec[] = [
    {
      lane: 'local',
      points: [
        { x: 150, y: origin.y },
        { x: 150, y: 90 },
        { x: 50, y: 190 },
        { x: 50, y: 600 },
        { x: 150, y: 700 },
        { x: 150, y: terminus.y },
      ],
      stationPoints: [{ x: 50, y: rows[0]! }],
    },
    {
      lane: 'byok',
      points: [
        { x: 164, y: origin.y },
        { x: 164, y: terminus.y },
      ],
      stationPoints: [
        { x: 164, y: rows[0]! },
        { x: 164, y: rows[1]! },
      ],
    },
    {
      lane: 'cloud',
      points: [
        { x: 178, y: origin.y },
        { x: 178, y: 90 },
        { x: 278, y: 190 },
        { x: 278, y: 600 },
        { x: 178, y: 700 },
        { x: 178, y: terminus.y },
      ],
      stationPoints: [
        { x: 278, y: rows[0]! },
        { x: 278, y: rows[1]! },
        { x: 278, y: rows[2]! },
      ],
    },
  ];
  return {
    orientation: 'vertical',
    width: 328,
    height: 760,
    origin,
    terminus,
    tracks: LANE_IDS.map((lane) =>
      buildTrack(
        specs.find((spec) => spec.lane === lane)!,
        PHONE_RADIUS,
      ),
    ),
    branch: buildBranch(
      [
        { x: 278, y: rows[1]! },
        { x: 218, y: 480 },
        { x: 218, y: 496 },
      ],
      PHONE_RADIUS,
      'below',
    ),
  };
})();

export const DRAW_MS = 1100;
export const DRAW_STAGGER_MS = 120;
export const TRAIN_MS = 1600;
export const TRAIN_HOLD_MS = 160;
export const TRAIN_START_MS = 1800;
export const TRAIN_STOP_BEFORE_END = 30;
export const TICKET_IN_MS = 1500;
export const PRINT_ROW_MS = 90;

export const DRAW_ORDER: readonly LaneId[] = ['cloud', 'byok', 'local'];

export function drawDelay(lane: LaneId): number {
  return DRAW_ORDER.indexOf(lane) * DRAW_STAGGER_MS;
}

function bezierX(t: number, x1: number, x2: number): number {
  const mt = 1 - t;
  return 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t;
}

function bezierY(t: number, y1: number, y2: number): number {
  const mt = 1 - t;
  return 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t;
}

const DRAW_EASE = { x1: 0.45, y1: 0, x2: 0.55, y2: 1 } as const;

/** Time fraction at which an ease-in-out draw reaches a progress fraction. */
export function drawTimeFor(progress: number): number {
  let lower = 0;
  let upper = 1;
  for (let step = 0; step < 24; step += 1) {
    const mid = (lower + upper) / 2;
    if (bezierY(mid, DRAW_EASE.y1, DRAW_EASE.y2) < progress) lower = mid;
    else upper = mid;
  }
  return bezierX((lower + upper) / 2, DRAW_EASE.x1, DRAW_EASE.x2);
}

export function easeInOut(progress: number): number {
  return bezierY(drawTimeInverse(progress), DRAW_EASE.y1, DRAW_EASE.y2);
}

function drawTimeInverse(time: number): number {
  let lower = 0;
  let upper = 1;
  for (let step = 0; step < 24; step += 1) {
    const mid = (lower + upper) / 2;
    if (bezierX(mid, DRAW_EASE.x1, DRAW_EASE.x2) < time) lower = mid;
    else upper = mid;
  }
  return (lower + upper) / 2;
}

export function stationPopDelay(lane: LaneId, track: Track, station: Station): number {
  return drawDelay(lane) + drawTimeFor(station.distance / track.length) * DRAW_MS;
}

export function branchPopDelay(layout: MetroLayout): number {
  const cloud = layout.tracks.find((track) => track.lane === CLOUD_BRANCH.lane)!;
  const from = cloud.stations.find((station) => station.id === CLOUD_BRANCH.from)!;
  return stationPopDelay(cloud.lane, cloud, from);
}

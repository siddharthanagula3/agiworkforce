import { SCENE_BASELINE, SCENE_SHAPE, type SceneBody } from './sceneConfig';

export interface Point {
  x: number;
  y: number;
}

const RADIANS = Math.PI / 180;
const ELBOW_TOLERANCE = 1e-9;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampRadius(dx: number, dy: number, radius: number): Point {
  const length = Math.hypot(dx, dy);
  if (length <= radius || length === 0) return { x: dx, y: dy };
  const scale = radius / length;
  return { x: dx * scale, y: dy * scale };
}

export function approach(
  current: number,
  target: number,
  dtSeconds: number,
  response: number,
): number {
  if (response <= 0) return target;
  const share = 1 - Math.exp(-dtSeconds / response);
  return current + (target - current) * share;
}

export function leanToward(dx: number, reach: number, max: number): number {
  return clamp((dx / reach) * max, -max, max);
}

export function leanShift(leanDeg: number, rise: number): number {
  return Math.tan(leanDeg * RADIANS) * rise;
}

export function skewAbout(cx: number, cy: number, leanDeg: number): string {
  return `translate(${cx} ${cy}) skewX(${(-leanDeg).toFixed(3)}) translate(${-cx} ${-cy})`;
}

function kinkEnds(kink: number): { base: number; top: number } {
  return { base: kink * SCENE_SHAPE.kinkBaseShare, top: kink * SCENE_SHAPE.kinkTopShare };
}

function kinkOffset(kink: number, t: number): number {
  const { base, top } = kinkEnds(kink);
  const at = SCENE_SHAPE.kinkAt;
  if (t <= at) return kink + (base - kink) * (1 - t / at);
  return kink + (top - kink) * ((t - at) / (1 - at));
}

function kinkAngles(height: number, kink: number): { lower: number; upper: number } {
  const { base, top } = kinkEnds(kink);
  const at = SCENE_SHAPE.kinkAt;
  return {
    lower: Math.atan2((kink - base) / at, height),
    upper: Math.atan2((top - kink) / (1 - at), height),
  };
}

function kinkSection(height: number, kink: number, t: number): { tilt: number; stretch: number } {
  if (kink === 0) return { tilt: 0, stretch: 1 };
  const { lower, upper } = kinkAngles(height, kink);
  if (t <= 0) return { tilt: 0, stretch: 1 / Math.cos(lower) };
  if (Math.abs(t - SCENE_SHAPE.kinkAt) < ELBOW_TOLERANCE) {
    return { tilt: (lower + upper) / 2, stretch: 1 / Math.cos((upper - lower) / 2) };
  }
  return { tilt: t < SCENE_SHAPE.kinkAt ? lower : upper, stretch: 1 };
}

function bendTilt(height: number, bend: number, t: number): number {
  const slope = bend * SCENE_SHAPE.bendCurve * t ** (SCENE_SHAPE.bendCurve - 1);
  return Math.atan2(slope, height) + bend * SCENE_SHAPE.tiltPerBendDeg * RADIANS * t ** 2;
}

export function spineOffset(bend: number, kink: number, t: number): number {
  return bend * t ** SCENE_SHAPE.bendCurve + kinkOffset(kink, t);
}

export function spineAt(
  height: number,
  bend: number,
  kink: number,
  t: number,
): { dx: number; angleDeg: number } {
  return {
    dx: spineOffset(bend, kink, t),
    angleDeg: (bendTilt(height, bend, t) + kinkSection(height, kink, t).tilt) / RADIANS,
  };
}

function columnHeights(kink: number): number[] {
  const steps = Array.from(
    { length: SCENE_SHAPE.columnSamples + 1 },
    (_unused, step) => step / SCENE_SHAPE.columnSamples,
  );
  if (kink === 0) return steps;
  return [
    ...steps.filter((t) => Math.abs(t - SCENE_SHAPE.kinkAt) > ELBOW_TOLERANCE),
    SCENE_SHAPE.kinkAt,
  ].sort((a, b) => a - b);
}

export function columnPath(
  body: { x: number; width: number; height: number },
  baseline: number,
  bend: number,
  kink: number,
  squat = 0,
): string {
  const half = body.width / 2;
  const centre = body.x + half;
  const height = body.height * (1 - squat);
  const foot = half * kinkSection(height, kink, 0).stretch;
  const footCentre = centre + spineOffset(bend, kink, 0);
  const rooted = (baseline + SCENE_SHAPE.root).toFixed(1);
  const left: string[] = [`${(footCentre - foot).toFixed(1)} ${rooted}`];
  const right: string[] = [`${(footCentre + foot).toFixed(1)} ${rooted}`];
  for (const t of columnHeights(kink)) {
    const section = kinkSection(height, kink, t);
    const tilt = bendTilt(height, bend, t) + section.tilt;
    const x = centre + spineOffset(bend, kink, t);
    const y = baseline - t * height;
    const nx = Math.cos(tilt) * half * section.stretch;
    const ny = Math.sin(tilt) * half * section.stretch;
    // Under the baseline a body is only its root, which the ground clip hides.
    if (y - ny <= baseline) left.push(`${(x - nx).toFixed(1)} ${(y - ny).toFixed(1)}`);
    if (y + ny <= baseline) right.push(`${(x + nx).toFixed(1)} ${(y + ny).toFixed(1)}`);
  }
  return `M${left.join(' L')} L${right.reverse().join(' L')} z`;
}

export function bodyPath(body: SceneBody): string {
  switch (body.kind) {
    case 'column':
      return columnPath(body, SCENE_BASELINE, 0, 0);
    case 'dome':
      return `M${body.cx - body.rx} ${SCENE_BASELINE + SCENE_SHAPE.root} v${-SCENE_SHAPE.root} a${body.rx} ${body.ry} 0 0 1 ${2 * body.rx} 0 v${SCENE_SHAPE.root} z`;
    case 'cap': {
      const r = body.width / 2;
      return `M${body.x} ${SCENE_BASELINE - body.height + r} a${r} ${r} 0 0 1 ${body.width} 0 v${body.height - r + SCENE_SHAPE.root} h${-body.width} z`;
    }
  }
}

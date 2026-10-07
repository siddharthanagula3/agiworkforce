export interface SpringState {
  angle: number;
  velocity: number;
  target: number;
}

const STIFFNESS = 42;
const DAMPING_RATIO = 0.72;
const DAMPING = 2 * DAMPING_RATIO * Math.sqrt(STIFFNESS);
const MAX_STEP_S = 0.032;
const REST_ANGLE = 0.25;
const REST_VELOCITY = 6;

export function stepSpring(state: SpringState, elapsedMs: number): boolean {
  const dt = Math.min(MAX_STEP_S, elapsedMs / 1000);
  const acceleration = -STIFFNESS * (state.angle - state.target) - DAMPING * state.velocity;
  state.velocity += acceleration * dt;
  state.angle += state.velocity * dt;
  const resting =
    Math.abs(state.angle - state.target) < REST_ANGLE && Math.abs(state.velocity) < REST_VELOCITY;
  if (resting) {
    state.angle = state.target;
    state.velocity = 0;
  }
  return resting;
}

export const STEP_DEGREES = 30;
export const POSITIONS = 12;

export function nearestEquivalent(angle: number, reference: number): number {
  return angle + 360 * Math.round((reference - angle) / 360);
}

export function stopAngle(index: number, reference: number): number {
  return nearestEquivalent(index * STEP_DEGREES, reference);
}

export function nearestStop(angle: number, stopCount: number): number {
  const slot = (((Math.round(angle / STEP_DEGREES) % POSITIONS) + POSITIONS) % POSITIONS) as number;
  if (slot < stopCount) return slot;
  const last = stopCount - 1;
  const toLast = Math.abs(slot - last);
  const toFirst = POSITIONS - slot;
  return toLast <= toFirst ? last : 0;
}

export function crossedTicks(from: number, to: number): number[] {
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  const ticks: number[] = [];
  for (let m = Math.ceil(low / STEP_DEGREES); m <= Math.floor(high / STEP_DEGREES); m += 1) {
    ticks.push(((m % POSITIONS) + POSITIONS) % POSITIONS);
  }
  return ticks;
}

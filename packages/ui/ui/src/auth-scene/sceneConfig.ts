import type { Point } from './sceneMath';

export type SceneCharacterId = 'purple' | 'black' | 'orange' | 'yellow';

export const SCENE_VIEWBOX = { width: 560, height: 440 } as const;
export const SCENE_BASELINE = 440;

export type SceneBody =
  | { kind: 'column'; x: number; width: number; height: number }
  | { kind: 'dome'; cx: number; rx: number; ry: number }
  | { kind: 'cap'; x: number; width: number; height: number };

export type SceneEyeLid = 'line' | 'arc';

export type SceneEye =
  | {
      kind: 'white';
      x: number;
      y: number;
      radius: number;
      pupil: number;
      lid: SceneEyeLid;
      brow: boolean;
    }
  | { kind: 'dot'; x: number; y: number; radius: number; lid: SceneEyeLid; brow: false };

export type SceneMouth =
  | { kind: 'dash'; x: number; y: number; width: number; height: number }
  | { kind: 'smile'; x: number; y: number; width: number; height: number; dot: number }
  | { kind: 'bar'; x1: number; x2: number; y: number; humps: number }
  | null;

export type SceneGesture = 'turned' | 'shut' | 'lowered';

export interface SceneAwayPose {
  lean: number;
  bend: number;
  faceX: number;
  faceY: number;
  /** Scene-space direction the eyes settle in. x is never positive: the form is on the +x side. */
  gaze: Point;
  facing: 1 | -1;
}

export interface SceneConcern {
  kink: number;
  squat: number;
  faceX: number;
  faceY: number;
  gaze: Point | null;
}

export interface SceneCharacter {
  id: SceneCharacterId;
  body: SceneBody;
  clipFace: boolean;
  clipOpensToForm: boolean;
  eyes: readonly SceneEye[];
  mouth: SceneMouth;
  centreX: number;
  /** Largest pupil offset, in viewBox units, so the pupil never leaves the eye. */
  pupilTravel: number;
  faceTravel: { x: number; y: number };
  faceTiltMax: number;
  leanMax: number;
  attendLean: number;
  bendMax: number;
  turnsToFollow: boolean;
  gesture: SceneGesture;
  away: SceneAwayPose;
  concern: SceneConcern;
  /** Seconds to close most of the gap to a new target: smaller is more eager. */
  response: number;
}

export const SCENE_CHARACTERS: readonly SceneCharacter[] = [
  {
    id: 'purple',
    body: { kind: 'column', x: 164, width: 180, height: 396 },
    clipFace: false,
    clipOpensToForm: false,
    eyes: [
      { kind: 'white', x: 229, y: 74, radius: 7, pupil: 3.2, lid: 'line', brow: false },
      { kind: 'white', x: 279, y: 74, radius: 7, pupil: 3.2, lid: 'line', brow: false },
    ],
    mouth: { kind: 'dash', x: 254, y: 98, width: 14, height: 5 },
    centreX: 254,
    pupilTravel: 3.4,
    faceTravel: { x: 34, y: 9 },
    faceTiltMax: 0,
    leanMax: 3,
    attendLean: 9.5,
    bendMax: 92,
    turnsToFollow: false,
    gesture: 'turned',
    away: { lean: -1, bend: -3, faceX: -45, faceY: 10, gaze: { x: -1, y: 0 }, facing: 1 },
    concern: { kink: -25, squat: 0, faceX: -6, faceY: 16, gaze: { x: 0.8, y: 0.25 } },
    response: 0.14,
  },
  {
    id: 'black',
    body: { kind: 'column', x: 290, width: 108, height: 285 },
    clipFace: true,
    clipOpensToForm: false,
    eyes: [
      { kind: 'white', x: 326, y: 181, radius: 9.5, pupil: 4.2, lid: 'line', brow: true },
      { kind: 'white', x: 360, y: 181, radius: 9.5, pupil: 4.2, lid: 'line', brow: true },
    ],
    mouth: null,
    centreX: 344,
    pupilTravel: 4.5,
    faceTravel: { x: 28, y: 6 },
    faceTiltMax: 0,
    leanMax: 1.5,
    attendLean: 7,
    bendMax: 12,
    turnsToFollow: false,
    gesture: 'lowered',
    away: { lean: -0.6, bend: -1.5, faceX: -16, faceY: 76, gaze: { x: -0.3, y: 0.1 }, facing: 1 },
    concern: { kink: 0, squat: 0.24, faceX: 12, faceY: 12, gaze: { x: -0.7, y: -0.7 } },
    response: 0.3,
  },
  {
    id: 'orange',
    body: { kind: 'dome', cx: 191, rx: 153, ry: 153 },
    clipFace: true,
    clipOpensToForm: false,
    eyes: [
      { kind: 'dot', x: 156.5, y: 376, radius: 7.5, lid: 'arc', brow: false },
      { kind: 'dot', x: 225.5, y: 376, radius: 7.5, lid: 'arc', brow: false },
    ],
    mouth: { kind: 'smile', x: 191, y: 390, width: 30, height: 14, dot: 5.5 },
    centreX: 191,
    pupilTravel: 3,
    faceTravel: { x: 70, y: 22 },
    faceTiltMax: 8,
    leanMax: 0,
    attendLean: 0,
    bendMax: 0,
    turnsToFollow: false,
    gesture: 'shut',
    away: { lean: 0, bend: 0, faceX: -70, faceY: -18, gaze: { x: -1, y: 0 }, facing: 1 },
    concern: { kink: 0, squat: 0, faceX: 50, faceY: 22, gaze: { x: 0, y: 0.5 } },
    response: 0.2,
  },
  {
    id: 'yellow',
    body: { kind: 'cap', x: 380, width: 126, height: 206 },
    clipFace: true,
    clipOpensToForm: true,
    eyes: [{ kind: 'dot', x: 430, y: 277, radius: 5.5, lid: 'line', brow: false }],
    mouth: { kind: 'bar', x1: 452, x2: 530, y: 300, humps: 3 },
    centreX: 443,
    pupilTravel: 3,
    faceTravel: { x: 10, y: 6 },
    faceTiltMax: 0,
    leanMax: 2,
    attendLean: 8,
    bendMax: 0,
    turnsToFollow: true,
    gesture: 'turned',
    away: { lean: -1, bend: 0, faceX: -18, faceY: 0, gaze: { x: -1, y: 0 }, facing: -1 },
    concern: { kink: 0, squat: 0, faceX: 14, faceY: 16, gaze: { x: 0, y: 0.5 } },
    response: 0.18,
  },
];

export const SCENE_SHAPE = {
  bendCurve: 1.9,
  tiltPerBendDeg: 0.18,
  columnSamples: 12,
  kinkAt: 0.66,
  kinkBaseShare: -3.4,
  kinkTopShare: -0.1,
  root: 4,
} as const;

export const SCENE_MOTION = {
  /** How far, in viewBox units, a target has to be from a body for the full lean. */
  leanReach: 420,
  faceReachX: 420,
  faceReachY: 380,
  barTiltMax: 12,
  /** While a request is in flight the pupils settle this far down the eye. */
  pendingGaze: 0.65,
  attendLeanShare: 0.92,
  attendBendShare: 0.015,
  watchBendShare: 0.03,
  leanInLeanShare: 0.2,
  leanInHoldMs: 760,
  turnResponse: 0.08,
  blinkMinDelayMs: 2800,
  blinkMaxDelayMs: 6800,
  blinkClosedMs: 140,
  successHoldMs: 900,
  reliefHoldMs: 1100,
  settleEpsilon: 0.02,
} as const;

export const SCENE_ENTERED_STORAGE_KEY = 'agi.auth-scene-entered';

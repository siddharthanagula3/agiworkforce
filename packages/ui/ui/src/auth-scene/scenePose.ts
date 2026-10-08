import { SCENE_BASELINE, SCENE_MOTION, type SceneCharacter } from './sceneConfig';
import { clamp, clampRadius, leanToward, type Point } from './sceneMath';

export type SceneAttention = 'free' | 'field' | 'masked';

export type ScenePoseName = 'rest' | 'follow' | 'attend' | 'watch' | 'away';

export interface Pose {
  lean: number;
  bend: number;
  kink: number;
  squat: number;
  faceX: number;
  faceY: number;
  facing: number;
  barTilt: number;
  pupils: Point[];
}

/** Everything a pose is computed from: booleans and one point, never a value. */
export interface SceneCue {
  privacy: boolean;
  attention: SceneAttention;
  pending: boolean;
  concern: boolean;
  target: Point | null;
  leaningIn: boolean;
}

export function poseName(snapshot: {
  privacy: boolean;
  attention: SceneAttention;
  pointer: boolean;
}): ScenePoseName {
  if (snapshot.privacy) return 'away';
  if (snapshot.attention === 'masked') return 'watch';
  if (snapshot.attention === 'field') return 'attend';
  if (snapshot.pointer) return 'follow';
  return 'rest';
}

export function restingPose(config: SceneCharacter): Pose {
  return {
    lean: 0,
    bend: 0,
    kink: 0,
    squat: 0,
    faceX: 0,
    faceY: 0,
    facing: 1,
    barTilt: 0,
    pupils: config.eyes.map(() => ({ x: 0, y: 0 })),
  };
}

function gazeAt(pose: Pose, direction: Point, travel: number): void {
  for (const pupil of pose.pupils) {
    pupil.x = direction.x * pose.facing * travel;
    pupil.y = direction.y * travel;
  }
}

function lookAt(config: SceneCharacter, target: Point, pose: Pose): void {
  config.eyes.forEach((eye, index) => {
    const pupil = pose.pupils[index];
    if (!pupil) return;
    const offset = clampRadius(
      target.x - (eye.x + pose.faceX),
      target.y - (eye.y + pose.faceY),
      config.pupilTravel,
    );
    pupil.x = offset.x * pose.facing;
    pupil.y = offset.y;
  });
}

function turnAway(config: SceneCharacter, pose: Pose): void {
  const away = config.away;
  pose.lean = away.lean;
  pose.bend = away.bend;
  pose.kink = 0;
  pose.squat = 0;
  pose.faceX = away.faceX;
  pose.faceY = away.faceY;
  pose.facing = away.facing;
  pose.barTilt = 0;
  gazeAt(pose, away.gaze, config.pupilTravel);
}

function follow(config: SceneCharacter, target: Point, pose: Pose): void {
  const dx = target.x - config.centreX;
  const dy = target.y - (config.eyes[0]?.y ?? SCENE_BASELINE);
  const reachY = clamp(dy / SCENE_MOTION.faceReachY, -1, 1);
  pose.facing = config.turnsToFollow && dx < 0 ? -1 : 1;
  pose.lean = leanToward(dx, SCENE_MOTION.leanReach, config.leanMax);
  pose.bend = 0;
  pose.faceX = config.faceTravel.x * clamp(dx / SCENE_MOTION.faceReachX, -1, 1);
  pose.faceY = config.faceTravel.y * reachY;
  pose.barTilt = SCENE_MOTION.barTiltMax * reachY;
  lookAt(config, target, pose);
}

function attend(config: SceneCharacter, cue: SceneCue, target: Point, pose: Pose): void {
  const dx = target.x - config.centreX;
  const dy = target.y - (config.eyes[0]?.y ?? SCENE_BASELINE);
  const side = dx < 0 ? -1 : 1;
  const masked = cue.attention === 'masked';
  const leanShare = cue.leaningIn
    ? SCENE_MOTION.leanInLeanShare
    : masked
      ? 1
      : SCENE_MOTION.attendLeanShare;
  const bendShare = cue.leaningIn
    ? 1
    : masked
      ? SCENE_MOTION.watchBendShare
      : SCENE_MOTION.attendBendShare;
  pose.facing = 1;
  pose.lean = side * config.attendLean * leanShare;
  pose.bend = side * config.bendMax * bendShare;
  pose.faceX = side * config.faceTravel.x;
  pose.faceY = config.faceTravel.y * clamp(dy / SCENE_MOTION.faceReachY, -1, 1);
  pose.barTilt = 0;
  lookAt(config, target, pose);
}

function rest(pose: Pose): void {
  pose.facing = 1;
  pose.lean = 0;
  pose.bend = 0;
  pose.faceX = 0;
  pose.faceY = 0;
  pose.barTilt = 0;
  gazeAt(pose, { x: 0, y: 0 }, 0);
}

function worry(config: SceneCharacter, pose: Pose): void {
  const concern = config.concern;
  pose.facing = 1;
  pose.lean = 0;
  pose.bend = 0;
  pose.barTilt = 0;
  pose.kink = concern.kink;
  pose.squat = concern.squat;
  pose.faceX = concern.faceX;
  pose.faceY = concern.faceY;
  if (concern.gaze) gazeAt(pose, concern.gaze, config.pupilTravel);
}

/** Sets `pose` to where this character should be for the cue; privacy outranks everything. */
export function aim(config: SceneCharacter, cue: SceneCue, pose: Pose): void {
  if (cue.privacy) {
    turnAway(config, pose);
    return;
  }

  pose.kink = 0;
  pose.squat = 0;
  if (!cue.target) rest(pose);
  else if (cue.attention === 'free') follow(config, cue.target, pose);
  else attend(config, cue, cue.target, pose);

  if (cue.concern) worry(config, pose);
  else if (cue.pending) gazeAt(pose, { x: 0, y: SCENE_MOTION.pendingGaze }, config.pupilTravel);
}

/** True when nothing about the pose is directed toward +x, the side the form is on. */
export function looksAwayFromForm(pose: Pose): boolean {
  if (pose.faceX > 0 || pose.bend > 0 || pose.lean > 0) return false;
  return pose.pupils.every((pupil) => pupil.x * pose.facing <= 0);
}

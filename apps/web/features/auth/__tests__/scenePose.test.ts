import { describe, expect, it } from 'vitest';

import { SCENE_BASELINE, SCENE_CHARACTERS, SCENE_MOTION, SCENE_SHAPE } from '../scene/sceneConfig';
import { columnPath, leanShift, skewAbout, spineAt } from '../scene/sceneMath';
import { aim, looksAwayFromForm, poseName, restingPose, type SceneCue } from '../scene/scenePose';

const TOWARD_THE_FORM = { x: 900, y: 200 };
const FAR_SIDE_AND_BELOW = { x: -300, y: 430 };

function character(id: string) {
  const found = SCENE_CHARACTERS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no character called ${id}`);
  return found;
}

function outline(path: string): { xs: number[]; ys: number[] } {
  const points = path.replace(/[MLz]/g, '').trim().split(/\s+/).map(Number);
  return {
    xs: points.filter((_, index) => index % 2 === 0),
    ys: points.filter((_, index) => index % 2 === 1),
  };
}

function cue(overrides: Partial<SceneCue> = {}): SceneCue {
  return {
    privacy: false,
    attention: 'free',
    pending: false,
    concern: false,
    target: null,
    leaningIn: false,
    ...overrides,
  };
}

describe('where each character looks', () => {
  for (const character of SCENE_CHARACTERS) {
    it(`${character.id}: looks at nothing on the form side while a secret is readable, whatever else is going on`, () => {
      for (const extra of [
        {},
        { target: TOWARD_THE_FORM, attention: 'masked' as const, leaningIn: true },
        { target: TOWARD_THE_FORM, concern: true },
        { target: TOWARD_THE_FORM, pending: true },
      ]) {
        const pose = restingPose(character);
        aim(character, cue({ privacy: true, ...extra }), pose);
        expect(looksAwayFromForm(pose), JSON.stringify(extra)).toBe(true);
      }
    });

    it(`${character.id}: watches a masked field on the form side with its whole body`, () => {
      const pose = restingPose(character);
      aim(character, cue({ attention: 'masked', target: TOWARD_THE_FORM }), pose);

      expect(looksAwayFromForm(pose)).toBe(false);
      expect(pose.facing).toBe(1);
      for (const pupil of pose.pupils) expect(pupil.x).toBeGreaterThan(0);
      if (character.leanMax > 0) expect(pose.lean).toBeGreaterThan(0);
    });
  }

  it('bends the tall one right over when a masked field is first entered, then eases back while still watching', () => {
    const purple = SCENE_CHARACTERS.find((character) => character.id === 'purple')!;
    const leaningIn = restingPose(purple);
    const settled = restingPose(purple);
    aim(purple, cue({ attention: 'masked', target: TOWARD_THE_FORM, leaningIn: true }), leaningIn);
    aim(purple, cue({ attention: 'masked', target: TOWARD_THE_FORM }), settled);

    expect(leaningIn.bend).toBe(purple.bendMax);
    expect(settled.bend).toBeGreaterThan(0);
    expect(settled.bend).toBeLessThan(leaningIn.bend);
  });

  it('leans toward an ordinary field less than it leans in to watch a secret', () => {
    const purple = SCENE_CHARACTERS.find((character) => character.id === 'purple')!;
    const attending = restingPose(purple);
    const watching = restingPose(purple);
    aim(purple, cue({ attention: 'field', target: TOWARD_THE_FORM }), attending);
    aim(purple, cue({ attention: 'masked', target: TOWARD_THE_FORM }), watching);

    expect(attending.lean).toBeGreaterThan(0);
    expect(attending.bend).toBeGreaterThan(0);
    expect(attending.bend).toBeLessThan(watching.bend);
  });

  it('kinks the tall one and turns the charcoal one up toward it when an attempt is refused', () => {
    const purple = SCENE_CHARACTERS.find((character) => character.id === 'purple')!;
    const black = SCENE_CHARACTERS.find((character) => character.id === 'black')!;
    const purplePose = restingPose(purple);
    const blackPose = restingPose(black);
    aim(purple, cue({ concern: true, target: TOWARD_THE_FORM }), purplePose);
    aim(black, cue({ concern: true, target: TOWARD_THE_FORM }), blackPose);

    expect(purplePose.kink).toBeLessThan(0);
    for (const pupil of blackPose.pupils) {
      expect(pupil.x).toBeLessThan(0);
      expect(pupil.y).toBeLessThan(0);
    }
  });

  it('stands every character upright for a refusal, with the charcoal one sunk beside the tall one', () => {
    for (const config of SCENE_CHARACTERS) {
      const pose = restingPose(config);
      aim(config, cue({ concern: true, attention: 'masked', target: TOWARD_THE_FORM }), pose);

      expect(pose.lean, config.id).toBe(0);
      expect(pose.bend, config.id).toBe(0);
      expect(pose.facing, config.id).toBe(1);
    }
    const black = restingPose(character('black'));
    aim(character('black'), cue({ concern: true, target: TOWARD_THE_FORM }), black);
    expect(black.squat).toBeGreaterThan(0);
    expect(black.squat).toBeLessThan(0.5);
  });

  it('aims a mirrored face by where its eye is drawn, not by the number it stores', () => {
    const yellow = character('yellow');
    const pose = restingPose(yellow);
    aim(yellow, cue({ privacy: true }), pose);

    expect(pose.facing).toBe(-1);
    for (const pupil of pose.pupils) expect(pupil.x * pose.facing).toBeLessThan(0);
    expect(looksAwayFromForm(pose)).toBe(true);
    expect(
      looksAwayFromForm({
        ...pose,
        pupils: pose.pupils.map((pupil) => ({ ...pupil, x: -pupil.x })),
      }),
    ).toBe(false);
    expect(looksAwayFromForm({ ...pose, facing: 1 })).toBe(false);
  });

  it('stands close to upright while turned away, so the turn is in the face and not a second lean', () => {
    for (const config of SCENE_CHARACTERS) {
      const pose = restingPose(config);
      aim(config, cue({ privacy: true }), pose);

      expect(pose.lean, config.id).toBeLessThanOrEqual(0);
      expect(pose.lean, config.id).toBeGreaterThanOrEqual(-1.5);
      expect(pose.faceX, config.id).toBeLessThan(0);
      expect(pose.kink, config.id).toBe(0);
      expect(pose.squat, config.id).toBe(0);
    }
  });

  it('turns the one with a bar to face a pointer on its far side, and back for one on the form side', () => {
    const yellow = character('yellow');
    const farSide = restingPose(yellow);
    const formSide = restingPose(yellow);
    aim(yellow, cue({ target: FAR_SIDE_AND_BELOW }), farSide);
    aim(yellow, cue({ target: TOWARD_THE_FORM }), formSide);

    expect(farSide.facing).toBe(-1);
    for (const pupil of farSide.pupils) expect(pupil.x * farSide.facing).toBeLessThan(0);
    expect(formSide.facing).toBe(1);
    for (const pupil of formSide.pupils) expect(pupil.x).toBeGreaterThan(0);
  });

  it('never turns a face from a field that has attention', () => {
    for (const config of SCENE_CHARACTERS) {
      for (const attention of ['field', 'masked'] as const) {
        const pose = restingPose(config);
        aim(config, cue({ attention, target: TOWARD_THE_FORM }), pose);
        expect(pose.facing, `${config.id} ${attention}`).toBe(1);
      }
    }
  });

  it('holds the bar level for a field and tips it only to follow the pointer', () => {
    const yellow = character('yellow');
    const watching = restingPose(yellow);
    const following = restingPose(yellow);
    aim(yellow, cue({ attention: 'masked', target: { x: 900, y: 430 } }), watching);
    aim(yellow, cue({ target: { x: 900, y: 430 } }), following);

    expect(watching.barTilt).toBe(0);
    expect(following.barTilt).toBeGreaterThan(0);
    expect(following.barTilt).toBeLessThanOrEqual(SCENE_MOTION.barTiltMax);
  });

  it('keeps every face within its travel, however far the pointer goes', () => {
    for (const config of SCENE_CHARACTERS) {
      for (const target of [TOWARD_THE_FORM, FAR_SIDE_AND_BELOW, { x: 5000, y: -5000 }]) {
        const pose = restingPose(config);
        aim(config, cue({ target }), pose);

        expect(Math.abs(pose.faceX), config.id).toBeLessThanOrEqual(config.faceTravel.x);
        expect(Math.abs(pose.faceY), config.id).toBeLessThanOrEqual(config.faceTravel.y);
        expect(Math.abs(pose.lean), config.id).toBeLessThanOrEqual(config.leanMax);
        for (const pupil of pose.pupils) {
          expect(Math.hypot(pupil.x, pupil.y), config.id).toBeLessThanOrEqual(
            config.pupilTravel + 1e-9,
          );
        }
      }
    }
  });

  it('drops the pupils while a request is in flight', () => {
    const orange = SCENE_CHARACTERS.find((character) => character.id === 'orange')!;
    const pose = restingPose(orange);
    aim(orange, cue({ pending: true, target: TOWARD_THE_FORM }), pose);

    for (const pupil of pose.pupils) {
      expect(pupil.y).toBeCloseTo(orange.pupilTravel * SCENE_MOTION.pendingGaze);
    }
  });

  it('names the pose from the snapshot with privacy first', () => {
    expect(poseName({ privacy: true, attention: 'masked', pointer: true })).toBe('away');
    expect(poseName({ privacy: false, attention: 'masked', pointer: true })).toBe('watch');
    expect(poseName({ privacy: false, attention: 'field', pointer: true })).toBe('attend');
    expect(poseName({ privacy: false, attention: 'free', pointer: true })).toBe('follow');
    expect(poseName({ privacy: false, attention: 'free', pointer: false })).toBe('rest');
  });
});

describe('a column body', () => {
  const body = { x: 100, width: 50, height: 300 };

  it('stands as a straight rectangle at rest', () => {
    const { xs, ys } = outline(columnPath(body, SCENE_BASELINE, 0, 0));

    expect(new Set(xs)).toEqual(new Set([100, 150]));
    expect(Math.min(...ys)).toBe(SCENE_BASELINE - 300);
  });

  it('keeps its feet on the baseline and tips its top toward the bend', () => {
    const foot = spineAt(body.height, 60, 0, 0);
    const top = spineAt(body.height, 60, 0, 1);

    expect(foot.dx).toBe(0);
    expect(foot.angleDeg).toBe(0);
    expect(top.dx).toBe(60);
    expect(top.angleDeg).toBeGreaterThan(10);
  });

  it('kinks at an elbow about two thirds of the way up, with the head tipped back over it', () => {
    const at = SCENE_SHAPE.kinkAt;
    const below = spineAt(body.height, 0, -30, at / 2);
    const elbow = spineAt(body.height, 0, -30, at);
    const above = spineAt(body.height, 0, -30, (1 + at) / 2);
    const top = spineAt(body.height, 0, -30, 1);

    expect(at).toBeGreaterThan(0.5);
    expect(at).toBeLessThan(0.8);
    expect(elbow.dx).toBe(-30);
    expect(below.dx).toBeGreaterThan(elbow.dx);
    expect(top.dx).toBeGreaterThan(elbow.dx);
    expect(below.angleDeg).toBeLessThan(0);
    expect(above.angleDeg).toBeGreaterThan(0);
    expect(top.angleDeg).toBe(above.angleDeg);
  });

  it('draws the elbow as one corner on each side, further out than the body at rest', () => {
    const rest = outline(columnPath(body, SCENE_BASELINE, 0, 0));
    const kinked = outline(columnPath(body, SCENE_BASELINE, 0, -30));

    expect(Math.min(...kinked.xs)).toBeLessThan(Math.min(...rest.xs));
    expect(kinked.xs.length).toBeGreaterThan(rest.xs.length);
  });

  it('draws nothing of a bent, kinked or sunk column under the shared baseline but its root', () => {
    const shapes: ReadonlyArray<[number, number, number]> = [
      [0, -30, 0],
      [60, 0, 0],
      [-60, 0, 0],
      [80, -25, 0],
      [-40, -30, 0.3],
      [0, 30, 0.2],
    ];
    for (const [bend, kink, squat] of shapes) {
      const { ys } = outline(columnPath(body, SCENE_BASELINE, bend, kink, squat));
      const root = [ys[0], ys[ys.length - 1]];
      const standing = ys.slice(1, -1);

      expect(root, JSON.stringify([bend, kink, squat])).toEqual([
        SCENE_BASELINE + SCENE_SHAPE.root,
        SCENE_BASELINE + SCENE_SHAPE.root,
      ]);
      expect(Math.max(...standing), JSON.stringify([bend, kink, squat])).toBeLessThanOrEqual(
        SCENE_BASELINE,
      );
    }
  });

  it('sinks by lowering its top and keeping its feet where they were', () => {
    const { xs, ys } = outline(columnPath(body, SCENE_BASELINE, 0, 0, 0.25));

    expect(Math.min(...ys)).toBe(SCENE_BASELINE - 225);
    expect(Math.max(...ys.slice(1, -1))).toBe(SCENE_BASELINE);
    expect(new Set(xs)).toEqual(new Set([100, 150]));
  });

  it('leans as a skew that leaves the baseline where it is', () => {
    expect(leanShift(10, 0)).toBe(0);
    expect(leanShift(10, 300)).toBeGreaterThan(0);
    expect(leanShift(-10, 300)).toBe(-leanShift(10, 300));
    expect(skewAbout(120, SCENE_BASELINE, 10)).toBe(
      `translate(120 ${SCENE_BASELINE}) skewX(-10.000) translate(-120 ${-SCENE_BASELINE})`,
    );
  });
});

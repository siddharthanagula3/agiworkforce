'use client';

import { useEffect, useState, type RefObject } from 'react';

import { SCENE_BASELINE, SCENE_CHARACTERS, SCENE_MOTION, type SceneCharacter } from './sceneConfig';
import {
  approach,
  clamp,
  columnPath,
  leanShift,
  skewAbout,
  spineAt,
  type Point,
} from './sceneMath';
import { aim, looksAwayFromForm, restingPose, type Pose, type SceneCue } from './scenePose';
import type { SceneSnapshot, SceneStore } from './sceneStore';

interface Puppet {
  config: SceneCharacter;
  root: SVGGElement;
  bodies: SVGPathElement[];
  face: SVGGElement;
  bar: SVGGElement | null;
  pupils: SVGCircleElement[];
  current: Pose;
  target: Pose;
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const FINE_POINTER_QUERY = '(pointer: fine)';

function readReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return (
    window.matchMedia(REDUCED_MOTION_QUERY).matches ||
    document.documentElement.dataset['motion'] === 'reduced'
  );
}

/** `null` until the preference has been read on the client, so nothing moves on a guess. */
export function useReducedMotionFlag(): boolean | null {
  const [reduced, setReduced] = useState<boolean | null>(null);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      setReduced(false);
      return;
    }
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const read = () => setReduced(readReducedMotion());
    read();
    query.addEventListener('change', read);
    return () => query.removeEventListener('change', read);
  }, []);
  return reduced;
}

function selectionEnd(element: HTMLInputElement): number {
  try {
    return element.selectionStart ?? element.value.length;
  } catch {
    return element.value.length;
  }
}

function caretPoint(
  element: HTMLInputElement,
  context: CanvasRenderingContext2D | null,
): Point | null {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const middle = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  if (!context) return middle;
  const style = getComputedStyle(element);
  context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const typed = context.measureText(element.value.slice(0, selectionEnd(element))).width;
  const padStart = parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth);
  const padEnd = parseFloat(style.paddingRight) + parseFloat(style.borderRightWidth);
  const x = clamp(padStart + typed - element.scrollLeft, padStart, rect.width - padEnd);
  return { x: rect.left + x, y: middle.y };
}

function boxCentre(box: DOMRect | null): Point | null {
  if (!box || box.width === 0 || box.height === 0) return null;
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

function toSceneSpace(svg: SVGSVGElement, point: Point): Point | null {
  if (typeof svg.getScreenCTM !== 'function' || typeof DOMPoint === 'undefined') return null;
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const local = new DOMPoint(point.x, point.y).matrixTransform(matrix.inverse());
  return { x: local.x, y: local.y };
}

function wire(svg: SVGSVGElement): Puppet[] {
  const puppets: Puppet[] = [];
  for (const config of SCENE_CHARACTERS) {
    const root = svg.querySelector<SVGGElement>(`[data-char="${config.id}"]`);
    const face = root?.querySelector<SVGGElement>('[data-part="face"]');
    if (!root || !face) continue;
    puppets.push({
      config,
      root,
      bodies: Array.from(root.querySelectorAll<SVGPathElement>('[data-part="body"]')),
      face,
      bar: root.querySelector<SVGGElement>('[data-part="bar"]'),
      pupils: Array.from(root.querySelectorAll<SVGCircleElement>('[data-part="pupil"]')),
      current: restingPose(config),
      target: restingPose(config),
    });
  }
  return puppets;
}

function settle(puppet: Puppet, dt: number, response: number): boolean {
  const { current, target } = puppet;
  let moving = false;
  const step = (from: number, to: number, seconds: number) => {
    const next = approach(from, to, dt, seconds);
    if (Math.abs(to - next) > SCENE_MOTION.settleEpsilon) {
      moving = true;
      return next;
    }
    return to;
  };
  current.lean = step(current.lean, target.lean, response);
  current.bend = step(current.bend, target.bend, response);
  current.kink = step(current.kink, target.kink, response);
  current.squat = step(current.squat, target.squat, response);
  current.faceX = step(current.faceX, target.faceX, response);
  current.faceY = step(current.faceY, target.faceY, response);
  current.facing = step(current.facing, target.facing, SCENE_MOTION.turnResponse);
  current.barTilt = step(current.barTilt, target.barTilt, response);
  current.pupils.forEach((pupil, index) => {
    const goal = target.pupils[index];
    if (!goal) return;
    pupil.x = step(pupil.x, goal.x, response);
    pupil.y = step(pupil.y, goal.y, response);
  });
  return moving;
}

function snap(puppet: Puppet): void {
  const { current, target } = puppet;
  current.lean = target.lean;
  current.bend = target.bend;
  current.kink = target.kink;
  current.squat = target.squat;
  current.faceX = target.faceX;
  current.faceY = target.faceY;
  current.facing = target.facing;
  current.barTilt = target.barTilt;
  current.pupils.forEach((pupil, index) => {
    const goal = target.pupils[index];
    if (!goal) return;
    pupil.x = goal.x;
    pupil.y = goal.y;
  });
}

function faceTransform(puppet: Puppet): string {
  const { config, current } = puppet;
  const eyes = config.eyes;
  const eyeLine = eyes[0]?.y ?? SCENE_BASELINE;
  const eyeCentre = eyes.reduce((sum, eye) => sum + eye.x, 0) / Math.max(1, eyes.length);
  const rise = SCENE_BASELINE - eyeLine;
  let shiftX = current.faceX;
  let shiftY = current.faceY;
  let angleDeg = 0;
  if (config.body.kind === 'column') {
    const drop = config.body.height * current.squat;
    const standing = config.body.height - drop;
    const spine = spineAt(standing, current.bend, current.kink, (rise - drop) / standing);
    shiftX += spine.dx + leanShift(current.lean, rise - drop);
    shiftY += drop;
    angleDeg = spine.angleDeg;
  } else {
    shiftX += leanShift(current.lean, rise);
    if (config.faceTravel.x > 0) {
      angleDeg = -config.faceTiltMax * clamp(current.faceX / config.faceTravel.x, -1, 1);
    }
  }
  const parts = [`translate(${shiftX.toFixed(2)} ${shiftY.toFixed(2)})`];
  if (angleDeg !== 0) parts.push(`rotate(${angleDeg.toFixed(2)} ${eyeCentre} ${eyeLine})`);
  if (current.facing !== 1) {
    parts.push(
      `translate(${config.centreX} 0) scale(${current.facing.toFixed(3)} 1) translate(${-config.centreX} 0)`,
    );
  }
  return parts.join(' ');
}

function paint(puppet: Puppet): void {
  const { current, config } = puppet;
  const lean = skewAbout(config.centreX, SCENE_BASELINE, current.lean);
  const d =
    config.body.kind === 'column'
      ? columnPath(config.body, SCENE_BASELINE, current.bend, current.kink, current.squat)
      : null;
  for (const body of puppet.bodies) {
    body.setAttribute('transform', lean);
    if (d !== null) body.setAttribute('d', d);
  }
  puppet.face.setAttribute('transform', faceTransform(puppet));
  if (puppet.bar && config.mouth?.kind === 'bar') {
    puppet.bar.setAttribute(
      'transform',
      `rotate(${current.barTilt.toFixed(2)} ${config.mouth.x1} ${config.mouth.y})`,
    );
  }
  puppet.pupils.forEach((pupil, index) => {
    const offset = current.pupils[index];
    if (offset)
      pupil.setAttribute('transform', `translate(${offset.x.toFixed(2)} ${offset.y.toFixed(2)})`);
  });
}

export function useSceneMotion(
  store: SceneStore,
  svgRef: RefObject<SVGSVGElement | null>,
  reduced: boolean | null,
) {
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || reduced === null) return;

    const puppets = wire(svg);
    if (puppets.length === 0) return;
    const canvas =
      typeof document.createElement === 'function' ? document.createElement('canvas') : null;
    const context = canvas?.getContext('2d') ?? null;

    const pointer: Point & { active: boolean } = { x: 0, y: 0, active: false };
    let caretSeen = -1;
    let caret: Point | null = null;

    const targetFor = (snapshot: SceneSnapshot): Point | null => {
      if (snapshot.attention === 'masked') {
        const centre = boxCentre(store.readWatchedBox());
        return centre ? toSceneSpace(svg, centre) : null;
      }
      const focusTarget = store.readFocusTarget();
      if (focusTarget) {
        const version = store.readCaretVersion();
        if (version !== caretSeen) {
          caretSeen = version;
          caret = caretPoint(focusTarget, context);
        }
        return caret ? toSceneSpace(svg, caret) : null;
      }
      if (pointer.active) return toSceneSpace(svg, pointer);
      return null;
    };

    const cueFor = (snapshot: SceneSnapshot): SceneCue => ({
      privacy: snapshot.privacy,
      attention: snapshot.attention,
      pending: snapshot.mood === 'pending',
      concern: snapshot.mood === 'error',
      target: snapshot.privacy ? null : targetFor(snapshot),
      leaningIn: !reduced && snapshot.attention === 'masked' && store.readLeaningIn(),
    });

    const forgetTurned = () => {
      for (const puppet of puppets) delete puppet.root.dataset['turned'];
    };

    if (reduced) {
      const paintStatic = () => {
        const cue = cueFor(store.getSnapshot());
        for (const puppet of puppets) {
          aim(puppet.config, cue, puppet.target);
          snap(puppet);
          paint(puppet);
        }
      };
      forgetTurned();
      paintStatic();
      const unsubscribe = store.subscribe(paintStatic);
      window.addEventListener('resize', paintStatic, { passive: true });
      return () => {
        unsubscribe();
        window.removeEventListener('resize', paintStatic);
      };
    }

    const finePointer =
      typeof window.matchMedia === 'function' && window.matchMedia(FINE_POINTER_QUERY).matches;
    let frame = 0;
    let last = 0;
    const blinkTimers = new Map<string, ReturnType<typeof setTimeout>>();

    const wake = () => {
      if (frame !== 0 || document.visibilityState === 'hidden') return;
      frame = requestAnimationFrame(tick);
    };

    const tick = (now: number) => {
      frame = 0;
      const dt = last === 0 ? 1 / 60 : Math.min((now - last) / 1000, 0.05);
      last = now;
      const cue = cueFor(store.getSnapshot());
      svg.dataset['leanIn'] = cue.leaningIn ? 'true' : 'false';
      let moving = false;
      for (const puppet of puppets) {
        const response = cue.privacy
          ? Math.min(puppet.config.response, SCENE_MOTION.turnResponse)
          : puppet.config.response;
        aim(puppet.config, cue, puppet.target);
        if (settle(puppet, dt, response)) moving = true;
        paint(puppet);
        // The eyes reopen on this flag alone, so it is set only once the painted
        // pose has finished turning from the form.
        if (cue.privacy && looksAwayFromForm(puppet.current)) {
          puppet.root.dataset['turned'] = 'true';
        } else {
          delete puppet.root.dataset['turned'];
        }
      }
      if (moving) frame = requestAnimationFrame(tick);
      else last = 0;
    };

    const scheduleBlink = (puppet: Puppet) => {
      const delay =
        SCENE_MOTION.blinkMinDelayMs +
        Math.random() * (SCENE_MOTION.blinkMaxDelayMs - SCENE_MOTION.blinkMinDelayMs);
      blinkTimers.set(
        puppet.config.id,
        setTimeout(() => {
          puppet.root.dataset['blink'] = 'closed';
          blinkTimers.set(
            puppet.config.id,
            setTimeout(() => {
              delete puppet.root.dataset['blink'];
              scheduleBlink(puppet);
            }, SCENE_MOTION.blinkClosedMs),
          );
        }, delay),
      );
    };
    const stopBlinking = () => {
      for (const timer of blinkTimers.values()) clearTimeout(timer);
      blinkTimers.clear();
      for (const puppet of puppets) delete puppet.root.dataset['blink'];
    };
    const startBlinking = () => {
      stopBlinking();
      for (const puppet of puppets) scheduleBlink(puppet);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      if (!pointer.active) {
        pointer.active = true;
        store.setPointer(true);
      }
      wake();
    };
    const onPointerLeave = () => {
      pointer.active = false;
      store.setPointer(false);
      wake();
    };
    const onViewportMoved = () => {
      caretSeen = -1;
      wake();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (frame !== 0) cancelAnimationFrame(frame);
        frame = 0;
        last = 0;
        stopBlinking();
        return;
      }
      startBlinking();
      wake();
    };

    // A flag left from an earlier look-away must not reopen eyes at the start
    // of the next one, before this loop has painted a single frame of it.
    let wasPrivate = store.getSnapshot().privacy;
    const onSceneChange = () => {
      const { privacy } = store.getSnapshot();
      if (privacy && !wasPrivate) forgetTurned();
      wasPrivate = privacy;
      wake();
    };
    const unsubscribe = store.subscribe(onSceneChange);
    if (finePointer) {
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      document.addEventListener('mouseleave', onPointerLeave);
    }
    window.addEventListener('scroll', onViewportMoved, { passive: true, capture: true });
    window.addEventListener('resize', onViewportMoved, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    if (document.visibilityState !== 'hidden') startBlinking();
    wake();

    return () => {
      unsubscribe();
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('mouseleave', onPointerLeave);
      window.removeEventListener('scroll', onViewportMoved, { capture: true });
      window.removeEventListener('resize', onViewportMoved);
      document.removeEventListener('visibilitychange', onVisibility);
      if (frame !== 0) cancelAnimationFrame(frame);
      stopBlinking();
      forgetTurned();
    };
  }, [reduced, store, svgRef]);
}

'use client';

import { useEffect, type RefObject } from 'react';

import {
  SCENE_BASELINE,
  SCENE_CHARACTERS,
  SCENE_MOTION,
  type SceneCharacter,
} from '@/features/auth/scene/sceneConfig';
import {
  approach,
  clamp,
  clampRadius,
  leanToward,
  skewAbout,
  type Point,
} from '@/features/auth/scene/sceneMath';

import { CREW_BEATS } from './crewGeometry';

interface Pose {
  lean: number;
  faceX: number;
  faceY: number;
  pupils: Point[];
}

interface Puppet {
  config: SceneCharacter;
  root: SVGGElement;
  hop: SVGGElement;
  lean: SVGGElement;
  face: SVGGElement;
  pupils: SVGCircleElement[];
  current: Pose;
  target: Pose;
}

const FINE_POINTER_QUERY = '(pointer: fine)';
const POINTER_REST_MS = 1200;
const HOP_MS = 320;
const PAPER_ENTER_ANIMATION = 'fr1-paper-enter';
const READERS = new Set(['purple', 'black', 'yellow']);

function restingPose(config: SceneCharacter): Pose {
  return { lean: 0, faceX: 0, faceY: 0, pupils: config.eyes.map(() => ({ x: 0, y: 0 })) };
}

function rest(pose: Pose): void {
  pose.lean = 0;
  pose.faceX = 0;
  pose.faceY = 0;
  for (const pupil of pose.pupils) {
    pupil.x = 0;
    pupil.y = 0;
  }
}

function aim(puppet: Puppet, target: Point | null, reading: boolean): void {
  const { config, target: pose } = puppet;
  if (!target) {
    rest(pose);
    return;
  }
  const dx = target.x - config.centreX;
  pose.lean =
    reading && config.id === 'purple'
      ? config.leanMax
      : leanToward(dx, SCENE_MOTION.leanReach, config.leanMax);
  pose.faceX = clamp(dx / SCENE_MOTION.faceReachX, -config.faceTravel.x, config.faceTravel.x);
  const eyeLine = config.eyes[0]?.y ?? SCENE_BASELINE;
  pose.faceY = clamp(
    (target.y - eyeLine) / SCENE_MOTION.faceReachY,
    -config.faceTravel.y,
    config.faceTravel.y,
  );
  config.eyes.forEach((eye, index) => {
    const pupil = pose.pupils[index];
    if (!pupil) return;
    const offset = clampRadius(
      target.x - (eye.x + pose.faceX),
      target.y - (eye.y + pose.faceY),
      config.pupilTravel,
    );
    pupil.x = offset.x;
    pupil.y = offset.y;
  });
}

function settle(puppet: Puppet, dt: number): boolean {
  const { current, target, config } = puppet;
  let moving = false;
  const step = (from: number, to: number) => {
    const next = approach(from, to, dt, config.response);
    if (Math.abs(to - next) > SCENE_MOTION.settleEpsilon) {
      moving = true;
      return next;
    }
    return to;
  };
  current.lean = step(current.lean, target.lean);
  current.faceX = step(current.faceX, target.faceX);
  current.faceY = step(current.faceY, target.faceY);
  current.pupils.forEach((pupil, index) => {
    const goal = target.pupils[index];
    if (!goal) return;
    pupil.x = step(pupil.x, goal.x);
    pupil.y = step(pupil.y, goal.y);
  });
  return moving;
}

function paint(puppet: Puppet): void {
  const { current, config } = puppet;
  puppet.lean.setAttribute('transform', skewAbout(config.centreX, SCENE_BASELINE, current.lean));
  puppet.face.setAttribute(
    'transform',
    `translate(${current.faceX.toFixed(2)} ${current.faceY.toFixed(2)})`,
  );
  puppet.pupils.forEach((pupil, index) => {
    const offset = current.pupils[index];
    if (offset)
      pupil.setAttribute('transform', `translate(${offset.x.toFixed(2)} ${offset.y.toFixed(2)})`);
  });
}

function wire(stage: HTMLElement): Puppet[] {
  const puppets: Puppet[] = [];
  for (const config of SCENE_CHARACTERS) {
    const root = stage.querySelector<SVGGElement>(`[data-char="${config.id}"]`);
    const hop = root?.querySelector<SVGGElement>('[data-part="hop"]');
    const lean = root?.querySelector<SVGGElement>('[data-part="lean"]');
    const face = root?.querySelector<SVGGElement>('[data-part="face"]');
    if (!root || !hop || !lean || !face) continue;
    puppets.push({
      config,
      root,
      hop,
      lean,
      face,
      pupils: Array.from(root.querySelectorAll<SVGCircleElement>('[data-part="pupil"]')),
      current: restingPose(config),
      target: restingPose(config),
    });
  }
  return puppets;
}

function toSceneSpace(svg: SVGSVGElement, point: Point): Point | null {
  if (typeof svg.getScreenCTM !== 'function' || typeof DOMPoint === 'undefined') return null;
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const local = new DOMPoint(point.x, point.y).matrixTransform(matrix.inverse());
  return { x: local.x, y: local.y };
}

function centreOf(element: Element): Point {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function entranceElapsed(stage: HTMLElement): number {
  if (typeof stage.getAnimations !== 'function') return 0;
  for (const animation of stage.getAnimations({ subtree: true })) {
    if ('animationName' in animation && animation.animationName === PAPER_ENTER_ANIMATION) {
      return typeof animation.currentTime === 'number' ? animation.currentTime : 0;
    }
  }
  return 0;
}

export interface CrewMotionRefs {
  stage: RefObject<HTMLElement | null>;
  svg: RefObject<SVGSVGElement | null>;
  paper: RefObject<HTMLElement | null>;
}

export function useCrewMotion(
  refs: CrewMotionRefs,
  copyId: string,
  reduced: boolean | null,
  paused: boolean,
) {
  useEffect(() => {
    const stage = refs.stage.current;
    const svg = refs.svg.current;
    const paper = refs.paper.current;
    if (!stage || !svg || !paper || reduced === null) return;
    const puppets = wire(stage);

    if (reduced) {
      stage.dataset['beat'] = 'signed';
      const paperCentre = toSceneSpace(svg, centreOf(paper));
      for (const puppet of puppets) {
        aim(puppet, READERS.has(puppet.config.id) ? paperCentre : null, true);
        puppet.current = { ...puppet.target, pupils: puppet.target.pupils.map((p) => ({ ...p })) };
        paint(puppet);
      }
      return;
    }

    if (typeof requestAnimationFrame !== 'function') return;
    const finePointer =
      typeof window.matchMedia === 'function' && window.matchMedia(FINE_POINTER_QUERY).matches;
    const pointer: Point & { active: boolean } = { x: 0, y: 0, active: false };
    let restTimer: ReturnType<typeof setTimeout> | null = null;
    let hovered: Element | null = null;
    let reading = false;
    let frame = 0;
    let last = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const blinkTimers = new Map<string, ReturnType<typeof setTimeout>>();

    const targetFor = (puppet: Puppet): Point | null => {
      if (pointer.active) return toSceneSpace(svg, pointer);
      if (hovered) return toSceneSpace(svg, centreOf(hovered));
      if (reading && READERS.has(puppet.config.id)) return toSceneSpace(svg, centreOf(paper));
      return null;
    };

    const tick = (now: number) => {
      frame = 0;
      const dt = last === 0 ? 1 / 60 : Math.min((now - last) / 1000, 0.05);
      last = now;
      let moving = false;
      for (const puppet of puppets) {
        aim(puppet, targetFor(puppet), reading && !pointer.active && !hovered);
        if (settle(puppet, dt)) moving = true;
        paint(puppet);
      }
      if (moving) frame = requestAnimationFrame(tick);
      else last = 0;
    };

    const wake = () => {
      if (frame !== 0 || document.visibilityState === 'hidden') return;
      frame = requestAnimationFrame(tick);
    };

    const blinkOnce = (puppet: Puppet, then?: () => void) => {
      puppet.root.dataset['blink'] = 'closed';
      blinkTimers.set(
        puppet.config.id,
        setTimeout(() => {
          delete puppet.root.dataset['blink'];
          then?.();
        }, SCENE_MOTION.blinkClosedMs),
      );
    };
    const scheduleBlink = (puppet: Puppet) => {
      const delay =
        SCENE_MOTION.blinkMinDelayMs +
        Math.random() * (SCENE_MOTION.blinkMaxDelayMs - SCENE_MOTION.blinkMinDelayMs);
      blinkTimers.set(
        puppet.config.id,
        setTimeout(() => blinkOnce(puppet, () => scheduleBlink(puppet)), delay),
      );
    };
    const stopBlinking = () => {
      for (const timer of blinkTimers.values()) clearTimeout(timer);
      blinkTimers.clear();
      for (const puppet of puppets) delete puppet.root.dataset['blink'];
    };
    const startBlinking = () => {
      stopBlinking();
      if (paused) return;
      for (const puppet of puppets) scheduleBlink(puppet);
    };

    const hop = (id: string) => {
      const puppet = puppets.find((candidate) => candidate.config.id === id);
      if (!puppet) return;
      puppet.hop.dataset['hop'] = 'up';
      timers.push(
        setTimeout(() => {
          delete puppet.hop.dataset['hop'];
        }, HOP_MS),
      );
    };

    const elapsed = entranceElapsed(stage);
    const at = (time: number, run: () => void, catchUp: boolean) => {
      const wait = time - elapsed;
      if (wait > 0) timers.push(setTimeout(run, wait));
      else if (catchUp) run();
    };
    at(CREW_BEATS.handoff, () => hop('yellow'), false);
    at(
      CREW_BEATS.glance,
      () => {
        const black = puppets.find((candidate) => candidate.config.id === 'black');
        if (black && !paused) blinkOnce(black);
      },
      false,
    );
    at(
      CREW_BEATS.read,
      () => {
        reading = true;
        stage.dataset['beat'] = 'read';
        wake();
      },
      true,
    );
    at(
      CREW_BEATS.signed,
      () => {
        stage.dataset['beat'] = 'signed';
      },
      true,
    );

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
      if (restTimer !== null) clearTimeout(restTimer);
      restTimer = setTimeout(() => {
        pointer.active = false;
        wake();
      }, POINTER_REST_MS);
      wake();
    };
    const onPointerLeave = () => {
      pointer.active = false;
      wake();
    };
    const onHover = (event: Event) => {
      hovered = event.currentTarget as Element;
      wake();
    };
    const onUnhover = (event: Event) => {
      if (hovered === event.currentTarget) hovered = null;
      wake();
    };
    const onViewportMoved = () => wake();
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

    const buttons = Array.from(
      document.getElementById(copyId)?.querySelectorAll('a, button') ?? [],
    );
    for (const button of buttons) {
      button.addEventListener('pointerenter', onHover);
      button.addEventListener('pointerleave', onUnhover);
      button.addEventListener('focus', onHover);
      button.addEventListener('blur', onUnhover);
    }
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
      for (const button of buttons) {
        button.removeEventListener('pointerenter', onHover);
        button.removeEventListener('pointerleave', onUnhover);
        button.removeEventListener('focus', onHover);
        button.removeEventListener('blur', onUnhover);
      }
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('mouseleave', onPointerLeave);
      window.removeEventListener('scroll', onViewportMoved, { capture: true });
      window.removeEventListener('resize', onViewportMoved);
      document.removeEventListener('visibilitychange', onVisibility);
      if (frame !== 0) cancelAnimationFrame(frame);
      if (restTimer !== null) clearTimeout(restTimer);
      for (const timer of timers) clearTimeout(timer);
      stopBlinking();
    };
  }, [refs, copyId, reduced, paused]);
}

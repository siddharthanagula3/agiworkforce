'use client';

import { useId, useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from 'react';

import {
  SCENE_BASELINE,
  SCENE_CHARACTERS,
  SCENE_ENTERED_STORAGE_KEY,
  SCENE_VIEWBOX,
  type SceneCharacter,
  type SceneEye,
  type SceneMouth,
} from './sceneConfig';
import { bodyPath } from './sceneMath';
import { poseName, type ScenePoseName } from './scenePose';
import { SCENE_SERVER_SNAPSHOT, type SceneStore } from './sceneStore';
import { useReducedMotionFlag, useSceneMotion } from './useSceneMotion';

const ENTRANCE_ANIMATION_PREFIX = 'auth-char-enter';
const FROWN = { halfWidth: 10, rise: 8 } as const;
const HUMP = { width: 14, rise: 6 } as const;

function Eye({ eye }: { eye: SceneEye }) {
  const r = eye.radius;
  const lid = eye.lid === 'arc' ? `M${-r} 1 Q0 ${-r * 1.3} ${r} 1` : `M${-r} 0 H${r}`;
  return (
    <g className="auth-eye" transform={`translate(${eye.x} ${eye.y})`}>
      <g className="auth-eye-open">
        {eye.kind === 'white' ? <circle className="auth-eye-white" r={r} /> : null}
        <circle className="auth-pupil" data-part="pupil" r={eye.kind === 'white' ? eye.pupil : r} />
      </g>
      <path className="auth-eye-lid" d={lid} />
      {eye.brow ? (
        <rect
          className="auth-brow"
          x={-r - 3}
          y={-r - 7}
          width={2 * r + 6}
          height={r * 0.95}
          rx={2}
        />
      ) : null}
    </g>
  );
}

function frown(x: number, y: number): string {
  return `M${x - FROWN.halfWidth} ${y + FROWN.rise / 2} q${FROWN.halfWidth} ${-FROWN.rise} ${2 * FROWN.halfWidth} 0`;
}

function Mouth({ mouth }: { mouth: SceneMouth }) {
  if (!mouth) return null;
  switch (mouth.kind) {
    case 'dash':
      return (
        <>
          <rect
            className="auth-mouth auth-mouth-dash"
            x={mouth.x - mouth.width / 2}
            y={mouth.y - mouth.height / 2}
            width={mouth.width}
            height={mouth.height}
            rx={mouth.height / 2}
          />
          <path className="auth-mouth auth-mouth-frown" d={frown(mouth.x, mouth.y)} />
        </>
      );
    case 'smile': {
      const half = mouth.width / 2;
      return (
        <>
          <path
            className="auth-mouth auth-mouth-smile"
            d={`M${mouth.x - half} ${mouth.y} h${mouth.width} a${half} ${mouth.height} 0 0 1 ${-mouth.width} 0 z`}
          />
          <circle
            className="auth-mouth auth-mouth-dot"
            cx={mouth.x}
            cy={mouth.y + mouth.dot}
            r={mouth.dot}
          />
          <path className="auth-mouth auth-mouth-frown" d={frown(mouth.x, mouth.y + mouth.dot)} />
        </>
      );
    }
    case 'bar':
      return (
        <g data-part="bar">
          <path className="auth-mouth auth-mouth-line" d={`M${mouth.x1} ${mouth.y} H${mouth.x2}`} />
          <path
            className="auth-mouth auth-mouth-wavy"
            d={`M${mouth.x1} ${mouth.y} q${HUMP.width / 2} ${-HUMP.rise} ${HUMP.width} 0${` t${HUMP.width} 0`.repeat(mouth.humps - 1)}`}
          />
        </g>
      );
  }
}

function Character({
  character,
  clipId,
  pose,
}: {
  character: SceneCharacter;
  clipId: string;
  pose: ScenePoseName;
}) {
  const path = bodyPath(character.body);
  const face = (
    <g data-part="face">
      {character.eyes.map((eye, index) => (
        <Eye key={index} eye={eye} />
      ))}
      <Mouth mouth={character.mouth} />
    </g>
  );
  return (
    <g
      className={`auth-char auth-char-${character.id}`}
      data-char={character.id}
      data-pose={pose}
      data-gesture={character.gesture}
    >
      <g className="auth-hop">
        <g className="auth-breath">
          {character.clipFace ? (
            <clipPath id={clipId}>
              <path data-part="body" d={path} />
              {character.clipOpensToForm ? (
                <rect
                  x={character.centreX}
                  y={-SCENE_VIEWBOX.height}
                  width={2 * SCENE_VIEWBOX.width}
                  height={3 * SCENE_VIEWBOX.height}
                />
              ) : null}
            </clipPath>
          ) : null}
          <path className="auth-body" data-part="body" d={path} />
          {character.clipFace ? <g clipPath={`url(#${clipId})`}>{face}</g> : face}
        </g>
      </g>
    </g>
  );
}

function isEntrance(animation: Animation): boolean {
  return (
    'animationName' in animation &&
    typeof animation.animationName === 'string' &&
    animation.animationName.startsWith(ENTRANCE_ANIMATION_PREFIX)
  );
}

function readEntranceStart(): number | null {
  try {
    const stored = Number(window.sessionStorage.getItem(SCENE_ENTERED_STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : null;
  } catch {
    return null;
  }
}

function writeEntranceStart(startedAt: number): void {
  try {
    window.sessionStorage.setItem(SCENE_ENTERED_STORAGE_KEY, String(startedAt));
  } catch {
    return;
  }
}

/**
 * The entrance plays once per session. A remount within it (the route's
 * loading boundary handing over to the page, or a sign-in to sign-up switch)
 * resumes every arrival from where the previous scene left it instead of
 * restarting the stagger from the baseline.
 */
function useEntranceOnce(svgRef: RefObject<SVGSVGElement | null>): void {
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof svg.getAnimations !== 'function') return;
    const now = Date.now();
    const startedAt = readEntranceStart();
    if (startedAt === null || startedAt > now) {
      writeEntranceStart(now);
      return;
    }
    const elapsed = now - startedAt;
    for (const animation of svg.getAnimations({ subtree: true })) {
      if (!isEntrance(animation)) continue;
      const end = animation.effect?.getComputedTiming().endTime;
      if (typeof end === 'number' && elapsed >= end) animation.finish();
      else animation.currentTime = elapsed;
    }
    return () => {
      const current = svg.getAnimations({ subtree: true }).find(isEntrance)?.currentTime;
      if (typeof current === 'number' && current >= 0) writeEntranceStart(Date.now() - current);
    };
  }, [svgRef]);
}

export function AuthCharacterScene({ store }: { store: SceneStore }) {
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => SCENE_SERVER_SNAPSHOT,
  );
  const svgRef = useRef<SVGSVGElement>(null);
  const clipBase = useId();
  const reduced = useReducedMotionFlag();
  const pose = poseName(snapshot);
  const groundId = `${clipBase}-ground`;
  useEntranceOnce(svgRef);
  useSceneMotion(store, svgRef, reduced);

  return (
    <div className="auth-scene-panel" aria-hidden="true" data-testid="auth-scene">
      <svg
        ref={svgRef}
        className="auth-scene"
        viewBox={`0 0 ${SCENE_VIEWBOX.width} ${SCENE_VIEWBOX.height}`}
        preserveAspectRatio="xMidYMax meet"
        focusable="false"
        data-privacy={snapshot.privacy ? 'true' : 'false'}
        data-mood={snapshot.mood}
        data-focus={snapshot.attention}
        data-relief={snapshot.relief ? 'true' : 'false'}
        data-motion={reduced ? 'reduced' : 'full'}
      >
        <clipPath id={groundId}>
          <rect
            x={-SCENE_VIEWBOX.width}
            y={-SCENE_VIEWBOX.height}
            width={3 * SCENE_VIEWBOX.width}
            height={SCENE_VIEWBOX.height + SCENE_BASELINE}
          />
        </clipPath>
        <g clipPath={`url(#${groundId})`}>
          {SCENE_CHARACTERS.map((character) => (
            <Character
              key={character.id}
              character={character}
              clipId={`${clipBase}-${character.id}`}
              pose={pose}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

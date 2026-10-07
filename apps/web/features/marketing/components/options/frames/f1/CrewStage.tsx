'use client';

import { Pause, Play } from 'lucide-react';
import { useId, useMemo, useRef, useState, type CSSProperties } from 'react';

import {
  bodyPath,
  SCENE_CHARACTERS,
  SCENE_VIEWBOX,
  type SceneCharacter,
  type SceneEye,
  type SceneMouth,
  useReducedMotionFlag,
} from '@agiworkforce/ui/auth-scene';

import { useCrewMotion } from './useCrewMotion';

const STAMP_SPOKES = 12;
const STAMP_INNER = 5.2;
const STAMP_OUTER = 9.4;
const DOCUMENT_BARS = [100, 72, 88, 56, 80] as const;

function Eye({ eye }: { eye: SceneEye }) {
  return (
    <g className="fr1-eye" transform={`translate(${eye.x} ${eye.y})`}>
      <g className="fr1-eye-open">
        {eye.kind === 'white' ? <circle className="fr1-eye-white" r={eye.radius} /> : null}
        <circle
          className="fr1-pupil"
          data-part="pupil"
          r={eye.kind === 'white' ? eye.pupil : eye.radius}
        />
      </g>
      <path className="fr1-eye-lid" d={`M${-eye.radius} 0 H${eye.radius}`} />
    </g>
  );
}

function Mouth({ mouth }: { mouth: SceneMouth }) {
  if (!mouth) return null;
  switch (mouth.kind) {
    case 'dash':
      return (
        <rect
          className="fr1-mouth fr1-mouth-dash"
          x={mouth.x - mouth.width / 2}
          y={mouth.y - mouth.height / 2}
          width={mouth.width}
          height={mouth.height}
          rx={Math.min(mouth.width, mouth.height) / 2}
        />
      );
    case 'smile': {
      const half = mouth.width / 2;
      return (
        <path
          className="fr1-mouth fr1-mouth-smile"
          d={`M${mouth.x - half} ${mouth.y} h${mouth.width} a${half} ${mouth.height} 0 0 1 ${-mouth.width} 0 z`}
        />
      );
    }
    case 'bar':
      return (
        <path className="fr1-mouth fr1-mouth-line" d={`M${mouth.x1} ${mouth.y} H${mouth.x2}`} />
      );
  }
}

function Character({ character, clipId }: { character: SceneCharacter; clipId: string }) {
  const face = (
    <g data-part="face">
      {character.eyes.map((eye, index) => (
        <Eye key={index} eye={eye} />
      ))}
      <Mouth mouth={character.mouth} />
    </g>
  );
  return (
    <g className={`fr1-char fr1-char-${character.id}`} data-char={character.id}>
      <g className="fr1-hop" data-part="hop">
        <g className="fr1-breath">
          <g data-part="lean">
            {character.clipFace ? (
              <clipPath id={clipId}>
                <path d={bodyPath(character.body)} />
              </clipPath>
            ) : null}
            <path className="fr1-body" d={bodyPath(character.body)} />
            {character.clipFace ? <g clipPath={`url(#${clipId})`}>{face}</g> : face}
          </g>
        </g>
      </g>
    </g>
  );
}

function Stamp() {
  const spokes = useMemo(
    () =>
      Array.from({ length: STAMP_SPOKES }, (_, index) => {
        const angle = (index * 2 * Math.PI) / STAMP_SPOKES;
        return {
          x1: (12 + STAMP_INNER * Math.sin(angle)).toFixed(3),
          y1: (12 - STAMP_INNER * Math.cos(angle)).toFixed(3),
          x2: (12 + STAMP_OUTER * Math.sin(angle)).toFixed(3),
          y2: (12 - STAMP_OUTER * Math.cos(angle)).toFixed(3),
        };
      }),
    [],
  );
  return (
    <svg className="fr1-stamp" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="11.2" className="fr1-stamp-ring" />
      {spokes.map((spoke, index) => (
        <line
          key={index}
          x1={spoke.x1}
          y1={spoke.y1}
          x2={spoke.x2}
          y2={spoke.y2}
          className="fr1-stamp-spoke"
        />
      ))}
    </svg>
  );
}

interface CrewStageProps {
  fileName: string;
  laneName: string;
  modelLines: readonly string[];
  copyId: string;
}

export function CrewStage({ fileName, laneName, modelLines, copyId }: CrewStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const clipBase = useId();
  const reduced = useReducedMotionFlag();
  const [paused, setPaused] = useState(false);
  const refs = useMemo(() => ({ stage: stageRef, svg: svgRef, paper: paperRef }), []);
  useCrewMotion(refs, copyId, reduced, paused);

  return (
    <div
      ref={stageRef}
      className="fr1-stage"
      data-illustration=""
      data-motion={reduced === null ? undefined : reduced ? 'reduced' : 'full'}
      data-paused={paused ? 'true' : undefined}
    >
      <div className="fr1-crew" aria-hidden="true">
        <svg
          ref={svgRef}
          className="fr1-layer"
          viewBox={`0 0 ${SCENE_VIEWBOX.width} ${SCENE_VIEWBOX.height}`}
          preserveAspectRatio="xMidYMax meet"
          focusable="false"
        >
          {SCENE_CHARACTERS.map((character) => (
            <Character
              key={character.id}
              character={character}
              clipId={`${clipBase}-${character.id}`}
            />
          ))}
        </svg>
        <div className="fr1-paper-slide">
          <div ref={paperRef} className="fr1-paper">
            <p className="fr1-paper-name">{fileName}</p>
            <div className="fr1-paper-bars">
              {DOCUMENT_BARS.map((width, index) => (
                <i key={index} style={{ width: `${width}%` }} />
              ))}
            </div>
            <div className="fr1-paper-receipt">
              <p className="fr1-paper-line fr1-paper-route">
                <i className="fr1-paper-swatch" />
                {laneName}
              </p>
              {modelLines.map((line, index) => (
                <p
                  key={line}
                  className="fr1-paper-line"
                  style={{ '--fr1-line-index': index + 1 } as CSSProperties}
                >
                  {line}
                </p>
              ))}
            </div>
            <Stamp />
          </div>
        </div>
      </div>
      {reduced === false ? (
        <button
          type="button"
          className="fr1-pause"
          aria-label={paused ? 'Resume the scene' : 'Pause the scene'}
          aria-pressed={paused}
          onClick={() => setPaused((value) => !value)}
        >
          {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
        </button>
      ) : null}
    </div>
  );
}

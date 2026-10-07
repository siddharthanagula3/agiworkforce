'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import {
  hasFinePointer,
  prefersReducedMotion,
} from '@/features/marketing/components/motion/motionPreferences';
import type { CitySurface } from './content';

const SPOKES = 12;
const SUN_R = 92;
const SPOKE_IN = 115;
const SPOKE_OUT = 176;
const SPOKE_W = 16;
const CRANE_ROOM = 96;
const WINDOW = 10;
const PITCH = 18;
const AIM_LIMIT = 12;
const AIM_GAIN = 0.1;
const PARALLAX_X = 6;
const PARALLAX_Y = 4;

const STARS: readonly (readonly [number, number, number])[] = [
  [120, 90, 3],
  [260, 40, 2.4],
  [410, 150, 2.4],
  [560, 60, 3],
  [690, 190, 2.4],
  [820, 30, 2.4],
  [960, 110, 3],
  [1110, 50, 2.4],
  [1230, 170, 2.4],
  [1340, 80, 3],
  [1400, 230, 2.4],
];

const FAR_BLOCKS: readonly (readonly [number, number, number])[] = [
  [0, 70, 50],
  [70, 50, 34],
  [120, 90, 62],
  [210, 60, 42],
  [270, 110, 28],
  [380, 70, 56],
  [450, 50, 38],
  [500, 120, 48],
  [620, 60, 70],
  [680, 90, 44],
  [770, 50, 84],
  [820, 110, 58],
  [930, 70, 96],
  [1000, 90, 50],
  [1090, 60, 74],
  [1150, 120, 40],
  [1270, 70, 88],
  [1340, 100, 60],
];

const vars = (values: Record<string, number | string>) => values as CSSProperties;

function Sun({ aimRef }: { aimRef: React.RefObject<SVGGElement | null> }) {
  const spokes = Array.from({ length: SPOKES }, (_, index) => {
    const angle = (index * 2 * Math.PI) / SPOKES;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    return {
      x1: (SPOKE_IN * sin).toFixed(2),
      y1: (-SPOKE_IN * cos).toFixed(2),
      x2: (SPOKE_OUT * sin).toFixed(2),
      y2: (-SPOKE_OUT * cos).toFixed(2),
      signature: index === 0,
    };
  });
  return (
    <svg className="fr3-sun" viewBox="-180 -180 360 360" aria-hidden="true" focusable="false">
      <g ref={aimRef} className="fr3-sun-aim">
        <g className="fr3-sun-spokes">
          {spokes.map((spoke, index) => (
            <line
              key={index}
              x1={spoke.x1}
              y1={spoke.y1}
              x2={spoke.x2}
              y2={spoke.y2}
              strokeWidth={SPOKE_W}
              strokeLinecap="round"
              className={spoke.signature ? 'fr3-spoke fr3-spoke-signature' : 'fr3-spoke'}
            />
          ))}
        </g>
      </g>
      <circle r={SUN_R} className="fr3-sun-disc" />
    </svg>
  );
}

function Cloud({ className, width }: { className: string; width: number }) {
  const height = Math.round(width * 0.3);
  const lobe = Math.round(width * 0.5);
  return (
    <div className={`fr3-cloud ${className}`}>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
        <rect
          x={Math.round(width * 0.25)}
          y={0}
          width={lobe}
          height={Math.round(height * 0.84)}
          rx={Math.round(height * 0.42)}
        />
        <rect
          x={0}
          y={Math.round(height * 0.37)}
          width={width}
          height={Math.round(height * 0.63)}
          rx={Math.round(height * 0.315)}
        />
      </svg>
    </div>
  );
}

function Crane({ x, y, index }: { x: number; y: number; index: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="fr3-crane" style={vars({ '--fr3-i': index })}>
        <line x1={0} y1={0} x2={0} y2={70} />
        <line x1={-38} y1={0} x2={38} y2={0} />
        <line x1={24} y1={0} x2={24} y2={26} className="fr3-crane-cable" />
        <line x1={19} y1={26} x2={29} y2={26} className="fr3-crane-cable" />
      </g>
    </g>
  );
}

function Windows({
  width,
  top,
  height,
  lit,
}: {
  width: number;
  top: number;
  height: number;
  lit: boolean;
}) {
  const cols = Math.max(1, Math.floor((width - 12) / PITCH));
  const rows = Math.max(1, Math.floor((height - 34) / PITCH));
  const x0 = Math.round((width - ((cols - 1) * PITCH + WINDOW)) / 2);
  const y0 = top + 16;
  const grid = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => ({
      x: x0 + col * PITCH,
      y: y0 + row * PITCH,
    })),
  );
  return (
    <>
      <g className="fr3-win-off">
        {grid.flat().map((cell) => (
          <rect key={`${cell.x}-${cell.y}`} x={cell.x} y={cell.y} width={WINDOW} height={WINDOW} />
        ))}
      </g>
      {lit
        ? grid.map((row, rowIndex) => (
            <g key={rowIndex} className="fr3-win-row" style={vars({ '--fr3-i': rowIndex })}>
              {row.map((cell) => (
                <rect
                  key={`${cell.x}-${cell.y}`}
                  x={cell.x}
                  y={cell.y}
                  width={WINDOW}
                  height={WINDOW}
                />
              ))}
            </g>
          ))
        : null}
    </>
  );
}

function Tower({ surface, index }: { surface: CitySurface; index: number }) {
  const { width, height, released } = surface;
  const total = height + CRANE_ROOM;
  const builtTop = released ? CRANE_ROOM : CRANE_ROOM + Math.round(height / 3);
  const builtHeight = total - builtTop;
  return (
    <svg
      viewBox={`0 0 ${width} ${total}`}
      width={width}
      height={total}
      aria-hidden="true"
      focusable="false"
    >
      {released ? (
        <>
          <line
            x1={width / 2}
            y1={CRANE_ROOM}
            x2={width / 2}
            y2={CRANE_ROOM - 30}
            className="fr3-antenna"
          />
          <circle cx={width / 2} cy={CRANE_ROOM - 34} r={5} className="fr3-beacon" />
        </>
      ) : (
        <>
          <rect
            x={2}
            y={CRANE_ROOM + 2}
            width={width - 4}
            height={builtTop - CRANE_ROOM - 4}
            className="fr3-scaffold"
          />
          <line
            x1={2}
            y1={CRANE_ROOM + Math.round((builtTop - CRANE_ROOM) / 2)}
            x2={width - 2}
            y2={CRANE_ROOM + Math.round((builtTop - CRANE_ROOM) / 2)}
            className="fr3-scaffold"
          />
          <Crane x={Math.round(width / 2)} y={CRANE_ROOM + 2} index={index} />
        </>
      )}
      <rect x={0} y={builtTop} width={width} height={builtHeight} className="fr3-tower-body" />
      <Windows width={width} top={builtTop} height={builtHeight} lit={released} />
      {released ? (
        <rect
          x={Math.round(width / 2) - 8}
          y={total - 24}
          width={16}
          height={24}
          className="fr3-door"
        />
      ) : null}
    </svg>
  );
}

export function DaybreakScene({ city }: { city: readonly CitySurface[] }) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const aimRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    const aim = aimRef.current;
    const hero = scene?.parentElement;
    if (!scene || !aim || !hero) return;
    if (prefersReducedMotion() || !hasFinePointer()) return;

    let frame = 0;
    let pointerX = 0;
    let pointerY = 0;
    let active = false;

    const paint = () => {
      frame = 0;
      const sun = aim.getBoundingClientRect();
      const box = hero.getBoundingClientRect();
      if (!active) {
        aim.style.setProperty('--fr3-aim', '0deg');
        hero.style.setProperty('--fr3-px', '0px');
        hero.style.setProperty('--fr3-py', '0px');
        return;
      }
      const dx = pointerX - (sun.left + sun.width / 2);
      const dy = pointerY - (sun.top + sun.height / 2);
      const toward = (Math.atan2(dx, -dy) * 180) / Math.PI;
      const degrees = Math.max(-AIM_LIMIT, Math.min(AIM_LIMIT, toward * AIM_GAIN));
      aim.style.setProperty('--fr3-aim', `${degrees.toFixed(2)}deg`);
      const nx = ((pointerX - box.left) / box.width) * 2 - 1;
      const ny = ((pointerY - box.top) / box.height) * 2 - 1;
      hero.style.setProperty('--fr3-px', `${(-nx * PARALLAX_X).toFixed(2)}px`);
      hero.style.setProperty('--fr3-py', `${(-ny * PARALLAX_Y).toFixed(2)}px`);
    };
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(paint);
    };
    const onMove = (event: PointerEvent) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      active = true;
      schedule();
    };
    const onLeave = () => {
      active = false;
      schedule();
    };
    hero.addEventListener('pointermove', onMove);
    hero.addEventListener('pointerleave', onLeave);
    return () => {
      hero.removeEventListener('pointermove', onMove);
      hero.removeEventListener('pointerleave', onLeave);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={sceneRef} className="fr3-scene" data-illustration>
      <div className="fr3-layer fr3-night" />
      <svg
        className="fr3-layer fr3-stars"
        viewBox="0 0 1440 400"
        preserveAspectRatio="xMidYMin slice"
        aria-hidden="true"
      >
        {STARS.map(([x, y, r]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />
        ))}
      </svg>
      <div className="fr3-layer fr3-day">
        <div className="fr3-band fr3-band-sky" />
        <div className="fr3-band fr3-band-mid" />
        <div className="fr3-band fr3-band-peach" />
        <div />
      </div>
      <Sun aimRef={aimRef} />
      <Cloud className="fr3-cloud-a" width={200} />
      <Cloud className="fr3-cloud-b" width={130} />
      <Cloud className="fr3-cloud-c" width={110} />
      <svg
        className="fr3-far"
        viewBox="0 0 1440 120"
        preserveAspectRatio="xMidYMax slice"
        aria-hidden="true"
      >
        {FAR_BLOCKS.map(([x, w, h]) => (
          <rect key={x} x={x} y={120 - h} width={w} height={h} />
        ))}
      </svg>
      <div className="fr3-ground" />
      <ul className="fr3-city">
        {city.map((surface, index) => (
          <li
            key={surface.id}
            className="fr3-tower"
            data-surface={surface.id}
            data-released={surface.released ? 'true' : undefined}
          >
            <Tower surface={surface} index={index} />
            <div className="fr3-sign">
              <span className="fr3-sign-name">{surface.name}</span>
              <span className="fr3-sign-status">{surface.status}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

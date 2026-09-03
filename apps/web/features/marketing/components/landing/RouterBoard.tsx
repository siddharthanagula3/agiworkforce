'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import {
  LANE_MARKS,
  ROUTER_MODEL_IDS,
  ROUTER_ROUTES,
  SURFACES,
  modelName,
} from './landing-content';

const WIDTH = 900;
const HEIGHT = 440;
const PAD = 36;
const LEFT = 214;
const RIGHT = WIDTH - 156;
const HUB = WIDTH / 2;
const HUB_RADIUS = 36;
const LABEL_GAP = 14;
const BASELINE = 5;
const CYCLE_MS = 3600;
const PULSE_S = 1.5;
const PULSE_RADIUS = 4;
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

const rowY = (position: number, count: number) =>
  PAD + (position * (HEIGHT - PAD * 2)) / (count - 1);
const inPath = (y: number) =>
  `M ${LEFT} ${y} C ${LEFT + 150} ${y}, ${HUB - 170} ${HEIGHT / 2}, ${HUB - HUB_RADIUS} ${HEIGHT / 2}`;
const outPath = (y: number) =>
  `M ${HUB + HUB_RADIUS} ${HEIGHT / 2} C ${HUB + 170} ${HEIGHT / 2}, ${RIGHT - 150} ${y}, ${RIGHT} ${y}`;

const models = ROUTER_MODEL_IDS.map((id, position) => ({
  id,
  y: rowY(position, ROUTER_MODEL_IDS.length),
}));
const surfaces = SURFACES.map((surface, position) => ({
  name: surface.name,
  y: rowY(position, SURFACES.length),
}));

export function RouterBoard() {
  const [index, setIndex] = useState(0);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function' || window.matchMedia(REDUCED_MOTION).matches) {
      return;
    }
    setAnimate(true);
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % ROUTER_ROUTES.length),
      CYCLE_MS,
    );
    return () => window.clearInterval(timer);
  }, []);

  const route = ROUTER_ROUTES[index] ?? ROUTER_ROUTES[0]!;
  const model = models.find((entry) => entry.id === route.modelId) ?? models[0]!;
  const surface = surfaces.find((entry) => entry.name === route.surface) ?? surfaces[0]!;
  const liveIn = inPath(model.y);
  const liveOut = outPath(surface.y);
  const pulseStyle = (path: string, delay: number): CSSProperties =>
    ({
      offsetPath: `path("${path}")`,
      '--lp-pulse': `${PULSE_S}s`,
      '--lp-delay': `${delay}s`,
    }) as CSSProperties;

  return (
    <figure
      className="agi-lp-board"
      aria-label="Models on the left route through AGI to the surfaces on the right"
    >
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="agi-lp-board-svg" aria-hidden="true">
        {models.map((entry) => (
          <path key={entry.id} d={inPath(entry.y)} className="agi-lp-wire" />
        ))}
        {surfaces.map((entry) => (
          <path key={entry.name} d={outPath(entry.y)} className="agi-lp-wire" />
        ))}
        <path d={liveIn} className="agi-lp-wire agi-lp-wire--live" />
        <path d={liveOut} className="agi-lp-wire agi-lp-wire--live" />
        {animate ? (
          <g key={index}>
            <circle r={PULSE_RADIUS} className="agi-lp-pulse" style={pulseStyle(liveIn, 0)} />
            <circle
              r={PULSE_RADIUS}
              className="agi-lp-pulse"
              style={pulseStyle(liveOut, PULSE_S)}
            />
          </g>
        ) : null}
        <circle cx={HUB} cy={HEIGHT / 2} r={HUB_RADIUS} className="agi-lp-hub-ring" />
        <text
          x={HUB}
          y={HEIGHT / 2 + BASELINE + 2}
          textAnchor="middle"
          className="agi-lp-hub-label"
        >
          router
        </text>
        {models.map((entry) => (
          <text
            key={entry.id}
            x={LEFT - LABEL_GAP}
            y={entry.y + BASELINE}
            textAnchor="end"
            className="agi-lp-node"
            data-live={entry.id === route.modelId}
          >
            {modelName(entry.id)}
          </text>
        ))}
        {surfaces.map((entry) => (
          <text
            key={entry.name}
            x={RIGHT + LABEL_GAP}
            y={entry.y + BASELINE}
            className="agi-lp-node"
            data-live={entry.name === route.surface}
          >
            {entry.name}
          </text>
        ))}
      </svg>
      <figcaption className="agi-lp-board-receipt" key={index}>
        <span className="agi-lp-receipt-mark" aria-hidden="true">
          {LANE_MARKS[route.lane]}
        </span>
        <span>{route.lane}</span>
        <span>{route.via}</span>
        <span>{route.modelId}</span>
        <span>{route.note}</span>
        <span>{route.surface}</span>
      </figcaption>
      <ol className="agi-lp-board-list">
        {ROUTER_ROUTES.map((entry) => (
          <li key={entry.modelId}>
            <span className="agi-lp-receipt-mark" aria-hidden="true">
              {LANE_MARKS[entry.lane]}
            </span>
            <span>
              {modelName(entry.modelId)} via {entry.via}, {entry.lane}, to {entry.surface}.{' '}
              {entry.note}.
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

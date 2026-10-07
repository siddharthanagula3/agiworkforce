import type { ReactNode } from 'react';
import { LANES } from './content';

export const SHAPE_W = 272;
export const SHAPE_H = 292;
export const DOT_TRAVEL = 200;
export const DOT_SPIN = 955;
export const CARD_DROP = 520;

export const ASK_DOT = { cx: 48, cy: 244, r: 24 } as const;
export const ROUTE_DOT = { cx: 36, cy: 232, r: 12 } as const;
export const CARD = { x: 24, y: 60, w: 224, h: 172, rx: 14 } as const;
export const CARD_CENTER = { cx: CARD.x + CARD.w / 2, cy: CARD.y + CARD.h / 2 } as const;
export const MARK = { cx: 56, cy: 92, inner: 6.1, outer: 12 } as const;

const BAR_Y = { local: 76, byok: 148, cloud: 220 } as const;
export const BAR_TOP_PERCENT: Record<string, number> = {
  local: (BAR_Y.local / SHAPE_H) * 100,
  byok: (BAR_Y.byok / SHAPE_H) * 100,
  cloud: (BAR_Y.cloud / SHAPE_H) * 100,
};

const ANSWER_LINES = [
  { y: 88, w: 140 },
  { y: 108, w: 104 },
  { y: 128, w: 120 },
] as const;

const RECEIPT_ROWS = [
  { y: 136, w: 176 },
  { y: 154, w: 150 },
  { y: 172, w: 164 },
  { y: 190, w: 120 },
  { y: 208, w: 140 },
] as const;

const MARK_SPOKES = 12;

const markSpokes = Array.from({ length: MARK_SPOKES }, (_, i) => {
  const rad = (i * 2 * Math.PI) / MARK_SPOKES;
  const round = (value: number) => Number(value.toFixed(3));
  return {
    x1: round(MARK.cx + MARK.inner * Math.sin(rad)),
    y1: round(MARK.cy - MARK.inner * Math.cos(rad)),
    x2: round(MARK.cx + MARK.outer * Math.sin(rad)),
    y2: round(MARK.cy - MARK.outer * Math.cos(rad)),
  };
});

export function scaleAbout(cx: number, cy: number, s: number): string {
  return `translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})`;
}

export function rollTransform(progress: number): string {
  return `translate(${progress * DOT_TRAVEL} 0) rotate(${progress * DOT_SPIN} ${ROUTE_DOT.cx} ${ROUTE_DOT.cy})`;
}

function Shape({ children }: { children: ReactNode }) {
  return (
    <svg
      className="fr5-shape"
      viewBox={`0 0 ${SHAPE_W} ${SHAPE_H}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function AskShape() {
  return (
    <Shape>
      <circle
        data-part="dot"
        className="fr5-fill-ink"
        cx={ASK_DOT.cx}
        cy={ASK_DOT.cy}
        r={ASK_DOT.r}
      />
    </Shape>
  );
}

export function RouteShape({ rest }: { rest: boolean }) {
  const dotX = rest ? ROUTE_DOT.cx + DOT_TRAVEL : ROUTE_DOT.cx;
  return (
    <Shape>
      {LANES.map((lane) => (
        <rect
          key={lane.id}
          data-part={`bar-${lane.id}`}
          className={`fr5-bar fr5-fill-${lane.id}`}
          x="24"
          y={BAR_Y[lane.id]}
          width="224"
          height="24"
          rx="12"
        />
      ))}
      <g data-part="roll" transform={rest ? undefined : rollTransform(0)}>
        <circle className="fr5-fill-ink" cx={dotX} cy={ROUTE_DOT.cy} r={ROUTE_DOT.r} />
        <circle className="fr5-fill-cream" cx={dotX} cy={ROUTE_DOT.cy - 6.5} r="2.6" />
      </g>
    </Shape>
  );
}

export function AnswerShape() {
  return (
    <Shape>
      <rect
        data-part="card"
        className="fr5-fill-ink"
        x={CARD.x}
        y={CARD.y}
        width={CARD.w}
        height={CARD.h}
        rx={CARD.rx}
      />
      {ANSWER_LINES.map((line) => (
        <rect
          key={line.y}
          data-part="line"
          data-w={line.w}
          className="fr5-bar fr5-fill-cream"
          x="48"
          y={line.y}
          width={line.w}
          height="10"
          rx="5"
        />
      ))}
    </Shape>
  );
}

export function ReceiptShape({ rest }: { rest: boolean }) {
  return (
    <Shape>
      <rect
        data-part="rcard"
        className="fr5-fill-cream"
        x={CARD.x}
        y={CARD.y}
        width={CARD.w}
        height={CARD.h}
        rx={CARD.rx}
      />
      <g data-part="mark" className="fr5-mark">
        {markSpokes.map((spoke, i) => (
          <line
            key={i}
            x1={spoke.x1}
            y1={spoke.y1}
            x2={spoke.x2}
            y2={spoke.y2}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        ))}
      </g>
      <g data-part="rows" className={rest ? 'fr5-rows' : 'fr5-rows fr5-rows--film'}>
        {RECEIPT_ROWS.map((row) => (
          <rect
            key={row.y}
            className="fr5-fill-ink"
            x="48"
            y={row.y}
            width={row.w}
            height="8"
            rx="4"
          />
        ))}
      </g>
    </Shape>
  );
}

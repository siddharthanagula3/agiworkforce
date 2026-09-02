import type { CSSProperties } from 'react';

const SPOKE_COUNT = 12;
const INNER_R = 4.6;
const OUTER_R = 9;
const STROKE_W = 1.5;

const SPOKES = Array.from({ length: SPOKE_COUNT }, (_, i) => {
  const angle = (i * 360) / SPOKE_COUNT;
  const rad = (angle * Math.PI) / 180;
  const round = (value: number) => Number(value.toFixed(6));
  return {
    x1: round(12 + INNER_R * Math.sin(rad)),
    y1: round(12 - INNER_R * Math.cos(rad)),
    x2: round(12 + OUTER_R * Math.sin(rad)),
    y2: round(12 - OUTER_R * Math.cos(rad)),
  };
});

interface AgiMarkProps {
  size?: number;
  mono?: boolean;
  spinning?: boolean;
  accent?: string;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}

export function AgiMark({
  size = 24,
  mono = false,
  spinning = false,
  accent = 'var(--agi-amber, currentColor)',
  ariaLabel,
  className,
  style,
}: AgiMarkProps) {
  const role = ariaLabel ? 'img' : 'presentation';
  const composedStyle: CSSProperties = {
    ...(spinning ? { animation: 'agi-mark-spin 3s linear infinite' } : {}),
    ...style,
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role={role}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      focusable="false"
      className={className}
      style={composedStyle}
    >
      {SPOKES.map((spoke, idx) => {
        const isAccent = !mono && idx === 0;
        return (
          <line
            key={idx}
            x1={spoke.x1}
            y1={spoke.y1}
            x2={spoke.x2}
            y2={spoke.y2}
            stroke={isAccent ? accent : 'currentColor'}
            strokeWidth={STROKE_W}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

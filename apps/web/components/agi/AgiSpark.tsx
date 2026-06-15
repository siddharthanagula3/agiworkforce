/**
 * AgiSpark — the AGI "spark" brand glyph used in the chat empty-state hero.
 *
 * A clean four-point sparkle (concave star) in the brand amber, with a small
 * dot accent at the lower-left and a tiny plus accent at the upper-right —
 * matching the founder-supplied AGI mark. This is intentionally distinct from
 * the twelve-spoke `AgiMark` (the router/loading symbol), which reads as a
 * spinner when shown static and is wrong for a hero brand mark.
 *
 * Colors come from the brand amber token with sensible fallbacks; no inline
 * hex beyond the token fallback.
 */
import type { CSSProperties } from 'react';

interface AgiSparkProps {
  size?: number;
  /** Accent color for the mark. Defaults to the brand amber token. */
  color?: string;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}

export function AgiSpark({
  size = 30,
  color = 'var(--agi-amber, var(--chat-accent-primary, #C8892A))',
  className,
  style,
  ariaLabel,
}: AgiSparkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={ariaLabel ? 'img' : 'presentation'}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      className={className}
      style={style}
    >
      {/* Main four-point sparkle, centered slightly low to leave room for accents */}
      <path
        d="M17 5
           C 17.7 11.6, 20.4 14.3, 27 15
           C 20.4 15.7, 17.7 18.4, 17 25
           C 16.3 18.4, 13.6 15.7, 7 15
           C 13.6 14.3, 16.3 11.6, 17 5 Z"
        fill={color}
      />
      {/* Lower-left dot accent */}
      <circle cx="7.5" cy="24.5" r="2.1" fill={color} />
      {/* Upper-right plus accent */}
      <path
        d="M25 5.5 V10.5 M22.5 8 H27.5"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default AgiSpark;

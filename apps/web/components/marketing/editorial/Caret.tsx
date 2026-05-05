'use client';

/**
 * Blinking amber block caret.
 * 1ch wide x 1.1em tall; blinks at 1.06s via caret-blink keyframe.
 * Respects prefers-reduced-motion: no blink when reduced.
 */
export function Caret(): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className={[
        'inline-block',
        'w-[1ch] h-[1.1em]',
        'bg-[var(--color-rule)]',
        'align-text-bottom',
        // motion-safe: blink; motion-reduce: solid
        'motion-safe:animate-[caret-blink_1.06s_step-end_infinite]',
      ].join(' ')}
    />
  );
}

// Force React import for 'use client' files in JSX transform mode
import React from 'react';

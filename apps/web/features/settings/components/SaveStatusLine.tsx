'use client';

import type { CSSProperties, ReactNode } from 'react';

export interface SaveStatusLineProps {
  failed: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * The one line a settings section reports a save through. A failure was drawn
 * in the same muted colour and announced with the same politeness as "Saved",
 * so the two were indistinguishable.
 */
export function SaveStatusLine({ failed, children, className, style }: SaveStatusLineProps) {
  return (
    <p
      role={failed ? 'alert' : 'status'}
      className={className}
      style={failed ? { ...style, color: 'var(--settings-destructive-text)' } : style}
    >
      {children}
    </p>
  );
}

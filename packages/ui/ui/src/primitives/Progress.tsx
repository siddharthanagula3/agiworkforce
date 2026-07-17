'use client';

import * as React from 'react';
import { cn } from '../cn';

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
  indicatorClassName?: string;
  ref?: React.Ref<HTMLDivElement>;
}

// React 19 ref-as-prop pattern - no forwardRef needed
//
// Drift resolution (web vs desktop): web is canonical on both counts desktop
// had dropped — (1) ARIA progressbar semantics (role/aria-valuenow/min/max) so
// screen readers announce this as a progress indicator, and (2) a `max > 0`
// guard on the percentage calc so `max={0}` degrades to 0% instead of
// dividing by zero into `NaN` (which desktop rendered as `width: NaN%`).
function Progress({
  className,
  value = 0,
  max = 100,
  indicatorClassName,
  ref,
  ...props
}: ProgressProps) {
  const percentage = max > 0 ? Math.min(Math.max((value / max) * 100, 0), 100) : 0;

  return (
    <div
      ref={ref}
      role="progressbar"
      aria-valuenow={percentage}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-secondary', className)}
      {...props}
    >
      <div
        className={cn(
          'h-full bg-primary transition-all duration-300 ease-in-out',
          indicatorClassName,
        )}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

Progress.displayName = 'Progress';

export { Progress };

'use client';

import * as React from 'react';
import { cn } from '../cn';

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
  indicatorClassName?: string;
  ref?: React.Ref<HTMLDivElement>;
}

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

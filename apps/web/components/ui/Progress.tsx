'use client';

import * as React from 'react';

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
  indicatorClassName?: string;
  ref?: React.Ref<HTMLDivElement>;
}

// React 19 ref-as-prop pattern - no forwardRef needed
function Progress({
  className = '',
  value = 0,
  max = 100,
  indicatorClassName = '',
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
      className={`relative h-2 w-full overflow-hidden rounded-full bg-secondary ${className}`}
      {...props}
    >
      <div
        className={`h-full bg-primary transition-all duration-300 ease-in-out ${indicatorClassName}`}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

Progress.displayName = 'Progress';

export { Progress };

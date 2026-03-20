import * as React from 'react';
import { cn } from '../../lib/utils';

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
  indicatorClassName?: string;
  ref?: React.Ref<HTMLDivElement>;
}

// React 19 ref-as-prop pattern - no forwardRef needed
function Progress({
  className,
  value = 0,
  max = 100,
  indicatorClassName,
  ref,
  ...props
}: ProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  return (
    <div
      ref={ref}
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

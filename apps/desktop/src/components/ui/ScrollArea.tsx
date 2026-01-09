import * as React from 'react';
import { cn } from '../../lib/utils';

// Simple native ScrollArea to avoid React 19 + Radix UI compatibility issues
interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  ref?: React.Ref<HTMLDivElement>;
}

function ScrollArea({ className, children, ref, ...props }: ScrollAreaProps) {
  return (
    <div
      ref={ref}
      className={cn(
        'relative overflow-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border hover:scrollbar-thumb-muted-foreground/50',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
ScrollArea.displayName = 'ScrollArea';

interface ScrollBarProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'vertical' | 'horizontal';
  ref?: React.Ref<HTMLDivElement>;
}

function ScrollBar(_props: ScrollBarProps) {
  // This is now a no-op since we're using native scrollbars
  // Kept for API compatibility
  return null;
}
ScrollBar.displayName = 'ScrollBar';

export { ScrollArea, ScrollBar };

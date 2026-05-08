import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface ScrollAreaProps {
  children: ReactNode;
  className?: string;
}

export function ScrollArea({ children, className }: ScrollAreaProps) {
  return <div className={cn('overflow-y-auto', className)}>{children}</div>;
}

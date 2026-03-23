import type { ReactNode } from 'react';

interface TooltipProps {
  content: string;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

export function Tooltip({ children }: TooltipProps) {
  // Minimal stub -- wraps children without tooltip behavior
  return <>{children}</>;
}

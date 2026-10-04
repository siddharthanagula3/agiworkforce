import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@shared/utils/cn';

export const PANE_TITLE_CLASS = 'text-h1 text-foreground';

export function PaneTitle({ className, ...props }: ComponentPropsWithoutRef<'h1'>) {
  return <h1 className={cn(PANE_TITLE_CLASS, className)} {...props} />;
}

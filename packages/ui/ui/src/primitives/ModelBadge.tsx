'use client';

import * as React from 'react';
import { cn } from '../cn';

export interface ModelBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  label: string;
}

function ModelBadge({ label, className, ...props }: ModelBadgeProps) {
  return (
    <span
      data-model-badge=""
      title={label}
      className={cn(
        'inline-flex max-w-full min-w-0 items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground',
        className,
      )}
      {...props}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}
ModelBadge.displayName = 'ModelBadge';

export { ModelBadge };

'use client';

/**
 * Drift resolution: desktop had dropped `role="status"` and the visually-hidden
 * `<span className="sr-only">Loading...</span>` that web renders inside the
 * spinner div. Resolved toward web — the sr-only text and role="status" are real
 * accessibility semantics (screen reader announcement that content is loading);
 * desktop's simplification was almost certainly an accidental regression.
 */
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../cn';

const spinnerVariants = cva(
  'animate-spin rounded-full border-2 border-current border-t-transparent',
  {
    variants: {
      size: {
        sm: 'h-4 w-4',
        default: 'h-6 w-6',
        lg: 'h-8 w-8',
        xl: 'h-12 w-12',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
);

export interface SpinnerProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof spinnerVariants> {}

function Spinner({ className, size, ...props }: SpinnerProps) {
  return (
    <div role="status" className={cn(spinnerVariants({ size }), className)} {...props}>
      <span className="sr-only">Loading...</span>
    </div>
  );
}

export { Spinner, spinnerVariants };

'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../cn';

const searchInputVariants = cva(
  'w-full rounded-lg border border-border bg-background pr-3 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      size: {
        sm: 'h-8 pl-8 text-xs',
        default: 'h-10 pl-9 text-sm',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
);

const ICON_POSITION = {
  sm: 'left-2.5 size-3.5',
  default: 'left-3 size-4',
} as const;

export interface SearchInputProps
  extends
    Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'>,
    VariantProps<typeof searchInputVariants> {
  'aria-label': string;
  containerClassName?: string;
  ref?: React.Ref<HTMLInputElement>;
}

function SearchInput({ className, containerClassName, size, ref, ...props }: SearchInputProps) {
  return (
    <div className={cn('relative', containerClassName)}>
      <Search
        aria-hidden
        className={cn(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground',
          ICON_POSITION[size ?? 'default'],
        )}
      />
      <input
        ref={ref}
        type="search"
        className={cn(searchInputVariants({ size }), className)}
        {...props}
      />
    </div>
  );
}
SearchInput.displayName = 'SearchInput';

export { SearchInput, searchInputVariants };

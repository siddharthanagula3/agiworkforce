'use client';

import * as React from 'react';
import { cn } from '../cn';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedControlOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  'aria-label': string;
  className?: string;
}

const STEP_BY_KEY: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  'aria-label': ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  const buttonsRef = React.useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = STEP_BY_KEY[event.key];
    let next: number | null = null;
    if (step !== undefined) next = (index + step + options.length) % options.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    if (next === null) return;
    event.preventDefault();
    buttonsRef.current[next]?.focus();
  };

  return (
    <div role="group" aria-label={ariaLabel} className={cn('flex items-center gap-2', className)}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              buttonsRef.current[index] = node;
            }}
            type="button"
            aria-pressed={selected}
            onClick={() => onValueChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'min-h-6 rounded-full border px-3 py-1 text-xs font-medium transition-colors pointer-coarse:min-h-11',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              selected
                ? 'border-foreground bg-accent text-accent-foreground'
                : 'border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

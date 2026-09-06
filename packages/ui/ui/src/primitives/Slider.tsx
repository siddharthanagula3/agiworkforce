'use client';

import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '../cn';

interface SliderProps extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  valueLabel?: string;
  thumbAriaLabel?: string;
  trackClassName?: string;
  rangeClassName?: string;
  thumbClassName?: string;
  markClassName?: string;
  marks?: number[];
  markInset?: string;
  ref?: React.Ref<React.ElementRef<typeof SliderPrimitive.Root>>;
}

const FULL_RANGE_PERCENT = 100;

function markOffset(mark: number, min: number, max: number): string {
  const span = max - min;
  const ratio = span > 0 ? (mark - min) / span : 0;
  return `${ratio * FULL_RANGE_PERCENT}%`;
}

function Slider({
  className,
  valueLabel,
  thumbAriaLabel = 'Slider thumb',
  trackClassName,
  rangeClassName,
  thumbClassName,
  markClassName,
  marks,
  markInset,
  ref,
  min = 0,
  max = 100,
  value,
  defaultValue,
  ...props
}: SliderProps) {
  const currentValue = value?.[0] ?? defaultValue?.[0];
  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn('relative flex w-full touch-none select-none items-center', className)}
      min={min}
      max={max}
      value={value}
      defaultValue={defaultValue}
      {...props}
    >
      <SliderPrimitive.Track
        className={cn(
          'relative h-2 w-full grow overflow-hidden rounded-full bg-secondary',
          trackClassName,
        )}
      >
        <SliderPrimitive.Range className={cn('absolute h-full bg-primary', rangeClassName)} />
        {marks && marks.length > 0 && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0"
            style={{ left: markInset, right: markInset }}
          >
            {marks.map((mark) => (
              <span
                key={mark}
                className={cn(
                  'absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background/70',
                  markClassName,
                )}
                style={{ left: markOffset(mark, min, max) }}
              />
            ))}
          </span>
        )}
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={thumbAriaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={currentValue}
        aria-valuetext={valueLabel}
        className={cn(
          'block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
          thumbClassName,
        )}
      />
    </SliderPrimitive.Root>
  );
}
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };

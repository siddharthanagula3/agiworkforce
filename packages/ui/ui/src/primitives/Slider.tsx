'use client';

import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '../cn';

/**
 * Drift resolution: merged both real differences rather than picking one side.
 * - `aria-label="Slider thumb"` (desktop) is a real accessibility fix — web's thumb
 *   had no accessible name at all. Ported forward.
 * - Thumb border color: kept web's solid `border-primary` over desktop's
 *   `border-primary/50`. No comment or design-token rationale for the reduced
 *   opacity was found on desktop; it looks like an unrelated, accidental restyle
 *   that rode along with the aria-label fix rather than a deliberate change.
 */
// React 19 ref-as-prop pattern - no forwardRef needed
interface SliderProps extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  /**
   * Human-readable description of the current value, announced by screen
   * readers via `aria-valuetext` on the thumb. Additive and opt-in.
   */
  valueLabel?: string;
  /** Accessible name for the slider thumb. Defaults to a generic label. */
  thumbAriaLabel?: string;
  ref?: React.Ref<React.ElementRef<typeof SliderPrimitive.Root>>;
}

function Slider({
  className,
  valueLabel,
  thumbAriaLabel = 'Slider thumb',
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
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={thumbAriaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={currentValue}
        aria-valuetext={valueLabel}
        className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
      />
    </SliderPrimitive.Root>
  );
}
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };

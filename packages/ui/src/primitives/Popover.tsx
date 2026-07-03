/**
 * Drift resolution: classified 'drifted'. Web and desktop bodies are otherwise
 * identical; the only difference is the z-index. Desktop had migrated to the
 * `--z-sticky` token (100, from apps/desktop's globals.css), which is *lower*
 * than the `--z-modal` token (300) that Dialog migrated to — inverting the
 * "popover renders above an open dialog" relationship both web (hardcoded
 * `z-[100]` vs Dialog's `z-50`) and pre-migration desktop relied on for
 * comboboxes/selects opened from inside a modal.
 *
 * Fixed here by giving Popover a fallback numeric value *above* Dialog/AlertDialog's
 * `--z-modal` fallback (300): `z-[var(--z-popover,350)]`. This is a new token name
 * (not one of desktop's existing five) chosen deliberately rather than reusing
 * `--z-sticky`, because `--z-sticky`'s existing value (100) is the actual bug —
 * propagating it forward would keep popovers-in-dialogs broken. The literal
 * fallback (350) restores the correct ordering (modal 300 < popover 350 <
 * notification 400, see Toast.tsx) without requiring any app's globals.css to
 * define the variable first; an app that does define `--z-popover` later can
 * still override it.
 */
import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '../cn';

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

// React 19 ref-as-prop pattern - no forwardRef needed
interface PopoverContentProps extends React.ComponentPropsWithoutRef<
  typeof PopoverPrimitive.Content
> {
  ref?: React.Ref<React.ElementRef<typeof PopoverPrimitive.Content>>;
}

function PopoverContent({
  className,
  align = 'center',
  sideOffset = 4,
  ref,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-[var(--z-popover,350)] w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent };

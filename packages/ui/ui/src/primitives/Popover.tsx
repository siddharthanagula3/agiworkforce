'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '../cn';

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

interface PopoverContentProps extends React.ComponentPropsWithoutRef<
  typeof PopoverPrimitive.Content
> {
  ref?: React.Ref<React.ElementRef<typeof PopoverPrimitive.Content>>;
}

function PopoverContent({
  className,
  align = 'center',
  sideOffset = 4,
  collisionPadding = 8,
  ref,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          'z-[var(--z-popover,350)] w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          // Matches DropdownMenuContent: content taller than the space beside
          // its trigger scrolls inside the popover instead of rendering past
          // the top of the viewport, where it cannot be scrolled back into view.
          'max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overflow-x-hidden',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent };

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '../cn';

/**
 * Classified 'identical' in the source audit (web/desktop only differed by
 * mechanical 'use client' + import path) — but both copies hardcode `z-50`,
 * which the audit flagged as a latent stacking risk given desktop's separate
 * `--z-modal` (300) token migration (see Dialog.tsx/AlertDialog.tsx in this
 * package, which already moved to `z-[var(--z-modal,300)]`). A tooltip must
 * stay visible even when triggered from inside an open Dialog/AlertDialog, so
 * a plain `z-50` here would render it behind that overlay once an app wires
 * `--z-modal`. Bumped to `z-[var(--z-tooltip,350)]` — same "named token with a
 * numeric fallback" pattern Dialog/AlertDialog use, placed one tier above
 * `--z-modal` (300) and below `--z-notification` (400) on desktop's existing
 * scale, so it works correctly today (via the fallback) even in apps that
 * don't yet define `--z-tooltip`. Note: Select/DropdownMenu/ContextMenu/
 * HoverCard in this package still hardcode `z-50` and have the same latent
 * risk — out of scope here since those files aren't part of this batch.
 */
const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

// React 19 ref-as-prop pattern - no forwardRef needed
interface TooltipContentProps extends React.ComponentPropsWithoutRef<
  typeof TooltipPrimitive.Content
> {
  ref?: React.Ref<React.ElementRef<typeof TooltipPrimitive.Content>>;
}

function TooltipContent({ className, sideOffset = 4, ref, ...props }: TooltipContentProps) {
  return (
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-[var(--z-tooltip,350)] overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        className,
      )}
      {...props}
    />
  );
}
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };

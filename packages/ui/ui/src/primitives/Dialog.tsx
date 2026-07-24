'use client';

/**
 * Drift resolution: classified 'drifted' — biggest divergence in the batch,
 * combining an API regression, a visual regression, and a stacking-order bug.
 * Resolved as a deliberate merge rather than picking one side:
 *
 * 1. API — kept web's richer `DialogContent` surface: `closeLabel` (customizable
 *    aria-label/sr-only text on the close button) and `overlayProps` (pass-through
 *    props to the overlay). Desktop had silently dropped both; any caller relying on
 *    them would regress. Ported forward so no functionality is lost.
 * 2. Visual — kept web's glassmorphic redesign: viewport-height-clamped content
 *    (`max-h-[calc(100vh-2rem)] overflow-hidden`) with a soft glass backdrop
 *    (`bg-black/70 backdrop-blur-sm` overlay, `bg-background/95 backdrop-blur-xl`
 *    content). Desktop's plain shadcn defaults have no height clamp, so a tall
 *    dialog can overflow the viewport with no scroll affordance — a real
 *    correctness bug that web's version doesn't have. Also restored web's
 *    `DialogHeader` `pr-10` (keeps long titles clear of the close button) and
 *    `DialogFooter`'s `border-t` divider, both dropped on desktop.
 * 3. Stacking bug — desktop migrated Dialog's z-index to a CSS-variable token
 *    (`--z-modal`, 300 in apps/desktop's globals.css) but companion overlay
 *    components (AlertDialog, Select, DropdownMenu, ContextMenu, HoverCard,
 *    Tooltip) were left hardcoded at `z-50`, and Popover only reached `--z-sticky`
 *    (100) — both below the new modal layer, so those components render behind an
 *    open Dialog. Fixed here by adopting the token *name* `--z-modal` with an
 *    inline numeric fallback (`z-[var(--z-modal,300)]`) so the component works
 *    correctly even in apps (web) that don't yet define the CSS variable, and by
 *    keeping the same fallback value desktop already uses. AlertDialog in this
 *    package is intentionally pinned to the same `--z-modal` layer (see
 *    AlertDialog.tsx) and Popover is intentionally given a fallback *above* modal
 *    (see Popover.tsx) so popovers/comboboxes opened from inside an open Dialog
 *    remain visible — restoring the invariant web already had (modal < popover).
 */
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../cn';

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

// React 19 ref-as-prop pattern - no forwardRef needed
interface DialogOverlayProps extends React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Overlay
> {
  ref?: React.Ref<React.ElementRef<typeof DialogPrimitive.Overlay>>;
  disableAnimation?: boolean;
}

function DialogOverlay({ className, ref, disableAnimation = false, ...props }: DialogOverlayProps) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        'fixed inset-0 z-[var(--z-modal,300)] bg-black/70 backdrop-blur-sm',
        !disableAnimation &&
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  );
}
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

interface DialogContentProps extends React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> {
  ref?: React.Ref<React.ElementRef<typeof DialogPrimitive.Content>>;
  closeLabel?: string;
  /**
   * Hides the built-in close button (e.g. for dialogs that supply their own
   * dismiss affordance). Additive and opt-in: defaults to `false`, so existing
   * callers keep the close button.
   */
  hideCloseButton?: boolean;
  /**
   * Renders the modal immediately without entry/exit keyframes. This is useful
   * for critical native WebView surfaces where a suspended animation frame can
   * otherwise leave the dialog at its invisible first keyframe.
   */
  disableAnimation?: boolean;
  overlayProps?: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay> &
    React.HTMLAttributes<HTMLDivElement> & {
      [key: `data-${string}`]: string | undefined;
    };
}

function DialogContent({
  className,
  children,
  ref,
  closeLabel = 'Close dialog',
  hideCloseButton = false,
  disableAnimation = false,
  overlayProps,
  ...props
}: DialogContentProps) {
  return (
    <DialogPortal>
      <DialogOverlay disableAnimation={disableAnimation} {...overlayProps} />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-[50%] top-[50%] z-[var(--z-modal,300)] grid w-[min(96vw,42rem)] max-h-[calc(100vh-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-hidden rounded-2xl border border-border/70 bg-background/95 p-6 shadow-[0_32px_120px_-32px_rgba(0,0,0,0.65)] backdrop-blur-xl',
          !disableAnimation &&
            'duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
          className,
        )}
        aria-modal="true"
        {...props}
      >
        {children}
        {!hideCloseButton && (
          <DialogPrimitive.Close
            aria-label={closeLabel}
            className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-muted-foreground transition-colors hover:border-border/70 hover:bg-accent hover:text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:pointer-events-none"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{closeLabel}</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}
DialogContent.displayName = DialogPrimitive.Content.displayName;

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col space-y-1.5 pr-10 text-center sm:text-left', className)}
      {...props}
    />
  );
}
DialogHeader.displayName = 'DialogHeader';

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:justify-end sm:space-x-0',
        className,
      )}
      {...props}
    />
  );
}
DialogFooter.displayName = 'DialogFooter';

interface DialogTitleProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title> {
  ref?: React.Ref<React.ElementRef<typeof DialogPrimitive.Title>>;
}

function DialogTitle({ className, ref, ...props }: DialogTitleProps) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  );
}
DialogTitle.displayName = DialogPrimitive.Title.displayName;

interface DialogDescriptionProps extends React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Description
> {
  ref?: React.Ref<React.ElementRef<typeof DialogPrimitive.Description>>;
}

function DialogDescription({ className, ref, ...props }: DialogDescriptionProps) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};

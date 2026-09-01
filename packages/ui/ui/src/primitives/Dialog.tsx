'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../cn';

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

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
  hideCloseButton?: boolean;
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
  onCloseAutoFocus,
  onOpenAutoFocus,
  ...props
}: DialogContentProps) {
  // Radix restores focus to its own DialogTrigger. A controlled dialog - opened
  // from a button somewhere else, which is most of them here - has no trigger to
  // restore to, so Escape dropped focus onto <body> and a keyboard user
  // restarted from the top of the page. Remember what was focused when the
  // dialog opened and put it back.
  // Captured in onOpenAutoFocus, which Radix fires before it moves focus into
  // the content, rather than during the first render. The render-time read is a
  // beat too late for a dialog opened from inside another dialog: measured on
  // the shortcuts dialog inside Settings, Escape produced a single focus event
  // straight to the chat composer's textarea behind the still-open modal.
  // AlertDialog was corrected the same way for the same reason.
  const openerRef = React.useRef<HTMLElement | null>(null);

  const captureOpener = React.useCallback(
    (event: Event) => {
      const active = document.activeElement;
      openerRef.current = active instanceof HTMLElement ? active : null;
      onOpenAutoFocus?.(event as never);
    },
    [onOpenAutoFocus],
  );

  const restoreFocus = React.useCallback(
    (event: Event) => {
      onCloseAutoFocus?.(event);
      if (event.defaultPrevented) return;
      const opener = openerRef.current;
      if (opener && document.contains(opener)) {
        event.preventDefault();
        opener.focus();
      }
    },
    [onCloseAutoFocus],
  );

  return (
    <DialogPortal>
      <DialogOverlay disableAnimation={disableAnimation} {...overlayProps} />
      <DialogPrimitive.Content
        ref={ref}
        // The height cap without a scroll path is what put a dialog's own
        // actions outside it: at 667x375 the feedback dialog ended at y=359
        // while Cancel and Send sat at y=462-502, and a wheel over the dialog
        // moved nothing. Scrolling the content keeps every control reachable;
        // the x axis stays hidden so the rounded corners still clip.
        className={cn(
          'fixed left-[50%] top-[50%] z-[var(--z-modal,300)] grid w-[min(96vw,42rem)] max-h-[calc(100vh-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto overflow-x-hidden overscroll-contain rounded-2xl border border-border/70 bg-background/95 p-6 shadow-[0_32px_120px_-32px_rgba(0,0,0,0.65)] backdrop-blur-xl',
          !disableAnimation &&
            'duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
          className,
        )}
        aria-modal="true"
        onOpenAutoFocus={captureOpener}
        onCloseAutoFocus={restoreFocus}
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

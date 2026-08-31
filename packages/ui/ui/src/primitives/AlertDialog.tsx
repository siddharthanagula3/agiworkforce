'use client';

import * as React from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { cn } from '../cn';

const AlertDialog = AlertDialogPrimitive.Root;

const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

const AlertDialogPortal = AlertDialogPrimitive.Portal;

interface AlertDialogOverlayProps extends React.ComponentPropsWithoutRef<
  typeof AlertDialogPrimitive.Overlay
> {
  ref?: React.Ref<React.ElementRef<typeof AlertDialogPrimitive.Overlay>>;
}

function AlertDialogOverlay({ className, ref, ...props }: AlertDialogOverlayProps) {
  return (
    <AlertDialogPrimitive.Overlay
      className={cn(
        'fixed inset-0 z-[var(--z-modal,300)] bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
      ref={ref}
    />
  );
}
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName;

interface AlertDialogContentProps extends React.ComponentPropsWithoutRef<
  typeof AlertDialogPrimitive.Content
> {
  ref?: React.Ref<React.ElementRef<typeof AlertDialogPrimitive.Content>>;
}

function AlertDialogContent({ className, ref, ...props }: AlertDialogContentProps) {
  // The same two things DialogContent already does, which this sibling was
  // missing. An alert dialog is the destructive-confirmation surface, so losing
  // your place on close costs more here than anywhere: measured on the delete
  // account confirmation, Escape dropped focus onto <body> while the settings
  // modal it was opened from stayed open behind it.
  // Captured in onOpenAutoFocus, which Radix fires before it moves focus into
  // the content - at that moment document.activeElement is still whatever
  // opened this. Reading it during the first render is a beat too late here:
  // measured on the delete-account confirmation, that path left focus on <body>
  // after close while the settings modal it came from stayed open, so a
  // keyboard reader was dropped out of the modal entirely.
  const openerRef = React.useRef<HTMLElement | null>(null);

  const captureOpener = React.useCallback((event: Event) => {
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement ? active : null;
    props.onOpenAutoFocus?.(event as never);
  }, []);

  const restoreFocus = React.useCallback((event: Event) => {
    if (event.defaultPrevented) return;
    const opener = openerRef.current;
    if (opener && document.contains(opener)) {
      event.preventDefault();
      opener.focus();
    }
  }, []);

  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        ref={ref}
        aria-modal="true"
        onOpenAutoFocus={captureOpener}
        onCloseAutoFocus={restoreFocus}
        className={cn(
          // The height cap without a scroll path is what put a dialog's own
          // actions outside it: at 667x375 the feedback dialog ended at y=359
          // while Cancel and Send sat at y=462-502, and a wheel over the dialog
          // moved nothing. Scrolling the content keeps every control reachable;
          // the x axis stays hidden so the rounded corners still clip.
          'fixed left-[50%] top-[50%] z-[var(--z-modal,300)] grid w-[min(96vw,36rem)] max-h-[calc(100vh-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto overflow-x-hidden overscroll-contain rounded-2xl border border-border/70 bg-background/95 p-6 shadow-[0_32px_120px_-32px_rgba(0,0,0,0.65)] backdrop-blur-xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
          className,
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
}
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName;

function AlertDialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex flex-col space-y-2 text-center sm:text-left', className)} {...props} />
  );
}
AlertDialogHeader.displayName = 'AlertDialogHeader';

function AlertDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
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
AlertDialogFooter.displayName = 'AlertDialogFooter';

interface AlertDialogTitleProps extends React.ComponentPropsWithoutRef<
  typeof AlertDialogPrimitive.Title
> {
  ref?: React.Ref<React.ElementRef<typeof AlertDialogPrimitive.Title>>;
}

function AlertDialogTitle({ className, ref, ...props }: AlertDialogTitleProps) {
  return (
    <AlertDialogPrimitive.Title
      ref={ref}
      className={cn('text-lg font-semibold', className)}
      {...props}
    />
  );
}
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName;

interface AlertDialogDescriptionProps extends React.ComponentPropsWithoutRef<
  typeof AlertDialogPrimitive.Description
> {
  ref?: React.Ref<React.ElementRef<typeof AlertDialogPrimitive.Description>>;
}

function AlertDialogDescription({ className, ref, ...props }: AlertDialogDescriptionProps) {
  return (
    <AlertDialogPrimitive.Description
      ref={ref}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}
AlertDialogDescription.displayName = AlertDialogPrimitive.Description.displayName;

interface AlertDialogActionProps extends React.ComponentPropsWithoutRef<
  typeof AlertDialogPrimitive.Action
> {
  ref?: React.Ref<React.ElementRef<typeof AlertDialogPrimitive.Action>>;
}

function AlertDialogAction({ className, ref, ...props }: AlertDialogActionProps) {
  return (
    <AlertDialogPrimitive.Action
      ref={ref}
      className={cn(
        'inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName;

interface AlertDialogCancelProps extends React.ComponentPropsWithoutRef<
  typeof AlertDialogPrimitive.Cancel
> {
  ref?: React.Ref<React.ElementRef<typeof AlertDialogPrimitive.Cancel>>;
}

function AlertDialogCancel({ className, ref, ...props }: AlertDialogCancelProps) {
  return (
    <AlertDialogPrimitive.Cancel
      ref={ref}
      className={cn(
        'mt-0 inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-semibold ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName;

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};

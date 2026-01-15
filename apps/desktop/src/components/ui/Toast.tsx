import * as React from 'react';
import * as ToastPrimitives from '@radix-ui/react-toast';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertCircle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

const ToastProvider = ToastPrimitives.Provider;

// React 19 ref-as-prop pattern - no forwardRef needed
interface ToastViewportProps extends React.ComponentPropsWithoutRef<
  typeof ToastPrimitives.Viewport
> {
  ref?: React.Ref<React.ElementRef<typeof ToastPrimitives.Viewport>>;
}

function ToastViewport({ className, ref, ...props }: ToastViewportProps) {
  return (
    <ToastPrimitives.Viewport
      ref={ref}
      className={cn(
        'fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]',
        className,
      )}
      {...props}
    />
  );
}
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

const toastVariants = cva(
  'group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full',
  {
    variants: {
      variant: {
        default: 'border bg-background text-foreground',
        destructive:
          'destructive group border-destructive bg-destructive text-destructive-foreground',
        success: 'border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-300',
        warning: 'border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300',
        info: 'border-blue-500/50 bg-blue-500/10 text-blue-700 dark:text-blue-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

/** Icon component for toast variants */
const ToastIcon: React.FC<{
  variant?: 'default' | 'destructive' | 'success' | 'warning' | 'info' | null;
}> = ({ variant }) => {
  const iconProps = { className: 'h-5 w-5 shrink-0', 'aria-hidden': true as const };

  switch (variant) {
    case 'success':
      return (
        <CheckCircle2
          {...iconProps}
          className={cn(iconProps.className, 'text-green-600 dark:text-green-400')}
        />
      );
    case 'destructive':
      return <XCircle {...iconProps} className={cn(iconProps.className, 'text-destructive')} />;
    case 'warning':
      return (
        <AlertCircle
          {...iconProps}
          className={cn(iconProps.className, 'text-yellow-600 dark:text-yellow-400')}
        />
      );
    case 'info':
      return (
        <Info
          {...iconProps}
          className={cn(iconProps.className, 'text-blue-600 dark:text-blue-400')}
        />
      );
    default:
      return null;
  }
};

ToastIcon.displayName = 'ToastIcon';

interface ToastProps
  extends
    React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root>,
    VariantProps<typeof toastVariants> {
  ref?: React.Ref<React.ElementRef<typeof ToastPrimitives.Root>>;
}

function Toast({ className, variant, ref, ...props }: ToastProps) {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  );
}
Toast.displayName = ToastPrimitives.Root.displayName;

interface ToastActionProps extends React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action> {
  ref?: React.Ref<React.ElementRef<typeof ToastPrimitives.Action>>;
}

function ToastAction({ className, ref, ...props }: ToastActionProps) {
  return (
    <ToastPrimitives.Action
      ref={ref}
      className={cn(
        'inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 group-[.destructive]:border-muted/40 group-[.destructive]:hover:border-destructive/30 group-[.destructive]:hover:bg-destructive group-[.destructive]:hover:text-destructive-foreground group-[.destructive]:focus:ring-destructive',
        className,
      )}
      {...props}
    />
  );
}
ToastAction.displayName = ToastPrimitives.Action.displayName;

interface ToastCloseProps extends React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close> {
  ref?: React.Ref<React.ElementRef<typeof ToastPrimitives.Close>>;
}

function ToastClose({ className, ref, ...props }: ToastCloseProps) {
  return (
    <ToastPrimitives.Close
      ref={ref}
      className={cn(
        'absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-hidden focus:ring-2 group-hover:opacity-100 group-[.destructive]:text-red-300 group-[.destructive]:hover:text-red-50 group-[.destructive]:focus:ring-red-400 group-[.destructive]:focus:ring-offset-red-600',
        className,
      )}
      toast-close=""
      aria-label="Dismiss notification"
      {...props}
    >
      <X className="h-4 w-4" aria-hidden="true" />
    </ToastPrimitives.Close>
  );
}
ToastClose.displayName = ToastPrimitives.Close.displayName;

interface ToastTitleProps extends React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title> {
  ref?: React.Ref<React.ElementRef<typeof ToastPrimitives.Title>>;
}

function ToastTitle({ className, ref, ...props }: ToastTitleProps) {
  return (
    <ToastPrimitives.Title
      ref={ref}
      className={cn('text-sm font-semibold', className)}
      {...props}
    />
  );
}
ToastTitle.displayName = ToastPrimitives.Title.displayName;

interface ToastDescriptionProps extends React.ComponentPropsWithoutRef<
  typeof ToastPrimitives.Description
> {
  ref?: React.Ref<React.ElementRef<typeof ToastPrimitives.Description>>;
}

function ToastDescription({ className, ref, ...props }: ToastDescriptionProps) {
  return (
    <ToastPrimitives.Description
      ref={ref}
      className={cn('text-sm opacity-90', className)}
      {...props}
    />
  );
}
ToastDescription.displayName = ToastPrimitives.Description.displayName;

type ToastPropsType = React.ComponentPropsWithoutRef<typeof Toast>;

type ToastActionElement = React.ReactElement<typeof ToastAction>;

export {
  type ToastPropsType as ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
  ToastIcon,
};

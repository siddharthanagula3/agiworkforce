'use client';

import * as React from 'react';
import { cn } from '../cn';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'destructive' | 'success' | 'warning';
  ref?: React.Ref<HTMLDivElement>;
}

function Alert({
  className,
  variant = 'default',
  'aria-live': ariaLive,
  'aria-atomic': ariaAtomic = true,
  ref,
  ...props
}: AlertProps) {
  const liveValue = ariaLive ?? (variant === 'destructive' ? 'assertive' : 'polite');
  return (
    <div
      ref={ref}
      role="alert"
      aria-live={liveValue}
      aria-atomic={ariaAtomic}
      className={cn(
        'relative w-full rounded-lg border p-4',
        variant === 'default' && 'bg-background text-foreground',
        variant === 'destructive' &&
          'border-destructive/50 text-danger dark:border-destructive [&>svg]:text-danger',
        variant === 'success' &&
          'border-success-fill/50 text-success-text [&>svg]:text-success-text',
        variant === 'warning' &&
          'border-warning-fill/50 text-warning-text [&>svg]:text-warning-text',
        className,
      )}
      {...props}
    />
  );
}
Alert.displayName = 'Alert';

interface AlertTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  ref?: React.Ref<HTMLParagraphElement>;
}

function AlertTitle({ className, ref, ...props }: AlertTitleProps) {
  return (
    <h5
      ref={ref}
      className={cn('mb-1 font-medium leading-none tracking-tight', className)}
      {...props}
    />
  );
}
AlertTitle.displayName = 'AlertTitle';

interface AlertDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {
  ref?: React.Ref<HTMLParagraphElement>;
}

function AlertDescription({ className, ref, ...props }: AlertDescriptionProps) {
  return <div ref={ref} className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />;
}
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };

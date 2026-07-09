'use client';

import * as React from 'react';
import { cn } from '../cn';

// React 19 ref-as-prop pattern - no forwardRef needed
export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Visual intent. `success` and `warning` are additive values; existing
   * `default` / `destructive` callers are unaffected.
   */
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
  // Destructive alerts interrupt assistive tech (assertive); others announce politely.
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
          'border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive',
        variant === 'success' &&
          'border-green-500/50 text-green-700 dark:text-green-400 dark:border-green-500 [&>svg]:text-green-600',
        variant === 'warning' &&
          'border-yellow-500/50 text-yellow-700 dark:text-yellow-400 dark:border-yellow-500 [&>svg]:text-yellow-600',
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

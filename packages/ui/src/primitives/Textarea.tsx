'use client';

import * as React from 'react';
import { cn } from '../cn';

// React 19 ref-as-prop pattern - no forwardRef needed
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /**
   * Marks the textarea as having a validation error: applies a destructive
   * border / focus ring and sets `aria-invalid`. Additive and opt-in.
   */
  hasError?: boolean;
  /**
   * ID of an element describing this textarea (e.g. an error message). Merged
   * into `aria-describedby` alongside any value the caller already passed.
   */
  errorMessageId?: string;
  ref?: React.Ref<HTMLTextAreaElement>;
}

function Textarea({
  className,
  hasError,
  errorMessageId,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  ref,
  ...props
}: TextareaProps) {
  const describedBy = [ariaDescribedBy, errorMessageId].filter(Boolean).join(' ') || undefined;
  return (
    <textarea
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        hasError && 'border-destructive focus-visible:ring-destructive',
        className,
      )}
      ref={ref}
      aria-invalid={ariaInvalid ?? hasError ?? undefined}
      aria-describedby={describedBy}
      {...props}
    />
  );
}
Textarea.displayName = 'Textarea';

export { Textarea };

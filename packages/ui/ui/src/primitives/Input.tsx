'use client';

import * as React from 'react';
import { cn } from '../cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
  errorMessageId?: string;
  ref?: React.Ref<HTMLInputElement>;
}

function Input({
  className,
  type,
  hasError,
  errorMessageId,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  ref,
  ...props
}: InputProps) {
  const describedBy = [ariaDescribedBy, errorMessageId].filter(Boolean).join(' ') || undefined;
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
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
Input.displayName = 'Input';

export { Input };

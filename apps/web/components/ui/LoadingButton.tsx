'use client';

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from './Button';

export interface LoadingButtonProps extends ButtonProps {
  /** Whether the button is in a loading state */
  loading?: boolean;
  /** Text to show when loading (defaults to children) */
  loadingText?: string;
  /** Custom loading spinner class */
  spinnerClassName?: string;
  /** Position of the spinner relative to text */
  spinnerPosition?: 'left' | 'right';
}

/**
 * A button component with built-in loading state support.
 *
 * Features:
 * - Loading spinner with smooth transition
 * - Prevents double-clicks while loading
 * - Accessible loading state announcement
 * - Optional loading text
 *
 * Usage:
 * ```tsx
 * <LoadingButton
 *   loading={isSubmitting}
 *   loadingText="Saving..."
 *   onClick={handleSubmit}
 * >
 *   Save Changes
 * </LoadingButton>
 * ```
 */
function LoadingButton({
  children,
  loading = false,
  loadingText,
  spinnerClassName,
  spinnerPosition = 'left',
  disabled,
  className,
  ...props
}: LoadingButtonProps) {
  const isDisabled = disabled || loading;

  const spinner = (
    <Loader2 className={cn('h-4 w-4 animate-spin', spinnerClassName)} aria-hidden="true" />
  );

  const content = loading ? (loadingText ?? children) : children;

  return (
    <Button
      {...props}
      disabled={isDisabled}
      className={cn(className)}
      aria-busy={loading}
      aria-disabled={isDisabled}
    >
      {loading && spinnerPosition === 'left' && spinner}
      <span className={cn(loading && spinnerPosition === 'left' && 'ml-2')}>{content}</span>
      {loading && spinnerPosition === 'right' && spinner}
      {loading && (
        <span className="sr-only" aria-live="polite">
          {loadingText ?? 'Loading, please wait'}
        </span>
      )}
    </Button>
  );
}

LoadingButton.displayName = 'LoadingButton';

export { LoadingButton };

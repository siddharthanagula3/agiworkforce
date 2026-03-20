'use client';

/**
 * ErrorCard — consistent error state with optional retry button.
 *
 * Matches the glassmorphism card style used across the web dashboard.
 *
 * Usage:
 *   <ErrorCard
 *     title="Failed to load data"
 *     description={error.message}
 *     onRetry={() => void fetchData()}
 *   />
 */

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@shared/ui/button';

interface ErrorCardProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorCard({
  title = 'Something went wrong',
  description,
  onRetry,
  retryLabel = 'Try again',
  className,
}: ErrorCardProps) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center gap-3 rounded-xl py-10 px-6 text-center',
        'border border-red-500/20 bg-red-500/[0.04] backdrop-blur-xl',
        className ?? '',
      ].join(' ')}
      role="alert"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10">
        <AlertTriangle className="h-5 w-5 text-red-400" />
      </div>
      <div className="max-w-xs space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="text-xs text-muted-foreground/70">{description}</p>}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

export default ErrorCard;

'use client';

/**
 * ErrorMessage - Contextual error display for failed AI responses.
 *
 * Shows a styled error card that adapts to the error category:
 * - Network error   : connectivity icon + generic retry message
 * - Rate limit      : clock icon + countdown timer ("Try again in Xs")
 * - Auth error      : lock icon + "Set API key" link
 * - Server error    : server icon + generic retry message
 * - Generic error   : alert icon + raw message
 *
 * Includes a "Retry" button that calls the parent onRetry callback.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Clock, KeyRound, RefreshCw, ServerCrash, WifiOff } from 'lucide-react';
import { cn } from '@shared/lib/utils';

// ============================================================================
// Error classification
// ============================================================================

export type ErrorCategory = 'network' | 'rate_limit' | 'auth' | 'server' | 'generic';

/**
 * Classify an error message into a display category.
 */
export function classifyError(message: string): ErrorCategory {
  const lower = message.toLowerCase();
  if (
    lower.includes('network') ||
    lower.includes('failed to fetch') ||
    lower.includes('econnreset') ||
    lower.includes('enotfound') ||
    lower.includes('offline')
  ) {
    return 'network';
  }
  if (lower.includes('rate limit') || lower.includes('429') || lower.includes('too many')) {
    return 'rate_limit';
  }
  if (
    lower.includes('unauthorized') ||
    lower.includes('401') ||
    lower.includes('authentication') ||
    lower.includes('api key') ||
    lower.includes('sign in')
  ) {
    return 'auth';
  }
  if (
    lower.includes('500') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('server error') ||
    lower.includes('service unavailable')
  ) {
    return 'server';
  }
  return 'generic';
}

// ============================================================================
// Display config per category
// ============================================================================

interface CategoryConfig {
  icon: React.ElementType;
  title: string;
  borderColor: string;
  iconColor: string;
  bgColor: string;
}

const CATEGORY_CONFIG: Record<ErrorCategory, CategoryConfig> = {
  network: {
    icon: WifiOff,
    title: 'Connection lost',
    borderColor: 'border-amber-500/40',
    iconColor: 'text-amber-500',
    bgColor: 'bg-amber-500/5',
  },
  rate_limit: {
    icon: Clock,
    title: 'Rate limit reached',
    borderColor: 'border-orange-500/40',
    iconColor: 'text-orange-500',
    bgColor: 'bg-orange-500/5',
  },
  auth: {
    icon: KeyRound,
    title: 'Authentication required',
    borderColor: 'border-red-500/40',
    iconColor: 'text-red-500',
    bgColor: 'bg-red-500/5',
  },
  server: {
    icon: ServerCrash,
    title: 'Server error',
    borderColor: 'border-rose-500/40',
    iconColor: 'text-rose-500',
    bgColor: 'bg-rose-500/5',
  },
  generic: {
    icon: AlertCircle,
    title: 'Something went wrong',
    borderColor: 'border-red-500/30',
    iconColor: 'text-red-400',
    bgColor: 'bg-red-500/5',
  },
};

// ============================================================================
// Props
// ============================================================================

export interface ErrorMessageProps {
  /** The raw error message string (e.g. from catch block) */
  message: string;
  /** Called when the user clicks "Retry" */
  onRetry?: () => void;
  /** For rate-limit errors: seconds until the user can retry */
  retryAfterSeconds?: number;
  /** Optional link destination for auth errors (defaults to /settings) */
  apiKeySettingsHref?: string;
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ErrorMessage({
  message,
  onRetry,
  retryAfterSeconds,
  apiKeySettingsHref = '/settings',
  className,
}: ErrorMessageProps) {
  const category = classifyError(message);
  const config = CATEGORY_CONFIG[category];
  const Icon = config.icon;

  // --------------------------------------------------------------------------
  // Rate-limit countdown
  // --------------------------------------------------------------------------
  const [countdown, setCountdown] = useState(retryAfterSeconds ?? 0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (category !== 'rate_limit' || !retryAfterSeconds || retryAfterSeconds <= 0) return;
    setCountdown(retryAfterSeconds);

    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [category, retryAfterSeconds]);

  const isCountingDown = category === 'rate_limit' && countdown > 0;

  // --------------------------------------------------------------------------
  // User-friendly message
  // --------------------------------------------------------------------------
  const friendlyMessage = (() => {
    switch (category) {
      case 'network':
        return 'Please check your internet connection and try again.';
      case 'rate_limit':
        return isCountingDown
          ? `Try again in ${countdown} second${countdown !== 1 ? 's' : ''}.`
          : 'You can try again now.';
      case 'auth':
        return 'Your session may have expired, or the API key is missing.';
      case 'server':
        return 'The server encountered an error. Please try again shortly.';
      default:
        return message;
    }
  })();

  const handleRetry = useCallback(() => {
    if (!isCountingDown && onRetry) onRetry();
  }, [isCountingDown, onRetry]);

  return (
    <div
      className={cn('rounded-xl border px-4 py-3', config.borderColor, config.bgColor, className)}
      role="alert"
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={cn('mt-0.5 shrink-0', config.iconColor)}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>

        {/* Text */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{config.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{friendlyMessage}</p>

          {/* Action row */}
          <div className="mt-2 flex items-center gap-2">
            {/* Retry button */}
            {onRetry && (
              <button
                onClick={handleRetry}
                disabled={isCountingDown}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  isCountingDown
                    ? 'cursor-not-allowed bg-muted/50 text-muted-foreground'
                    : 'bg-foreground/10 text-foreground hover:bg-foreground/20',
                )}
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                Retry
              </button>
            )}

            {/* "Set API key" link for auth errors */}
            {category === 'auth' && (
              <a
                href={apiKeySettingsHref}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
              >
                <KeyRound className="h-3 w-3" aria-hidden="true" />
                Set API key
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

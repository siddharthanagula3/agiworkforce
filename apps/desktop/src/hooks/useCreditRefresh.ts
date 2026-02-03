/**
 * Credit Refresh Hook
 *
 * Periodically refreshes credit balance from the server and updates the account store.
 * Shows warnings when credits are running low to help users know when to top up.
 */

import { useEffect, useCallback, useRef } from 'react';
import { accountApi } from '../api/accountApi';
import { useAccountStore } from '../stores/auth';
import { toast } from 'sonner';

// Refresh interval in milliseconds (30 seconds)
const CREDIT_REFRESH_INTERVAL = 30_000;

// Warning thresholds
const LOW_CREDIT_THRESHOLD_PERCENT = 20; // Warn at 20% remaining
const CRITICAL_CREDIT_THRESHOLD_PERCENT = 5; // Critical at 5% remaining

interface UseCreditRefreshOptions {
  /** Enable automatic periodic refresh */
  autoRefresh?: boolean;
  /** Refresh interval in ms (default: 30000) */
  interval?: number;
  /** Show toast notifications for low credits */
  showWarnings?: boolean;
}

interface CreditRefreshResult {
  /** Manually trigger a credit refresh */
  refreshCredits: () => Promise<void>;
  /** Whether a refresh is in progress */
  isRefreshing: boolean;
  /** Last refresh error, if any */
  error: string | null;
}

export function useCreditRefresh(options: UseCreditRefreshOptions = {}): CreditRefreshResult {
  const { autoRefresh = true, interval = CREDIT_REFRESH_INTERVAL, showWarnings = true } = options;

  const isRefreshingRef = useRef(false);
  const errorRef = useRef<string | null>(null);
  const lastWarningRef = useRef<'low' | 'critical' | null>(null);

  const updateCredits = useAccountStore((state) => state.setAccount);
  const plan = useAccountStore((state) => state.account.plan);

  const refreshCredits = useCallback(async () => {
    // Skip if not on a paid plan (free users don't have credit limits)
    if (!plan || plan === 'free') {
      return;
    }

    // Skip if already refreshing
    if (isRefreshingRef.current) {
      return;
    }

    isRefreshingRef.current = true;
    errorRef.current = null;

    try {
      const creditBalance = await accountApi.fetchCreditBalance();

      // Check if user has credits (both monthly and daily remaining)
      const hasCredits =
        creditBalance.credits.monthly_remaining_cents > 0 &&
        creditBalance.credits.daily_remaining_cents > 0;

      if (hasCredits) {
        // Update the account store with new credit info
        updateCredits({
          credits: {
            allocated_cents: creditBalance.credits.monthly_allocated_cents,
            used_cents: creditBalance.credits.monthly_used_cents,
            remaining_cents: creditBalance.credits.monthly_remaining_cents,
            daily_limit_cents: creditBalance.credits.daily_limit_cents,
            daily_used_cents: creditBalance.credits.daily_used_cents,
            daily_remaining_cents: creditBalance.credits.daily_remaining_cents,
          },
        });

        // Check for low credit warnings
        if (showWarnings && creditBalance.credits.monthly_allocated_cents > 0) {
          const remainingPercent =
            (creditBalance.credits.monthly_remaining_cents /
              creditBalance.credits.monthly_allocated_cents) *
            100;

          // Check daily limits too
          const dailyRemainingPercent =
            creditBalance.credits.daily_limit_cents > 0
              ? (creditBalance.credits.daily_remaining_cents /
                  creditBalance.credits.daily_limit_cents) *
                100
              : 100;

          // Use the lower of the two
          const effectivePercent = Math.min(remainingPercent, dailyRemainingPercent);

          if (effectivePercent <= CRITICAL_CREDIT_THRESHOLD_PERCENT) {
            if (lastWarningRef.current !== 'critical') {
              lastWarningRef.current = 'critical';
              toast.error('Credits almost depleted!', {
                description:
                  'You have less than 5% credits remaining. Please top up your account to continue using AI features.',
                duration: 10000,
                action: {
                  label: 'Upgrade',
                  onClick: () => {
                    window.open('https://agiworkforce.com/pricing', '_blank');
                  },
                },
              });
            }
          } else if (effectivePercent <= LOW_CREDIT_THRESHOLD_PERCENT) {
            if (lastWarningRef.current !== 'low' && lastWarningRef.current !== 'critical') {
              lastWarningRef.current = 'low';
              toast.warning('Credits running low', {
                description: `You have ${Math.round(effectivePercent)}% credits remaining for this period.`,
                duration: 5000,
              });
            }
          } else {
            // Reset warning state when credits are healthy again
            lastWarningRef.current = null;
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to refresh credits';
      errorRef.current = message;
      console.error('[useCreditRefresh] Error refreshing credits:', error);
    } finally {
      isRefreshingRef.current = false;
    }
  }, [plan, updateCredits, showWarnings]);

  // Auto-refresh on interval
  useEffect(() => {
    if (!autoRefresh) {
      return;
    }

    // Initial refresh
    void refreshCredits();

    // Set up interval
    const intervalId = setInterval(() => {
      void refreshCredits();
    }, interval);

    return () => {
      clearInterval(intervalId);
    };
  }, [autoRefresh, interval, refreshCredits]);

  return {
    refreshCredits,
    isRefreshing: isRefreshingRef.current,
    error: errorRef.current,
  };
}

// Track last warning level to avoid duplicate toasts
let lastWarningLevel: 'low' | 'critical' | null = null;

/**
 * Trigger a one-time credit refresh after a message is sent.
 * Updates the UI with fresh credit balance and shows warnings if credits are low.
 */
export async function refreshCreditsAfterMessage(): Promise<void> {
  try {
    const creditBalance = await accountApi.fetchCreditBalance();

    // Check if user has credits (both monthly and daily remaining)
    const hasCredits =
      creditBalance.credits.monthly_remaining_cents > 0 &&
      creditBalance.credits.daily_remaining_cents > 0;

    if (hasCredits) {
      useAccountStore.getState().setAccount({
        credits: {
          allocated_cents: creditBalance.credits.monthly_allocated_cents,
          used_cents: creditBalance.credits.monthly_used_cents,
          remaining_cents: creditBalance.credits.monthly_remaining_cents,
          daily_limit_cents: creditBalance.credits.daily_limit_cents,
          daily_used_cents: creditBalance.credits.daily_used_cents,
          daily_remaining_cents: creditBalance.credits.daily_remaining_cents,
        },
      });

      // Check for low credit warnings
      if (creditBalance.credits.monthly_allocated_cents > 0) {
        const remainingPercent =
          (creditBalance.credits.monthly_remaining_cents /
            creditBalance.credits.monthly_allocated_cents) *
          100;

        // Check daily limits too
        const dailyRemainingPercent =
          creditBalance.credits.daily_limit_cents > 0
            ? (creditBalance.credits.daily_remaining_cents /
                creditBalance.credits.daily_limit_cents) *
              100
            : 100;

        // Use the lower of the two
        const effectivePercent = Math.min(remainingPercent, dailyRemainingPercent);

        if (effectivePercent <= CRITICAL_CREDIT_THRESHOLD_PERCENT) {
          if (lastWarningLevel !== 'critical') {
            lastWarningLevel = 'critical';
            toast.error('Credits almost depleted!', {
              description:
                'You have less than 5% credits remaining. Please top up your account to continue using AI features.',
              duration: 10000,
              action: {
                label: 'Upgrade',
                onClick: () => {
                  window.open('https://agiworkforce.com/pricing', '_blank');
                },
              },
            });
          }
        } else if (effectivePercent <= LOW_CREDIT_THRESHOLD_PERCENT) {
          if (lastWarningLevel !== 'low' && lastWarningLevel !== 'critical') {
            lastWarningLevel = 'low';
            toast.warning('Credits running low', {
              description: `You have ${Math.round(effectivePercent)}% credits remaining for this period.`,
              duration: 5000,
            });
          }
        } else {
          // Reset warning state when credits are healthy again
          lastWarningLevel = null;
        }
      }
    }
  } catch (error) {
    console.error('[refreshCreditsAfterMessage] Error:', error);
  }
}

export default useCreditRefresh;

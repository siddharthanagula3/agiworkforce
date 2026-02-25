'use client';

import { Lock } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/utils/cn';
import { type PlanTier, TIER_RANK, TIER_LABEL } from './tiers';

// Re-export PlanTier for backward compatibility with existing importers
export type { PlanTier } from './tiers';

interface SubscriptionGateProps {
  /** Minimum tier required to access this feature */
  requiredTier: PlanTier;
  /** The user's current plan tier. Pass null/undefined while the plan is still loading. */
  currentTier?: PlanTier | null;
  /** Human-readable feature name shown in the lock message */
  featureName: string;
  /** Content to render when access is granted */
  children: React.ReactNode;
  /** Optional custom class for the locked state wrapper */
  className?: string;
}

/**
 * Wraps content behind a subscription tier check.
 * If the user's tier is below requiredTier, renders a locked upgrade prompt instead.
 * Returns null while the tier is still loading (currentTier is null/undefined) to
 * avoid locking out users prematurely.
 */
export function SubscriptionGate({
  requiredTier,
  currentTier,
  featureName,
  children,
  className,
}: SubscriptionGateProps) {
  // Still loading — render nothing rather than defaulting to 'free' and locking users out
  if (currentTier == null) return null;

  const hasAccess = TIER_RANK[currentTier] >= TIER_RANK[requiredTier];

  if (hasAccess) return <>{children}</>;

  return (
    <LockedState featureName={featureName} requiredTier={requiredTier} className={className} />
  );
}

function LockedState({
  featureName,
  requiredTier,
  className,
}: {
  featureName: string;
  requiredTier: PlanTier;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center',
        className,
      )}
    >
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-zinc-800 mb-4">
        <Lock className="w-5 h-5 text-zinc-400" aria-hidden="true" />
      </div>
      <h3 className="text-lg font-semibold text-zinc-200 mb-2">{featureName}</h3>
      <p className="text-sm text-zinc-400 mb-6 max-w-xs">
        This feature requires the{' '}
        <strong className="text-zinc-200">{TIER_LABEL[requiredTier]}</strong> plan or higher.
      </p>
      <Link
        href="/pricing"
        className="inline-flex items-center gap-2 px-5 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-zinc-200 transition-colors"
      >
        Upgrade Plan
      </Link>
    </div>
  );
}

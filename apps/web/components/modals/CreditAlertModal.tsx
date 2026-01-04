'use client';

import { useState } from 'react';
import { AlertTriangle, Zap, CreditCard, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui';
import { useRouter } from 'next/navigation';

export interface CreditAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  alertType: 'low' | 'exhausted' | 'none';
  currentPlan: string;
  remainingCents: number;
  allocatedCents: number;
  percentageUsed: number;
}

export function CreditAlertModal({
  isOpen,
  onClose,
  alertType,
  currentPlan,
  remainingCents,
  allocatedCents,
  percentageUsed,
}: CreditAlertModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const remainingDollars = (remainingCents / 100).toFixed(2);
  const allocatedDollars = (allocatedCents / 100).toFixed(2);

  const handleUpgrade = () => {
    router.push('/pricing');
    onClose();
  };

  const handleBuyTopUp = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/credit-topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_cents: 10000 }), // $100 top-up
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create checkout');
      }

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Top-up error:', error);
      alert(error instanceof Error ? error.message : 'Failed to initiate top-up');
      setLoading(false);
    }
  };

  const isMaxPlan = currentPlan.toLowerCase() === 'max';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
        {/* Alert Type Indicator */}
        <div className="flex items-center gap-3 mb-4">
          {alertType === 'exhausted' ? (
            <div className="p-3 rounded-full bg-red-500/10">
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
          ) : (
            <div className="p-3 rounded-full bg-amber-500/10">
              <Zap className="h-6 w-6 text-amber-500" />
            </div>
          )}
          <div>
            <h3 className="text-xl font-bold text-white">
              {alertType === 'exhausted' ? 'Credits Depleted' : 'Low Credits Warning'}
            </h3>
            <p className="text-sm text-zinc-400">
              {alertType === 'exhausted'
                ? 'Your AI usage credits have been fully used'
                : `You've used ${percentageUsed.toFixed(0)}% of your monthly credits`}
            </p>
          </div>
        </div>

        {/* Credit Information */}
        <div className="bg-zinc-800/50 rounded-lg p-4 mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-zinc-400">Current Plan</span>
            <span className="font-semibold text-white capitalize">{currentPlan}</span>
          </div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-zinc-400">Monthly Allocation</span>
            <span className="font-semibold text-white">${allocatedDollars}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-zinc-400">Remaining Credits</span>
            <span
              className={`font-semibold ${remainingCents > 0 ? 'text-emerald-400' : 'text-red-400'}`}
            >
              ${remainingDollars}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="mt-4">
            <div className="w-full bg-zinc-700 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all ${
                  percentageUsed >= 100
                    ? 'bg-red-500'
                    : percentageUsed >= 80
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(percentageUsed, 100)}%` }}
              />
            </div>
            <p className="text-xs text-zinc-500 mt-1 text-center">
              {percentageUsed.toFixed(1)}% used
            </p>
          </div>
        </div>

        {/* Recommendations */}
        <div className="space-y-3 mb-6">
          {alertType === 'exhausted' ? (
            <>
              <p className="text-sm text-zinc-300">To continue using AI features, you can:</p>
              {isMaxPlan ? (
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <CreditCard className="h-4 w-4 text-purple-400" />
                    <span className="font-medium text-purple-300">Purchase Additional Credits</span>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Get a one-time $100 credit top-up to continue your AI workflows without
                    interruption.
                  </p>
                </div>
              ) : (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-4 w-4 text-blue-400" />
                    <span className="font-medium text-blue-300">Upgrade Your Plan</span>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Get more monthly credits and unlock advanced features with a higher tier plan.
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-zinc-300">
                You're running low on credits. Consider upgrading to avoid interruptions.
              </p>
              {!isMaxPlan && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-4 w-4 text-blue-400" />
                    <span className="font-medium text-blue-300">Higher Tiers Include</span>
                  </div>
                  <ul className="text-xs text-zinc-400 space-y-1 mt-2">
                    <li>• More monthly API credits</li>
                    <li>• Advanced AI features</li>
                    <li>• Priority support</li>
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          {isMaxPlan && alertType === 'exhausted' ? (
            <>
              <Button
                onClick={onClose}
                variant="outline"
                className="flex-1 border-zinc-700 hover:bg-zinc-800"
              >
                Not Now
              </Button>
              <Button
                onClick={handleBuyTopUp}
                disabled={loading}
                className="flex-1 bg-purple-600 hover:bg-purple-700"
              >
                {loading ? 'Processing...' : 'Buy $100 Credits'}
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={onClose}
                variant="outline"
                className="flex-1 border-zinc-700 hover:bg-zinc-800"
              >
                {alertType === 'exhausted' ? 'Maybe Later' : 'Dismiss'}
              </Button>
              <Button onClick={handleUpgrade} className="flex-1 bg-blue-600 hover:bg-blue-700">
                {alertType === 'exhausted' ? 'Upgrade Plan' : 'View Plans'}
              </Button>
            </>
          )}
        </div>

        {/* Additional Info */}
        <p className="text-xs text-zinc-500 text-center mt-4">
          Credits reset at the start of each billing period
        </p>
      </div>
    </div>
  );
}

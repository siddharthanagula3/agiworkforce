import { useEffect, useState } from 'react';
import { ArrowRight, Lock, Sparkles } from 'lucide-react';
import { Button } from './ui/Button';
import { checkSubscriptionGate, getUpgradeMessage } from '../utils/subscriptionGate';
import { useAccountStore } from '../stores/accountStore';
import { openPricingPage } from '../utils/navigation';
import { supabaseAuth } from '../services/supabaseAuth';

export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const [gateResult, setGateResult] = useState(() => checkSubscriptionGate());
  const account = useAccountStore((state) => state.account);

  useEffect(() => {
    const unsubscribe = supabaseAuth.onAuthStateChange(() => {
      setGateResult(checkSubscriptionGate());
    });

    return unsubscribe;
  }, []);

  if (gateResult.hasAccess) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-zinc-950 p-8">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800">
          <Lock className="h-8 w-8 text-zinc-400" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">Subscription Required</h1>
          <p className="text-zinc-400">
            {gateResult.reason || getUpgradeMessage(gateResult.currentTier)}
          </p>
        </div>

        {gateResult.requiresUpgrade && (
          <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
            <div className="flex items-center justify-center gap-2 text-zinc-300">
              <Sparkles className="h-5 w-5 text-blue-500" />
              <span className="font-medium">Unlock Full Access</span>
            </div>
            <p className="text-sm text-zinc-400">
              Subscribe to Hobby plan or higher to access all features including API key management,
              unlimited automations, and more.
            </p>
            <Button
              onClick={() => void openPricingPage('subscription_required')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              Subscribe Now
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {!gateResult.requiresUpgrade && gateResult.currentStatus === 'past_due' && (
          <div className="space-y-4 rounded-lg border border-amber-800 bg-amber-900/20 p-6">
            <p className="text-sm text-amber-200">
              Your subscription payment failed. Please update your payment method to continue using
              AGI Workforce.
            </p>
            <Button
              onClick={() => void openPricingPage('subscription_required')}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white"
            >
              Update Payment Method
            </Button>
          </div>
        )}

        {!account && (
          <p className="text-sm text-zinc-500">
            Not signed in?{' '}
            <button
              onClick={() => {
                window.location.reload();
              }}
              className="text-blue-400 hover:text-blue-300 underline"
            >
              Sign in
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

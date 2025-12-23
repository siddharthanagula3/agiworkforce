import { ArrowRight, Sparkles, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from './ui/Button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/Dialog';
import { checkSubscriptionGate, getUpgradeMessage } from '../utils/subscriptionGate';
import { openPricingPage } from '../utils/navigation';
import { supabaseAuth } from '../services/supabaseAuth';

interface SubscriptionLockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SubscriptionLockDialog({ open, onOpenChange }: SubscriptionLockDialogProps) {
  const [gateResult, setGateResult] = useState(() => checkSubscriptionGate());

  // Re-check subscription when auth state changes or dialg opens
  useEffect(() => {
    if (open) {
      setGateResult(checkSubscriptionGate());
    }

    const unsubscribe = supabaseAuth.onAuthStateChange(() => {
      setGateResult(checkSubscriptionGate());
    });

    return unsubscribe;
  }, [open]);

  // If user gains access while dialog is open, auto-close it
  useEffect(() => {
    if (open && gateResult.hasAccess) {
      onOpenChange(false);
    }
  }, [gateResult.hasAccess, open, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900">
            <Lock className="h-6 w-6 text-zinc-400" />
          </div>
          <DialogTitle className="text-center text-xl font-bold text-white">
            Subscription Required
          </DialogTitle>
          <DialogDescription className="text-center text-zinc-400">
            {gateResult.reason || getUpgradeMessage(gateResult.currentTier)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {gateResult.requiresUpgrade && (
            <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <div className="flex items-center justify-center gap-2 text-zinc-300">
                <Sparkles className="h-4 w-4 text-blue-500" />
                <span className="font-medium text-sm">Unlock Full Access</span>
              </div>
              <p className="text-xs text-center text-zinc-400">
                Subscribe to Hobby plan or higher to access all features including API key
                management and unlimited automations.
              </p>
            </div>
          )}

          {!gateResult.requiresUpgrade && gateResult.currentStatus === 'past_due' && (
            <div className="space-y-4 rounded-lg border border-amber-800 bg-amber-900/20 p-4">
              <p className="text-xs text-center text-amber-200">
                Your subscription payment failed. Please update your payment method.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {gateResult.requiresUpgrade || gateResult.currentStatus === 'past_due' ? (
            <Button
              onClick={() => void openPricingPage('subscription_required')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              {gateResult.requiresUpgrade ? 'Subscribe Now' : 'Update Payment Method'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={() => {
                window.location.reload();
              }}
              variant="outline"
              className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              Sign In
            </Button>
          )}

          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="w-full text-zinc-500 hover:text-zinc-400"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * BetaInviteCode Component
 *
 * Allows users to enter and redeem beta invite codes.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Ticket, Check, Loader2, ArrowRight, Gift, Percent } from 'lucide-react';
import { waitlistService, type BetaInvite } from '../../services/waitlistService';
import { supabaseAuth } from '../../services/supabaseAuth';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { cn } from '../../lib/utils';

interface BetaInviteCodeProps {
  onSuccess?: (invite: BetaInvite) => void;
  className?: string;
}

export function BetaInviteCode({ onSuccess, className }: BetaInviteCodeProps) {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validatedInvite, setValidatedInvite] = useState<BetaInvite | null>(null);
  const [redeemed, setRedeemed] = useState(false);

  const handleValidate = async () => {
    if (!code.trim()) {
      setError('Please enter an invite code');
      return;
    }

    setIsLoading(true);
    setError(null);
    setValidatedInvite(null);

    const result = await waitlistService.validateInviteCode(code);

    if (result.valid && result.invite) {
      setValidatedInvite(result.invite);
    } else {
      setError(result.error || 'Invalid invite code');
    }

    setIsLoading(false);
  };

  const handleRedeem = async () => {
    if (!validatedInvite) return;

    const user = supabaseAuth.getUser();
    if (!user) {
      setError('Please sign in to redeem your invite code');
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await waitlistService.redeemInviteCode(code, user.id);

    if (result.success) {
      setRedeemed(true);
      onSuccess?.(validatedInvite);

      // Refresh user data to reflect new subscription
      await supabaseAuth.refreshUserData();
    } else {
      setError(result.error || 'Failed to redeem invite');
    }

    setIsLoading(false);
  };

  const getPlanColor = (tier: string) => {
    switch (tier) {
      case 'enterprise':
        return 'from-amber-500 to-orange-500';
      case 'pro':
        return 'from-violet-500 to-fuchsia-500';
      default:
        return 'from-gray-500 to-gray-600';
    }
  };

  if (redeemed && validatedInvite) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn('text-center p-6', className)}
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.1 }}
          className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 mb-4"
        >
          <Check className="w-8 h-8 text-green-500" />
        </motion.div>

        <h3 className="text-xl font-bold mb-2">Welcome to the Beta!</h3>
        <p className="text-muted-foreground mb-4">
          Your{' '}
          {validatedInvite.planTier.charAt(0).toUpperCase() + validatedInvite.planTier.slice(1)}{' '}
          plan is now active.
        </p>

        <div className="flex items-center justify-center gap-4 text-sm">
          {validatedInvite.discountPercent > 0 && (
            <div className="flex items-center gap-1.5 text-green-500">
              <Percent className="w-4 h-4" />
              <span>{validatedInvite.discountPercent}% off</span>
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <div className={cn('w-full', className)}>
      <div className="space-y-4">
        {/* Code input */}
        <div>
          <Label htmlFor="invite-code" className="text-sm font-medium">
            Beta Invite Code
          </Label>
          <div className="relative mt-1.5">
            <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="invite-code"
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setValidatedInvite(null);
                setError(null);
              }}
              placeholder="ENTER YOUR CODE"
              className="pl-10 h-11 bg-background/50 font-mono uppercase tracking-wider"
            />
          </div>
        </div>

        {/* Error message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Validated invite details */}
        <AnimatePresence>
          {validatedInvite && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-4 rounded-lg border border-border bg-card"
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br',
                    getPlanColor(validatedInvite.planTier),
                  )}
                >
                  <Gift className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h4 className="font-semibold">
                    {validatedInvite.planTier.charAt(0).toUpperCase() +
                      validatedInvite.planTier.slice(1)}{' '}
                    Plan
                  </h4>
                  <p className="text-sm text-muted-foreground">Beta Access</p>
                </div>
              </div>

              {validatedInvite.discountPercent > 0 && (
                <div className="flex items-center gap-2 text-sm text-green-500">
                  <Percent className="w-4 h-4" />
                  <span>{validatedInvite.discountPercent}% off</span>
                </div>
              )}

              {validatedInvite.expiresAt && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Expires: {new Date(validatedInvite.expiresAt).toLocaleDateString()}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action buttons */}
        {!validatedInvite ? (
          <Button
            type="button"
            onClick={handleValidate}
            disabled={isLoading || !code.trim()}
            className="w-full h-11"
            variant="outline"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                Validate Code
                <ArrowRight className="w-4 h-4 ml-1" />
              </>
            )}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleRedeem}
            disabled={isLoading}
            className="w-full h-11 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white border-0"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                Activate Beta Access
                <Check className="w-4 h-4 ml-1" />
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

export default BetaInviteCode;

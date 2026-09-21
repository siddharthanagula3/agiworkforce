'use client';

import { useEffect, useId, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@agiworkforce/ui';
import { getBillingPlanPricing } from '@agiworkforce/types';
import {
  joinUpgradeWaitlist,
  redeemUpgradeAccessCode,
  type UpgradeWaitlistRequest,
} from '@features/billing/services/upgrade-waitlist';
import { toUserMessage } from '@/lib/user-error-message';

export function UpgradeWaitlistDialog({
  request,
  onClose,
  onAccessGranted,
}: {
  request: UpgradeWaitlistRequest | null;
  onClose: () => void;
  onAccessGranted: (request: UpgradeWaitlistRequest) => Promise<void>;
}) {
  const codeId = useId();
  const errorId = useId();
  const [code, setCode] = useState('');
  const [state, setState] = useState<'idle' | 'joining' | 'joined' | 'redeeming' | 'opening'>(
    'idle',
  );
  const [error, setError] = useState('');

  useEffect(() => {
    setCode('');
    setState('idle');
    setError('');
  }, [request]);

  if (!request) return null;
  const planLabel = getBillingPlanPricing(request.plan).label;
  const pending = state === 'joining' || state === 'redeeming' || state === 'opening';

  const join = async () => {
    setState('joining');
    setError('');
    try {
      await joinUpgradeWaitlist(request);
      setState('joined');
    } catch (reason) {
      setState('idle');
      setError(toUserMessage(reason, 'Could not join the waitlist.'));
    }
  };

  const redeem = async () => {
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) {
      setError('Enter your access code.');
      return;
    }
    setState('redeeming');
    setError('');
    try {
      await redeemUpgradeAccessCode(normalizedCode);
      setState('opening');
      await onAccessGranted(request);
    } catch (reason) {
      setState('idle');
      setError(toUserMessage(reason, 'That access code could not be used.'));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="w-[min(94vw,30rem)] border-border/70 bg-background sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>{`Join the ${planLabel} upgrade waitlist`}</DialogTitle>
          <DialogDescription>
            Paid upgrades are opening in stages. Join the waitlist, or continue now with an access
            code.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Button
            className="w-full"
            disabled={pending || state === 'joined'}
            onClick={() => void join()}
          >
            {state === 'joining'
              ? 'Joining…'
              : state === 'joined'
                ? 'You’re on the waitlist'
                : 'Join upgrade waitlist'}
          </Button>

          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">Have an access code?</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-2">
            <label htmlFor={codeId} className="text-sm font-medium text-foreground">
              Access code
            </label>
            <input
              id={codeId}
              value={code}
              autoComplete="one-time-code"
              spellCheck={false}
              maxLength={50}
              disabled={pending}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => {
                setCode(event.target.value);
                setError('');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void redeem();
                }
              }}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm uppercase tracking-wide text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Enter code"
            />
            {error ? (
              <p id={errorId} role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          <Button
            className="w-full"
            variant="outline"
            disabled={pending || !code.trim()}
            onClick={() => void redeem()}
          >
            {state === 'redeeming'
              ? 'Checking code…'
              : state === 'opening'
                ? 'Opening checkout…'
                : 'Continue with code'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@agiworkforce/ui';
import { getBillingPlanPricing } from '@agiworkforce/types';
import { useUpgradeWaitlistStatus } from '@features/billing/hooks/use-upgrade-waitlist';
import {
  joinUpgradeWaitlist,
  redeemUpgradeAccessCode,
  type UpgradeWaitlistRequest,
} from '@features/billing/services/upgrade-waitlist';
import { toUserMessage } from '@/lib/user-error-message';

type WaitlistStep = 'idle' | 'joining' | 'redeeming' | 'opening';

interface UpgradeWaitlistProps {
  request: UpgradeWaitlistRequest;
  onAccessGranted: (request: UpgradeWaitlistRequest) => Promise<void>;
}

function waitlistTitle(planLabel: string, joined: boolean): string {
  return joined ? `You’re on the ${planLabel} waitlist` : `Join the ${planLabel} upgrade waitlist`;
}

function waitlistDescription(joined: boolean): string {
  return joined
    ? 'Paid upgrades are opening in stages. If you have an access code, you can continue now.'
    : 'Paid upgrades are opening in stages. Join the waitlist, or continue now with an access code.';
}

function useUpgradeWaitlist({
  request,
  onAccessGranted,
  joinOnOpen = false,
}: UpgradeWaitlistProps & { joinOnOpen?: boolean }) {
  const { status, recordJoined, recordAccessGranted } = useUpgradeWaitlistStatus();
  const [step, setStep] = useState<WaitlistStep>(joinOnOpen ? 'joining' : 'idle');
  const [joinedNow, setJoinedNow] = useState(false);
  const [code, setCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [codeError, setCodeError] = useState('');
  const joinPending = useRef(joinOnOpen);

  const join = useCallback(async () => {
    setStep('joining');
    setJoinError('');
    try {
      await joinUpgradeWaitlist(request);
      recordJoined(request.plan);
      setJoinedNow(true);
      setStep('idle');
    } catch (reason) {
      setStep('idle');
      setJoinError(toUserMessage(reason, 'Could not join the waitlist.'));
    }
  }, [recordJoined, request]);

  useEffect(() => {
    if (!joinPending.current) return;
    joinPending.current = false;
    void join();
  }, [join]);

  const redeem = async () => {
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) {
      setCodeError('Enter your access code.');
      return;
    }
    setStep('redeeming');
    setCodeError('');
    try {
      await redeemUpgradeAccessCode(normalizedCode);
      recordAccessGranted();
      setStep('opening');
      await onAccessGranted(request);
      setStep('idle');
    } catch (reason) {
      setStep('idle');
      setCodeError(toUserMessage(reason, 'That access code could not be used.'));
    }
  };

  return {
    planLabel: getBillingPlanPricing(request.plan).label,
    noticeEmail: status?.noticeEmail ?? null,
    joined: joinedNow || (status?.joinedPlans.includes(request.plan) ?? false),
    joinedNow,
    step,
    pending: step !== 'idle',
    holdsDialog: step === 'redeeming' || step === 'opening',
    code,
    joinError,
    codeError,
    join,
    redeem,
    changeCode: (value: string) => {
      setCode(value);
      setCodeError('');
    },
  };
}

type UpgradeWaitlist = ReturnType<typeof useUpgradeWaitlist>;

function UpgradeWaitlistForm({ waitlist }: { waitlist: UpgradeWaitlist }) {
  const codeId = useId();
  const joinErrorId = useId();
  const codeErrorId = useId();
  const confirmationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (waitlist.joinedNow) confirmationRef.current?.focus();
  }, [waitlist.joinedNow]);

  return (
    <div className="space-y-4">
      {waitlist.joined ? (
        <div
          ref={confirmationRef}
          tabIndex={-1}
          role="status"
          className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm text-foreground outline-none"
        >
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-text" aria-hidden="true" />
          <p className="min-w-0 break-words">
            {waitlist.noticeEmail
              ? `We’ll email ${waitlist.noticeEmail} when you can upgrade to ${waitlist.planLabel}.`
              : `We’ll let you know in Notifications when you can upgrade to ${waitlist.planLabel}.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Button
            className="w-full"
            disabled={waitlist.pending}
            aria-describedby={waitlist.joinError ? joinErrorId : undefined}
            onClick={() => void waitlist.join()}
          >
            {waitlist.step === 'joining' ? 'Joining…' : 'Join upgrade waitlist'}
          </Button>
          {waitlist.joinError ? (
            <p id={joinErrorId} role="alert" className="text-sm text-destructive-text">
              {waitlist.joinError}
            </p>
          ) : null}
        </div>
      )}

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
          value={waitlist.code}
          autoComplete="one-time-code"
          spellCheck={false}
          maxLength={50}
          disabled={waitlist.pending}
          aria-invalid={Boolean(waitlist.codeError)}
          aria-describedby={waitlist.codeError ? codeErrorId : undefined}
          onChange={(event) => waitlist.changeCode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void waitlist.redeem();
            }
          }}
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm uppercase tracking-wide text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Enter code"
        />
        {waitlist.codeError ? (
          <p id={codeErrorId} role="alert" className="text-sm text-destructive-text">
            {waitlist.codeError}
          </p>
        ) : null}
      </div>

      <Button
        className="w-full"
        variant="outline"
        disabled={waitlist.pending || !waitlist.code.trim()}
        onClick={() => void waitlist.redeem()}
      >
        {waitlist.step === 'redeeming'
          ? 'Checking code…'
          : waitlist.step === 'opening'
            ? 'Opening checkout…'
            : 'Continue with code'}
      </Button>
    </div>
  );
}

function UpgradeWaitlistDialogContent({
  request,
  joinOnOpen,
  onClose,
  onAccessGranted,
}: UpgradeWaitlistProps & { joinOnOpen: boolean; onClose: () => void }) {
  const waitlist = useUpgradeWaitlist({
    request,
    joinOnOpen,
    onAccessGranted: async (granted) => {
      await onAccessGranted(granted);
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && !waitlist.holdsDialog && onClose()}>
      <DialogContent className="w-[min(94vw,30rem)] border-border/70 bg-background sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>{waitlistTitle(waitlist.planLabel, waitlist.joined)}</DialogTitle>
          <DialogDescription>{waitlistDescription(waitlist.joined)}</DialogDescription>
        </DialogHeader>
        <UpgradeWaitlistForm waitlist={waitlist} />
      </DialogContent>
    </Dialog>
  );
}

export function UpgradeWaitlistDialog({
  request,
  joinOnOpen = false,
  onClose,
  onAccessGranted,
}: {
  request: UpgradeWaitlistRequest | null;
  joinOnOpen?: boolean;
  onClose: () => void;
  onAccessGranted: (request: UpgradeWaitlistRequest) => Promise<void>;
}) {
  if (!request) return null;
  return (
    <UpgradeWaitlistDialogContent
      key={`${request.plan}:${request.billingInterval}:${request.seats ?? ''}`}
      request={request}
      joinOnOpen={joinOnOpen}
      onClose={onClose}
      onAccessGranted={onAccessGranted}
    />
  );
}

export function UpgradeWaitlistPanel({ request, onAccessGranted }: UpgradeWaitlistProps) {
  const waitlist = useUpgradeWaitlist({ request, onAccessGranted });
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border border-border bg-card p-5 text-sm"
    >
      <h2 id={headingId} className="text-h4">
        {waitlistTitle(waitlist.planLabel, waitlist.joined)}
      </h2>
      <p className="mb-4 mt-1 text-muted-foreground">{waitlistDescription(waitlist.joined)}</p>
      <UpgradeWaitlistForm waitlist={waitlist} />
    </section>
  );
}

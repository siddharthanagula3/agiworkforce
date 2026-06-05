'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { Check, ChevronDown, Cloud, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@shared/ui/dialog';
import { Button } from '@shared/ui/button';
import { Input } from '@shared/ui/input';
import { Label } from '@shared/ui/label';
import { cn } from '@shared/lib/utils';
import { joinWaitlist } from '@/lib/services/waitlistServiceClient';

type DialogState = 'entry' | 'submitting' | 'confirmed' | 'error';

interface CloudUpgradeWaitlistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULT_COUNTRY = { code: 'IN', name: 'India', flag: '🇮🇳' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatToday(): string {
  return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function CloudUpgradeWaitlistDialog({
  open,
  onOpenChange,
}: CloudUpgradeWaitlistDialogProps) {
  const { user } = useUser();
  const [state, setState] = useState<DialogState>('entry');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [rank, setRank] = useState<number | null>(null);

  const trimmedEmail = email.trim().toLowerCase();
  const isValidEmail = useMemo(() => EMAIL_RE.test(trimmedEmail), [trimmedEmail]);
  const submitting = state === 'submitting';
  const confirmed = state === 'confirmed';
  const accountEmail =
    user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? '';
  const usingAccountEmail = Boolean(accountEmail);

  const reset = useCallback(() => {
    setState('entry');
    setEmail('');
    setError(null);
    setRank(null);
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (submitting && !nextOpen) return;
      onOpenChange(nextOpen);
      if (!nextOpen) {
        window.setTimeout(reset, 180);
      }
    },
    [onOpenChange, reset, submitting],
  );

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  useEffect(() => {
    if (open && accountEmail) {
      setEmail(accountEmail);
    }
  }, [accountEmail, open]);

  const handleSubmit = useCallback(async () => {
    if (!isValidEmail) {
      setError('Please enter a valid email address.');
      setState('error');
      return;
    }

    setError(null);
    setState('submitting');

    const result = await joinWaitlist({
      email: trimmedEmail,
      referralSource: 'billing',
    });

    if (!result.success) {
      setError(result.error ?? 'Something went wrong. Try again.');
      setState('error');
      return;
    }

    setRank(typeof result.rank === 'number' ? result.rank : null);
    setState('confirmed');
  }, [isValidEmail, trimmedEmail]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="w-[min(94vw,30rem)] overflow-hidden border-border/70 bg-background p-0 sm:rounded-2xl"
        closeButtonLabel="Close cloud upgrade dialog"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{confirmed ? "You're confirmed." : 'Upgrade hosted cloud.'}</DialogTitle>
          <DialogDescription>
            Request hosted cloud upgrade access without leaving the chat.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 pb-5">
          {confirmed ? (
            <ConfirmedState email={trimmedEmail} rank={rank} />
          ) : (
            <EntryState
              email={email}
              error={error}
              isValidEmail={isValidEmail}
              submitting={submitting}
              usingAccountEmail={usingAccountEmail}
              onEmailChange={setEmail}
              onSubmit={handleSubmit}
            />
          )}
        </div>

        <div className="border-t border-border/60 px-6 py-4">
          {confirmed ? (
            <Button className="h-12 w-full rounded-xl" onClick={() => handleOpenChange(false)}>
              Back to chat
            </Button>
          ) : (
            <Button
              className="h-12 w-full rounded-xl"
              disabled={!isValidEmail || submitting}
              isLoading={submitting}
              onClick={() => void handleSubmit()}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Joining...
                </>
              ) : (
                'Request upgrade access'
              )}
            </Button>
          )}
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            {usingAccountEmail
              ? 'This request is tied to your signed-in AGI account email.'
              : 'Email is only used to notify you when hosted cloud opens.'}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EntryState({
  email,
  error,
  isValidEmail,
  submitting,
  usingAccountEmail,
  onEmailChange,
  onSubmit,
}: {
  email: string;
  error: string | null;
  isValidEmail: boolean;
  submitting: boolean;
  usingAccountEmail: boolean;
  onEmailChange: (value: string) => void;
  onSubmit: () => Promise<void>;
}) {
  const errorId = error ? 'cloud-waitlist-email-error' : undefined;

  return (
    <div>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-foreground">
        <Cloud className="h-7 w-7" strokeWidth={1.6} aria-hidden="true" />
      </div>

      <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-normal text-foreground">
        Upgrade hosted cloud.
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Your website trial uses AGI managed Auto Economy. Request upgrade access for larger hosted
        models, search, tools, files, and computer-use without leaving the browser.
      </p>

      <div className="mt-6 space-y-2">
        <Label
          htmlFor="cloud-waitlist-email"
          className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
        >
          Email · required
        </Label>
        <Input
          id="cloud-waitlist-email"
          type="email"
          value={email}
          disabled={submitting || usingAccountEmail}
          placeholder="you@example.com"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          hasError={Boolean(error)}
          errorMessageId={errorId}
          onChange={(event) => onEmailChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && isValidEmail && !submitting) {
              event.preventDefault();
              void onSubmit();
            }
          }}
          className="h-12 rounded-xl bg-muted/40"
        />
        {error ? (
          <p id={errorId} role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <div className="mt-4 space-y-2">
        <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Country · optional · helps us price fairly
        </Label>
        <div className="flex h-12 items-center rounded-xl border border-input bg-muted/40 px-3 text-sm">
          <span className="text-foreground">
            {DEFAULT_COUNTRY.flag} {DEFAULT_COUNTRY.name}
          </span>
          <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

function ConfirmedState({ email, rank }: { email: string; rank: number | null }) {
  return (
    <div className="flex flex-col items-center pt-2 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white">
        <Check className="h-10 w-10" strokeWidth={2.5} aria-hidden="true" />
      </div>

      <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-normal text-foreground">
        You're confirmed.
      </h2>

      <p
        className={cn(
          'mt-2 text-base font-semibold',
          rank === null ? 'text-muted-foreground' : 'text-primary',
        )}
        data-testid="cloud-waitlist-rank"
      >
        {rank === null ? "You're on the list" : `#${(rank + 1).toLocaleString('en-US')} in line`}
      </p>

      <p className="mt-3 max-w-xs text-sm leading-6 text-muted-foreground">
        We'll email you when hosted cloud upgrades open for your account. No date promised yet -
        we'll let people in in waves.
      </p>

      <div className="mt-5 rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
        {email} · {DEFAULT_COUNTRY.flag} · joined {formatToday()}
      </div>
    </div>
  );
}

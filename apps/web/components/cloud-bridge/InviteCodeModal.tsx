'use client';

import { useState, useEffect } from 'react';
import { Cloud, Check, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/Dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { redeemInviteCode, joinWaitlist } from '@/lib/services/waitlistServiceClient';
import type { InviteCodeError, InviteCodeModalProps } from './types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function friendlyInviteError(code?: InviteCodeError): string {
  switch (code) {
    case 'invalid_code':
      return "That code doesn't look right. Double-check and try again.";
    case 'expired':
      return 'That code has expired. Join the waitlist to get a fresh one.';
    case 'fully_redeemed':
      return 'That code is fully redeemed. Try another or join the waitlist.';
    case 'already_redeemed_by_user':
      return "You've already used this code. Cloud should be unlocked.";
    case 'anon_signin_failed':
      return "Couldn't create your session. Try again in a moment.";
    case 'rpc_error':
      return 'Something went wrong on our end. Try again.';
    default:
      return 'Something went wrong. Try again or join the waitlist.';
  }
}

type InviteState = 'idle' | 'loading' | 'success' | 'error';

interface InviteTabProps {
  source: InviteCodeModalProps['source'];
  onSwitchToWaitlist: () => void;
  onRedeemed?: (inviteId: string) => void;
  onClose: () => void;
}

function InviteTab({ source, onSwitchToWaitlist, onRedeemed, onClose }: InviteTabProps) {
  const [code, setCode] = useState('');
  const [state, setState] = useState<InviteState>('idle');
  const [error, setError] = useState<string | null>(null);

  const trimmedCode = code.trim().toUpperCase();
  const canSubmit = trimmedCode.length >= 6 && state !== 'loading';

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setState('loading');

    const result = await redeemInviteCode(trimmedCode, source);

    if (!result.success) {
      setError(friendlyInviteError(result.error));
      setState('error');
      return;
    }

    setState('success');
    if (result.inviteId) onRedeemed?.(result.inviteId);
    setTimeout(() => {
      onClose();
    }, 1500);
  };

  return (
    <div className="space-y-5">
      {state === 'success' ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center animate-in fade-in duration-300">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-agent-success">
            <Check className="h-6 w-6 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <p className="text-base font-semibold text-foreground">Cloud unlocked!</p>
          <p className="text-sm text-muted-foreground">Closing in a moment...</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <label
              htmlFor="invite-code-input"
              className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground"
            >
              Invitation code
            </label>
            <Input
              id="invite-code-input"
              type="text"
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="XXXXXXXX"
              value={code}
              disabled={state === 'loading'}
              className="font-mono tracking-widest uppercase"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSubmit();
              }}
            />
            {error && (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>

          <Button onClick={() => void handleSubmit()} disabled={!canSubmit} className="w-full">
            {state === 'loading' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Validating...
              </>
            ) : (
              'Unlock cloud'
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            {"Don't have a code? "}
            <button
              type="button"
              onClick={onSwitchToWaitlist}
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Join the waitlist
            </button>
          </p>
        </>
      )}
    </div>
  );
}

type WaitlistState = 'idle' | 'loading' | 'success' | 'error';

interface WaitlistTabProps {
  source: InviteCodeModalProps['source'];
  onWaitlisted?: (email: string) => void;
  onClose: () => void;
}

function WaitlistTab({ source, onWaitlisted, onClose }: WaitlistTabProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [state, setState] = useState<WaitlistState>('idle');
  const [error, setError] = useState<string | null>(null);

  const isValidEmail = EMAIL_RE.test(email.trim());
  const canSubmit = isValidEmail && state !== 'loading';

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setState('loading');

    const result = await joinWaitlist({
      email: email.trim().toLowerCase(),
      name: name.trim() || undefined,
      referralSource: source,
    });

    if (!result.success) {
      setError(result.error ?? 'Something went wrong. Try again.');
      setState('error');
      return;
    }

    setState('success');
    onWaitlisted?.(email.trim().toLowerCase());
    setTimeout(() => {
      onClose();
    }, 2000);
  };

  return (
    <div className="space-y-5">
      {state === 'success' ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center animate-in fade-in duration-300">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-agent-success">
            <Check className="h-6 w-6 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <p className="text-base font-semibold text-foreground">{"You're on the list!"}</p>
          <p className="text-sm text-muted-foreground">{"We'll email when invite codes open."}</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <label
              htmlFor="waitlist-email-input"
              className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground"
            >
              Email · required
            </label>
            <Input
              id="waitlist-email-input"
              type="email"
              autoFocus
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="you@example.com"
              value={email}
              disabled={state === 'loading'}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSubmit();
              }}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="waitlist-name-input"
              className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground"
            >
              Name · optional
            </label>
            <Input
              id="waitlist-name-input"
              type="text"
              autoComplete="name"
              placeholder="Your name"
              value={name}
              disabled={state === 'loading'}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSubmit();
              }}
            />
          </div>

          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button onClick={() => void handleSubmit()} disabled={!canSubmit} className="w-full">
            {state === 'loading' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Joining...
              </>
            ) : (
              'Join waitlist'
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            No account created. Email used only to notify you.
          </p>
        </>
      )}
    </div>
  );
}

export function InviteCodeModal({
  open,
  onClose,
  source,
  defaultTab = 'invite',
  onRedeemed,
  onWaitlisted,
}: InviteCodeModalProps) {
  const [activeTab, setActiveTab] = useState<'invite' | 'waitlist'>(defaultTab);

  useEffect(() => {
    if (open) setActiveTab(defaultTab);
  }, [open, defaultTab]);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-md w-full gap-0 p-0 overflow-hidden"
        aria-labelledby="invite-code-modal-title"
        aria-describedby="invite-code-modal-desc"
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Cloud className="h-5 w-5 text-muted-foreground" strokeWidth={1.6} />
            </div>
            <div className="space-y-1 min-w-0">
              <DialogTitle
                id="invite-code-modal-title"
                className="text-base font-semibold text-foreground leading-none"
              >
                Cloud features
              </DialogTitle>
              <DialogDescription
                id="invite-code-modal-desc"
                className="text-xs text-muted-foreground leading-relaxed"
              >
                Cloud features are gated for v1. Join the waitlist, or enter your invitation code
                below to unlock cloud routing. AGI will route your requests through one of: BYOK
                (your provider key), Groq (free tier, US-routed), OpenRouter, or DeepSeek (with
                explicit data-residency disclosure).
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-5">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'invite' | 'waitlist')}>
            <TabsList className="w-full mb-5">
              <TabsTrigger value="invite" className="flex-1">
                Enter invitation code
              </TabsTrigger>
              <TabsTrigger value="waitlist" className="flex-1">
                Join waitlist
              </TabsTrigger>
            </TabsList>

            <TabsContent value="invite">
              <InviteTab
                source={source}
                onSwitchToWaitlist={() => setActiveTab('waitlist')}
                onRedeemed={onRedeemed}
                onClose={onClose}
              />
            </TabsContent>

            <TabsContent value="waitlist">
              <WaitlistTab source={source} onWaitlisted={onWaitlisted} onClose={onClose} />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

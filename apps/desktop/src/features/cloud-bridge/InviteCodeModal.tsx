import { Cloud, X, ExternalLink, Laptop } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { openExternalUrl } from '@/utils/navigation';
import { DESKTOP_CLOUD_COMING_SOON } from '../../constants/cloudAvailability';
import type { InviteCodeModalProps } from './types';

// ---------------------------------------------------------------------------
// InviteCodeModal — honest interim "Cloud coming soon to desktop" surface.
//
// PA-3 / DESK-CLOUD-COPY-01: AGI managed cloud is PUBLIC ALPHA on Web & Mobile.
// Desktop managed-cloud persistence is not implemented yet (the Rust cloud
// commands fail closed; shared-backend wiring is a fast-follow, runbook
// DCL-1..4). There is NO invite/waitlist gate — the product is public alpha,
// not invite-only — so this modal no longer collects invite codes or waitlist
// emails. It tells the truth: cloud is available on Web & Mobile today, desktop
// is coming soon, and Local + BYOK work on desktop right now.
//
// The exported name and props interface are unchanged so existing callers
// (App.tsx) keep working; the `source` / `defaultTab` / `onRedeemed` /
// `onWaitlisted` props are accepted for compatibility and intentionally unused.
// ---------------------------------------------------------------------------

export function InviteCodeModal({ open, onClose }: InviteCodeModalProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-md w-full gap-0 p-0 overflow-hidden"
        aria-labelledby="cloud-coming-soon-title"
        aria-describedby="cloud-coming-soon-desc"
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Cloud className="h-5 w-5 text-muted-foreground" strokeWidth={1.6} />
            </div>
            <div className="space-y-1 min-w-0">
              <DialogTitle
                id="cloud-coming-soon-title"
                className="text-base font-semibold text-foreground leading-none"
              >
                AGI Cloud
              </DialogTitle>
              <DialogDescription
                id="cloud-coming-soon-desc"
                className="text-xs text-muted-foreground leading-relaxed"
              >
                {DESKTOP_CLOUD_COMING_SOON}
              </DialogDescription>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ml-auto shrink-0 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              aria-label="Close modal"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          <div className="flex items-start gap-3 rounded-lg border border-border bg-card/60 px-4 py-3">
            <Laptop className="h-4 w-4 mt-0.5 shrink-0 text-emerald-400" />
            <p className="text-sm text-muted-foreground">
              Local Mode and BYOK (your own provider keys) work on the desktop app today — nothing
              leaves your device unless you choose a provider.
            </p>
          </div>

          <Button
            type="button"
            className="w-full"
            onClick={() => void openExternalUrl('https://agiworkforce.com')}
          >
            <ExternalLink className="h-4 w-4" />
            Use AGI Cloud on the web
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Cloud chats sync across web and mobile. Desktop cloud sync is on the way.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

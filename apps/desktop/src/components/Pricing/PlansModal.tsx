/**
 * PlansModal — in-app plans/pricing modal.
 *
 * Reachable from:
 *   1. Profile popover "View all plans" / "Try Hobby" links
 *      → dispatches CustomEvent('chat:action', { detail: { type: 'open-plans-modal' } })
 *      → App.tsx listens and sets plansModalOpen state
 *   2. Settings → Billing tab (future — wire via openPlansModal() helper below)
 *
 * CTA routing:
 *   - Local / BYOK users: "Upgrade to Hobby" → opens https://agiworkforce.com/pricing via shell
 *   - Hobby (active): "Manage in Stripe portal" → openPricingPage('upgrade_required')
 *   - Pro / Max: "Join waitlist" → opens https://agiworkforce.com/waitlist via shell
 */
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/Dialog';
import { PlanCard } from './PlanCard';
import { isFreePlan, type UIPlanTier } from '@agiworkforce/types';
import { openExternalUrl, openPricingPage } from '../../utils/navigation';
import { useAppModeStore } from '../../stores/appModeStore';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PlansModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Tier ordering for display
// ---------------------------------------------------------------------------

const TIER_ORDER: UIPlanTier[] = ['local', 'byok', 'hobby', 'pro', 'max'];

// ---------------------------------------------------------------------------
// Map legacy PlanTier → UIPlanTier
// ---------------------------------------------------------------------------

function legacyToUIPlanTier(raw: string | null | undefined): UIPlanTier {
  if (!raw) return 'byok';
  if (raw === 'free' || raw === 'byok') return 'byok';
  if (raw === 'local') return 'local';
  if (raw === 'hobby') return 'hobby';
  if (raw === 'pro') return 'pro';
  if (raw === 'max') return 'max';
  if (raw === 'enterprise') return 'max'; // treat enterprise as max for display
  return 'byok';
}

// ---------------------------------------------------------------------------
// PlansModal
// ---------------------------------------------------------------------------

export function PlansModal({ open, onOpenChange }: PlansModalProps) {
  const rawPlan = useAppModeStore((s) => s.planTier);
  const currentTier = legacyToUIPlanTier(rawPlan);

  async function handleCtaClick(tier: UIPlanTier) {
    if (tier === 'local' || tier === 'byok') {
      // Already free — nothing to do (CTA should be disabled/current)
      return;
    }

    if (tier === 'hobby') {
      if (isFreePlan(currentTier)) {
        // Upgrade path: open pricing page
        await openPricingPage('upgrade_required');
      } else {
        // Active Hobby user: send to Stripe portal
        await openPricingPage('upgrade_required');
      }
    } else if (tier === 'pro' || tier === 'max') {
      // Waitlist
      await openExternalUrl('https://agiworkforce.com/waitlist');
    }

    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-4xl w-full p-0 gap-0 overflow-hidden"
        aria-labelledby="plans-modal-title"
        aria-describedby="plans-modal-desc"
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <DialogTitle id="plans-modal-title" className="text-lg font-semibold text-foreground">
                Plans &amp; Pricing
              </DialogTitle>
              <DialogDescription id="plans-modal-desc" className="text-sm text-muted-foreground">
                AGI Workforce — Beyond one model. Beyond one surface.{' '}
                <span className="font-medium">Local and BYOK are always free.</span>
              </DialogDescription>
            </div>
            {/* Radix provides a built-in close button; we also add an explicit one for clarity */}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="ml-4 shrink-0 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              aria-label="Close plans modal"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </DialogHeader>

        {/* Tier grid */}
        <div className="p-6 overflow-y-auto max-h-[70vh]">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {TIER_ORDER.map((tier) => (
              <PlanCard
                key={tier}
                tier={tier}
                isCurrentPlan={tier === currentTier}
                onCtaClick={(t) => void handleCtaClick(t)}
              />
            ))}
          </div>

          {/* Footer note */}
          <p className="mt-6 text-center text-[11px] text-muted-foreground">
            Pro and Max are on the waitlist — join early to lock in launch pricing. All prices in
            USD. Subject to change before GA.
            {/* TODO(billing): replace above with real pricing once Stripe products are finalized */}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Helper: fire the open-plans-modal event from non-React code
// ---------------------------------------------------------------------------

export function openPlansModal() {
  window.dispatchEvent(new CustomEvent('chat:action', { detail: { type: 'open-plans-modal' } }));
}

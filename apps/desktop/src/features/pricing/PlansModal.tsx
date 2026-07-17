/**
 * PlansModal — in-app plans/pricing modal.
 *
 * Reachable from:
 *   1. Profile popover "View all plans" / "Try Basic" links
 *      → dispatches CustomEvent('chat:action', { detail: { type: 'open-plans-modal' } })
 *      → App.tsx listens and sets plansModalOpen state
 *   2. Settings → Billing tab (future — wire via openPlansModal() helper below)
 *
 * CTA routing:
 *   - Managed cloud is public alpha, open by default — no invite/waitlist gate.
 *   - Web is the canonical billing surface: paid-tier CTAs open the web
 *     pricing page (Stripe checkout lives there) in the default browser.
 *   - Desktop managed-cloud persistence is still fail-closed (see
 *     constants/cloudAvailability.ts); a subscription bought via the CTA is
 *     usable on Web & Mobile today.
 */
import { X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/Dialog';
import { PlanCard } from './PlanCard';
import { isFreePlan, isPlanSelectableOnSurface, type UIPlanTier } from '@agiworkforce/types';
import { selectPlan, useAuthStore } from '../../stores/auth';
import { WEB_APP_URL } from '../../api/config';
import { openExternalUrl } from '../../utils/navigation';

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

const TIER_ORDER: UIPlanTier[] = ['local', 'byok', 'basic', 'pro', 'max'];

// The billing catalog names the local tier 'local-only'; the rest match.
const VISIBLE_TIERS = TIER_ORDER.filter((tier) =>
  isPlanSelectableOnSurface(tier === 'local' ? 'local-only' : tier, 'desktop'),
);

// ---------------------------------------------------------------------------
// Map legacy PlanTier → UIPlanTier
// ---------------------------------------------------------------------------

function legacyToUIPlanTier(raw: string | null | undefined): UIPlanTier {
  if (!raw) return 'byok';
  if (raw === 'free' || raw === 'byok') return 'byok';
  if (raw === 'local' || raw === 'local-only') return 'local';
  // 'hobby' is a legacy value from before the 2026-07-02 tier rename.
  if (raw === 'hobby' || raw === 'basic') return 'basic';
  if (raw === 'pro') return 'pro';
  if (raw === 'max') return 'max';
  if (raw === 'enterprise') return 'max'; // treat enterprise as max for display
  return 'byok';
}

// ---------------------------------------------------------------------------
// PlansModal
// ---------------------------------------------------------------------------

export function PlansModal({ open, onOpenChange }: PlansModalProps) {
  const rawPlan = useAuthStore(selectPlan);
  const currentTier = legacyToUIPlanTier(rawPlan);

  function handleCtaClick(tier: UIPlanTier) {
    if (isFreePlan(tier)) {
      // Already free — nothing to do (CTA should be disabled/current)
      return;
    }

    // Web is the canonical billing surface — checkout happens there.
    void openExternalUrl(`${WEB_APP_URL}/pricing`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl w-full p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <DialogTitle className="text-lg font-semibold text-foreground">
                Plans &amp; Pricing
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {VISIBLE_TIERS.map((tier) => (
              <PlanCard
                key={tier}
                tier={tier}
                isCurrentPlan={tier === currentTier}
                onCtaClick={handleCtaClick}
              />
            ))}
          </div>

          {/* Footer note */}
          <p className="mt-6 text-center text-[11px] text-muted-foreground">
            AGI Cloud is in public alpha on Web &amp; Mobile — no invite needed. Desktop cloud
            support is coming soon; Local and BYOK work on desktop today. Upgrading opens the web
            pricing page in your browser.{' '}
            <button
              type="button"
              onClick={() => void openExternalUrl(`${WEB_APP_URL}/contact-sales`)}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Enterprise? Contact sales
            </button>
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

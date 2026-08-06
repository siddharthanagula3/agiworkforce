/**
 * MaxUpgradePrompt — small inline banner shown when a user whose tier cannot
 * switch provider mid-thread attempts to do so. Click → host's onUpgrade fires
 * (typically opens billing).
 *
 * The component is presentational — it does not gate anything itself.
 * Gating is decided upstream via `selectProviderSwitchGate()` in tierStore,
 * which defers to `canSwitchProviderInThread()`. That predicate admits
 * `max`, `max_15x`, and `enterprise` only — so this banner names Max, not Pro.
 *
 * The plan name is read from `PLAN_LABEL` rather than written inline, and no
 * price is rendered here: prices live in `BILLING_PLAN_PRICING` and are shown
 * by the billing surface the host opens. A price hardcoded in a presentational
 * component silently becomes a false claim the first time pricing moves.
 */
import { Sparkles, X } from 'lucide-react';
import { PLAN_LABEL } from '@agiworkforce/types';
import { cn } from '../lib/utils';

/** Lowest tier that `canSwitchProviderInThread()` admits. */
const REQUIRED_PLAN_LABEL = PLAN_LABEL.max;

export interface MaxUpgradePromptProps {
  /** Provider the user attempted to switch to (e.g. "OpenAI", "Google"). */
  attemptedProvider: string;
  /** Provider locked to the current conversation (e.g. "Anthropic"). */
  currentProvider: string;
  onUpgrade: () => void;
  onDismiss: () => void;
  className?: string;
}

export function MaxUpgradePrompt({
  attemptedProvider,
  currentProvider,
  onUpgrade,
  onDismiss,
  className,
}: MaxUpgradePromptProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-start gap-3 rounded-xl border border-[var(--chat-accent-primary)]/40',
        'bg-[var(--chat-accent-primary)]/10 px-4 py-3 text-sm shadow-sm',
        className,
      )}
    >
      <Sparkles className="h-5 w-5 shrink-0 text-[var(--chat-accent-primary)]" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-foreground">
          <span className="font-semibold">{REQUIRED_PLAN_LABEL} unlocks multi-provider chat.</span>{' '}
          Switching from <span className="font-medium">{currentProvider}</span> to{' '}
          <span className="font-medium">{attemptedProvider}</span> mid-thread keeps your context
          across providers — available on {REQUIRED_PLAN_LABEL} and above.
        </p>
        <button
          type="button"
          onClick={onUpgrade}
          className={cn(
            'mt-2 inline-flex items-center gap-1 rounded-lg px-3 py-1.5',
            'bg-[var(--chat-accent-primary)] text-xs font-semibold text-white',
            'transition-colors hover:opacity-90',
          )}
        >
          Upgrade to {REQUIRED_PLAN_LABEL}
        </button>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Dismiss upgrade prompt"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export default MaxUpgradePrompt;

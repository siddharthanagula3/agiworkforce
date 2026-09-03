import { Sparkles, X } from 'lucide-react';
import { PLAN_LABEL } from '@agiworkforce/types';
import { cn } from '../lib/utils';

const REQUIRED_PLAN_LABEL = PLAN_LABEL.max;

export interface MaxUpgradePromptProps {
  attemptedProvider: string;
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
      <Sparkles
        className="h-5 w-5 shrink-0 text-[var(--chat-accent-primary-text)]"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-foreground">
          <span className="font-semibold">{REQUIRED_PLAN_LABEL} unlocks multi-provider chat.</span>{' '}
          Switching from <span className="font-medium">{currentProvider}</span> to{' '}
          <span className="font-medium">{attemptedProvider}</span> mid-thread keeps your context
          across providers, available on {REQUIRED_PLAN_LABEL} and above.
        </p>
        <button
          type="button"
          onClick={onUpgrade}
          className={cn(
            'mt-2 inline-flex items-center gap-1 rounded-lg px-3 py-1.5',
            'bg-[var(--chat-accent-primary)] text-xs font-semibold text-[var(--chat-accent-on-primary)]',
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

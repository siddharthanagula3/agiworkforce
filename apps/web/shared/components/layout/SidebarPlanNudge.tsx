'use client';

/**
 * Free-plan chrome for the sidebar account footer, shared by both web shells,
 * WebChatPage and WebAppShell.
 */

export function SidebarFreePlanNudge({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div className="px-3 pb-2">
      <div className="flex items-center justify-between rounded-full border border-[var(--chat-border)] bg-[var(--chat-sidebar-bg)] px-3 py-1.5 text-xs text-muted-foreground">
        <span>Free plan</span>
        <button
          type="button"
          onClick={onUpgrade}
          className="font-medium text-[var(--chat-accent-primary-text)] hover:underline"
        >
          Upgrade
        </button>
      </div>
    </div>
  );
}

/**
 * `tierLabel` is null while the plan is not yet trustworthy, see
 * `isBillingPolicyReady`. Rendering nothing beats claiming a tier, because the
 * Free fallback is exactly what sells a paying subscriber an "upgrade".
 */
export function SidebarPlanBadge({
  tierLabel,
  isFreeTier,
}: {
  tierLabel: string | null;
  isFreeTier: boolean;
}) {
  if (!tierLabel || isFreeTier) return null;
  return (
    <span className="shrink-0 rounded-full bg-muted/60 px-1.5 py-0.5 text-caption font-semibold uppercase tracking-wide text-muted-foreground">
      {tierLabel}
    </span>
  );
}

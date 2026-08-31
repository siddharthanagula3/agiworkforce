'use client';

/**
 * Free-plan chrome for the sidebar account footer, shared by both web shells:
 * WebChatPage's rich chat sidebar and the lighter WebAppShell behind /tasks,
 * /chat/library, /chat/projects and /chat/schedules. The shells owned separate
 * copies and only the chat one ever grew the nudge, so a free-tier user lost
 * the upgrade route the moment they left /chat (SHELL-NAV-IA-006).
 */

export function SidebarFreePlanNudge({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div className="px-3 pb-2">
      <div className="flex items-center justify-between rounded-full bg-black/[0.04] dark:bg-white/[0.04] px-3 py-1.5 text-xs text-muted-foreground">
        <span>Free plan</span>
        <button
          type="button"
          onClick={onUpgrade}
          className="font-medium text-primary hover:underline"
        >
          Upgrade
        </button>
      </div>
    </div>
  );
}

/**
 * `tierLabel` is null while the plan is not yet trustworthy — see
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
  if (!tierLabel) return null;
  return isFreeTier ? (
    <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-primary hover:bg-primary/20">
      Upgrade
    </span>
  ) : (
    <span className="shrink-0 rounded-full bg-muted/60 px-1.5 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
      {tierLabel}
    </span>
  );
}

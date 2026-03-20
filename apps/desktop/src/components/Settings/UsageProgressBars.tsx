/**
 * UsageProgressBars — Usage summary for the Settings Account tab.
 *
 * Shows:
 * - Monthly credit / token budget usage with a colour-coded progress bar
 * - Per-model breakdown as mini horizontal bars
 * - "Keep using after limits" toggle (budget enabled flag)
 *
 * Data comes from useBillingUsageStore. When no data is available a
 * placeholder is shown instead.
 */
import { cn } from '../../lib/utils';
import { Progress } from '../ui/Progress';
import { Switch } from '../ui/Switch';
import { Label } from '../ui/Label';
import {
  useBillingUsageStore,
  selectBudget,
  selectBudgetPercentage,
} from '../../stores/billingUsage';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Returns the appropriate Tailwind colour class for a given usage percentage. */
function barColor(pct: number): string {
  if (pct >= 95) return 'bg-red-500';
  if (pct >= 80) return 'bg-amber-500';
  return 'bg-blue-500';
}

/** Formats a timestamp (ms) as a short locale date string. */
function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── component ─────────────────────────────────────────────────────────────────

export function UsageProgressBars() {
  const budget = useBillingUsageStore(selectBudget);
  const budgetPct = useBillingUsageStore(selectBudgetPercentage);
  const usageStats = useBillingUsageStore((s) => s.usageStats);
  const setBudgetEnabled = useBillingUsageStore((s) => s.setBudgetEnabled);

  const clampedPct = Math.min(Math.max(budgetPct, 0), 100);
  const color = barColor(clampedPct);

  const hasData = budget.enabled || (usageStats !== null && budget.currentUsage > 0);

  if (!hasData) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <p className="text-sm text-muted-foreground">No usage data available.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Enable token budget tracking below to start monitoring usage.
          </p>
        </div>

        {/* Keep the toggle visible even when there's no data */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="budget-enabled" className="text-sm font-medium">
              Enable usage tracking
            </Label>
            <p className="text-xs text-muted-foreground">
              Track token consumption and set period limits.
            </p>
          </div>
          <Switch id="budget-enabled" checked={budget.enabled} onCheckedChange={setBudgetEnabled} />
        </div>
      </div>
    );
  }

  // Per-model breakdown from usageStats
  const modelUsage = usageStats?.model_usage ?? [];
  const maxModelCost = modelUsage.length > 0 ? Math.max(...modelUsage.map((m) => m.cost_usd)) : 0;

  return (
    <div className="space-y-5">
      {/* ── Monthly / period usage ── */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Token Budget Usage</span>
          <span
            className={cn(
              'text-xs font-semibold tabular-nums',
              clampedPct >= 95
                ? 'text-red-500'
                : clampedPct >= 80
                  ? 'text-amber-500'
                  : 'text-blue-500',
            )}
          >
            {Math.round(clampedPct)}% used
          </span>
        </div>

        <Progress
          value={clampedPct}
          max={100}
          className="h-2 bg-secondary"
          indicatorClassName={cn('transition-all duration-500', color)}
        />

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {budget.currentUsage.toLocaleString()} / {budget.limit.toLocaleString()} tokens
          </span>
          {budget.periodEnd > 0 && <span>Resets {formatDate(budget.periodEnd)}</span>}
        </div>

        {budget.estimatedCost > 0 && (
          <p className="text-xs text-muted-foreground">
            Estimated cost:{' '}
            <span className="font-medium text-foreground">${budget.estimatedCost.toFixed(4)}</span>
          </p>
        )}
      </div>

      {/* ── Per-model breakdown ── */}
      {modelUsage.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Per-model breakdown
          </h5>
          <div className="space-y-2">
            {modelUsage.slice(0, 8).map((model) => {
              const modelPct = maxModelCost > 0 ? (model.cost_usd / maxModelCost) * 100 : 0;
              return (
                <div key={model.model_id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate max-w-[60%] text-foreground/80">
                      {model.model_name || model.model_id}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {model.total_tokens.toLocaleString()} tok
                    </span>
                  </div>
                  <div className="h-1 w-full rounded-full bg-secondary overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-300',
                        barColor(modelPct),
                      )}
                      style={{ width: `${Math.min(modelPct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Keep using after limits toggle ── */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="budget-enabled" className="text-sm font-medium">
            Keep using after limits
          </Label>
          <p className="text-xs text-muted-foreground">
            Continue sending messages even when the token budget is exceeded.
          </p>
        </div>
        <Switch
          id="budget-enabled"
          checked={!budget.enabled}
          onCheckedChange={(checked) => setBudgetEnabled(!checked)}
        />
      </div>
    </div>
  );
}

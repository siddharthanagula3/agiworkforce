/**
 * UsageDashboard — Claude.ai-style usage dashboard for the Settings Account tab.
 *
 * Shows:
 * - Plan usage limits: session token budget with colour-coded progress bar
 * - Model limits: per-model/provider breakdown with mini bars
 * - Cost tracking: monthly spend vs budget with "Adjust limit" action
 *
 * Data is sourced from useBillingUsageStore (budget, usageStats, costOverview).
 * When no data is available an empty state is shown.
 */
import { useCallback, useEffect, useState } from 'react';
import { BarChart3, RefreshCw, SlidersHorizontal, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '../../lib/utils';
import { Progress } from '../ui/Progress';
import { Button } from '../ui/Button';
import {
  useBillingUsageStore,
  selectBudget,
  selectBudgetPercentage,
} from '../../stores/billingUsage';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Returns Tailwind class for a given usage percentage. */
function barColorClass(pct: number): string {
  if (pct > 95) return 'bg-red-500';
  if (pct >= 80) return 'bg-amber-500';
  if (pct >= 50) return 'bg-blue-500';
  return 'bg-green-500';
}

/** Returns text colour class matching barColorClass. */
function textColorClass(pct: number): string {
  if (pct > 95) return 'text-red-500';
  if (pct >= 80) return 'text-amber-500';
  if (pct >= 50) return 'text-blue-500';
  return 'text-green-500';
}

/** Formats a timestamp (ms) as a short locale string. */
function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Formats milliseconds to "Xh Ym" or "Xm" string. */
function formatTimeRemaining(futureMs: number): string {
  const diffMs = Math.max(0, futureMs - Date.now());
  const totalMinutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// ── sub-components ────────────────────────────────────────────────────────────

interface UsageRowProps {
  label: string;
  sublabel?: string;
  pct: number;
  detail: string;
}

function UsageRow({ label, sublabel, pct, detail }: UsageRowProps) {
  const clamped = Math.min(Math.max(pct, 0), 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-sm font-medium truncate">{label}</span>
          {sublabel && <span className="ml-1.5 text-xs text-muted-foreground">{sublabel}</span>}
        </div>
        <span
          className={cn('text-xs font-semibold tabular-nums shrink-0', textColorClass(clamped))}
        >
          {Math.round(clamped)}% used
        </span>
      </div>
      <Progress
        value={clamped}
        max={100}
        className="h-2 bg-secondary"
        indicatorClassName={cn('transition-all duration-500', barColorClass(clamped))}
      />
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

interface ModelRowProps {
  name: string;
  tokens: number;
  cost: number;
  pct: number;
}

function ModelRow({ name, tokens, cost, pct }: ModelRowProps) {
  const clamped = Math.min(Math.max(pct, 0), 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate max-w-[55%] text-foreground/80">{name}</span>
        <span className="text-muted-foreground tabular-nums shrink-0">
          {tokens.toLocaleString()} tok · ${cost.toFixed(4)}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-300', barColorClass(clamped))}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

// ── empty state ───────────────────────────────────────────────────────────────

function EmptyUsageState() {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3">
      <div className="rounded-full bg-muted p-4">
        <BarChart3 className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium">No usage data yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Start a conversation to begin tracking usage.
        </p>
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export function UsageDashboard() {
  const budget = useBillingUsageStore(selectBudget);
  const budgetPct = useBillingUsageStore(selectBudgetPercentage);
  const { usageStats, costOverview, loadCostOverview, setMonthlyBudget } = useBillingUsageStore(
    useShallow((s) => ({
      usageStats: s.usageStats,
      costOverview: s.costOverview,
      loadCostOverview: s.loadCostOverview,
      setMonthlyBudget: s.setMonthlyBudget,
    })),
  );

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAdjustingBudget, setIsAdjustingBudget] = useState(false);
  const [budgetInputValue, setBudgetInputValue] = useState('');
  const [showBudgetInput, setShowBudgetInput] = useState(false);

  // Load cost overview on mount
  useEffect(() => {
    void loadCostOverview();
  }, [loadCostOverview]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await loadCostOverview();
      toast.success('Usage data refreshed');
    } catch {
      toast.error('Failed to refresh usage data');
    } finally {
      setIsRefreshing(false);
    }
  }, [loadCostOverview]);

  const handleAdjustLimit = useCallback(async () => {
    const parsed = parseFloat(budgetInputValue);
    if (isNaN(parsed) || parsed < 0) {
      toast.error('Please enter a valid budget amount');
      return;
    }
    setIsAdjustingBudget(true);
    try {
      await setMonthlyBudget(parsed === 0 ? undefined : parsed);
      toast.success(`Monthly budget set to $${parsed.toFixed(2)}`);
      setShowBudgetInput(false);
      setBudgetInputValue('');
    } catch {
      toast.error('Failed to update budget');
    } finally {
      setIsAdjustingBudget(false);
    }
  }, [budgetInputValue, setMonthlyBudget]);

  // Determine whether we have any real data to display
  const hasTokenData = budget.currentUsage > 0 || budget.enabled;
  const hasModelData = (usageStats?.model_usage?.length ?? 0) > 0;
  const hasCostData = costOverview !== null;
  const hasAnyData = hasTokenData || hasModelData || hasCostData;

  // Derive session reset label from budget periodEnd
  const sessionResetLabel =
    budget.periodEnd > Date.now()
      ? `Resets in ${formatTimeRemaining(budget.periodEnd)}`
      : budget.periodEnd > 0
        ? `Reset ${formatDate(budget.periodEnd)}`
        : null;

  // Per-model data for the breakdown section
  const modelUsage = usageStats?.model_usage ?? [];
  const maxModelCost = modelUsage.length > 0 ? Math.max(...modelUsage.map((m) => m.cost_usd)) : 0;

  // Cost tracking values
  const monthTotal = costOverview?.month_total ?? 0;
  const monthlyBudget = costOverview?.monthly_budget ?? null;
  const budgetSpendPct =
    monthlyBudget && monthlyBudget > 0 ? Math.min((monthTotal / monthlyBudget) * 100, 100) : 0;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Plan usage limits</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monitor your token, model, and cost usage.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleRefresh()}
          disabled={isRefreshing}
          className="gap-1.5 text-muted-foreground"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {!hasAnyData ? (
        <EmptyUsageState />
      ) : (
        <>
          {/* ── Section 1: Session / period usage ── */}
          {hasTokenData && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-semibold">Current session</h4>
              </div>

              <UsageRow
                label="Token budget"
                sublabel={sessionResetLabel ?? undefined}
                pct={budgetPct}
                detail={`${budget.currentUsage.toLocaleString()} / ${budget.limit.toLocaleString()} tokens used · Est. $${budget.estimatedCost.toFixed(4)}`}
              />

              {/* Input / output breakdown when available */}
              {(budget.inputTokens > 0 || budget.outputTokens > 0) && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="rounded-md bg-muted/50 p-2.5">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                      Input
                    </p>
                    <p className="text-sm font-semibold tabular-nums">
                      {budget.inputTokens.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-muted-foreground">tokens</p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-2.5">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                      Output
                    </p>
                    <p className="text-sm font-semibold tabular-nums">
                      {budget.outputTokens.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-muted-foreground">tokens</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Section 2: Model limits (per-provider breakdown) ── */}
          {hasModelData && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-semibold">Model limits</h4>
              </div>

              <div className="space-y-3">
                {modelUsage.slice(0, 8).map((model) => {
                  const modelPct = maxModelCost > 0 ? (model.cost_usd / maxModelCost) * 100 : 0;
                  return (
                    <ModelRow
                      key={model.model_id}
                      name={model.model_name || model.model_id}
                      tokens={model.total_tokens}
                      cost={model.cost_usd}
                      pct={modelPct}
                    />
                  );
                })}
              </div>

              {modelUsage.length > 8 && (
                <p className="text-xs text-muted-foreground text-right">
                  +{modelUsage.length - 8} more models
                </p>
              )}
            </div>
          )}

          {/* ── Section 3: Cost tracking ── */}
          {hasCostData && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-semibold">Cost tracking</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBudgetInput((v) => !v)}
                  className="text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
                >
                  {showBudgetInput ? 'Cancel' : 'Adjust limit'}
                </button>
              </div>

              {/* Today + month totals */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md bg-muted/50 p-2.5">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                    Today
                  </p>
                  <p className="text-sm font-semibold tabular-nums">
                    ${(costOverview?.today_total ?? 0).toFixed(4)}
                  </p>
                </div>
                <div className="rounded-md bg-muted/50 p-2.5">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                    This month
                  </p>
                  <p className="text-sm font-semibold tabular-nums">${monthTotal.toFixed(4)}</p>
                </div>
              </div>

              {/* Monthly budget bar — only shown when a budget is configured */}
              {monthlyBudget !== null && monthlyBudget > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm">${monthTotal.toFixed(2)} spent</span>
                    <span
                      className={cn(
                        'text-xs font-semibold tabular-nums',
                        textColorClass(budgetSpendPct),
                      )}
                    >
                      {Math.round(budgetSpendPct)}% of ${monthlyBudget.toFixed(2)} limit
                    </span>
                  </div>
                  <Progress
                    value={budgetSpendPct}
                    max={100}
                    className="h-2 bg-secondary"
                    indicatorClassName={cn(
                      'transition-all duration-500',
                      barColorClass(budgetSpendPct),
                    )}
                  />
                  <p className="text-xs text-muted-foreground">
                    ${(costOverview?.remaining_budget ?? 0).toFixed(2)} remaining this month
                  </p>
                </div>
              )}

              {/* Adjust limit input */}
              {showBudgetInput && (
                <div className="pt-1 space-y-2">
                  <label
                    htmlFor="usage-budget-input"
                    className="text-xs font-medium text-foreground"
                  >
                    Monthly spend cap (USD)
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        $
                      </span>
                      <input
                        id="usage-budget-input"
                        type="number"
                        min="0"
                        step="1"
                        value={budgetInputValue}
                        onChange={(e) => setBudgetInputValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleAdjustLimit();
                        }}
                        placeholder={monthlyBudget ? String(monthlyBudget) : '20'}
                        className="h-8 w-full rounded-md border border-input bg-background pl-6 pr-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={() => void handleAdjustLimit()}
                      disabled={isAdjustingBudget || !budgetInputValue}
                      className="h-8 px-3 text-xs"
                    >
                      {isAdjustingBudget ? 'Saving...' : 'Set limit'}
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Enter 0 to remove the monthly limit.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

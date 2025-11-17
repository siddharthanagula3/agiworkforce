// Updated Nov 16, 2025: Added accessible dialogs and React.memo for performance
import { useEffect, useMemo, memo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { Button } from '../ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import { ScrollArea } from '../ui/ScrollArea';
import { Skeleton } from '../ui/Skeleton';
import { useCostStore } from '../../stores/costStore';
import { MODEL_PRESETS, PROVIDER_LABELS, PROVIDERS_IN_ORDER } from '../../constants/llm';
import type { Provider } from '../../stores/settingsStore';
import { usePrompt } from '../ui/PromptDialog';
import { toast } from 'sonner';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const palette = ['#2563eb', '#22c55e', '#f97316', '#a855f7', '#0ea5e9', '#f43f5e'];

function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return '$0.00';
  }
  return currency.format(value);
}

// Updated Nov 16, 2025: Moved outside component to prevent re-creation
const DAY_OPTIONS = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
] as const;

// Updated Nov 16, 2025: Memoized component to prevent unnecessary re-renders
export const CostDashboard = memo(function CostDashboard() {
  const {
    overview,
    analytics,
    filters,
    loadingOverview,
    loadingAnalytics,
    error,
    loadOverview,
    loadAnalytics,
    setMonthlyBudget,
  } = useCostStore((state) => ({
    overview: state.overview,
    analytics: state.analytics,
    filters: state.filters,
    loadingOverview: state.loadingOverview,
    loadingAnalytics: state.loadingAnalytics,
    error: state.error,
    loadOverview: state.loadOverview,
    loadAnalytics: state.loadAnalytics,
    setMonthlyBudget: state.setMonthlyBudget,
  }));

  // Updated Nov 16, 2025: Use accessible dialogs
  const { prompt, dialog: promptDialog } = usePrompt();

  useEffect(() => {
    if (!overview && !loadingOverview) {
      void loadOverview();
    }
    if (!analytics && !loadingAnalytics) {
      void loadAnalytics();
    }
  }, [overview, analytics, loadOverview, loadAnalytics, loadingOverview, loadingAnalytics]);

  const providerOptions = PROVIDERS_IN_ORDER;

  const modelOptions = useMemo(() => {
    if (!filters.provider) {
      return [];
    }
    return MODEL_PRESETS[filters.provider as Provider] ?? [];
  }, [filters.provider]);

  // Updated Nov 16, 2025: Use accessible PromptDialog instead of window.prompt, toast instead of window.alert
  const handleBudgetUpdate = async () => {
    const current = overview?.monthly_budget ?? undefined;
    const input = await prompt({
      title: 'Set Monthly Budget',
      description: 'Set your monthly budget in USD. Leave empty to clear.',
      label: 'Budget (USD)',
      defaultValue: current != null ? String(current) : '',
      placeholder: '100.00',
    });

    if (input === null) {
      return;
    }
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      await setMonthlyBudget(undefined);
      toast.success('Monthly budget cleared');
      return;
    }
    const amount = Number.parseFloat(trimmed);
    if (Number.isNaN(amount) || amount < 0) {
      toast.error('Please enter a valid non-negative number.');
      return;
    }
    await setMonthlyBudget(amount);
    toast.success('Monthly budget updated');
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/10 px-6 py-4">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Cost Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Track AI spend across providers, models, and conversations.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Select
            value={String(filters.days)}
            onValueChange={(value) => void loadAnalytics({ days: Number.parseInt(value, 10) })}
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Date range" />
            </SelectTrigger>
            <SelectContent>
              {DAY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.provider ?? 'all'}
            onValueChange={(value) => {
              if (value === 'all') {
                void loadAnalytics({ provider: '', model: '' });
              } else {
                void loadAnalytics({ provider: value, model: '' });
              }
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All providers</SelectItem>
              {providerOptions.map((provider) => (
                <SelectItem key={provider} value={provider}>
                  {PROVIDER_LABELS[provider]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.model ?? 'all'}
            onValueChange={(value) => {
              if (value === 'all') {
                void loadAnalytics({ model: '' });
              } else {
                void loadAnalytics({ model: value });
              }
            }}
            disabled={!filters.provider}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All models</SelectItem>
              {modelOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={() => void loadAnalytics()}>
            Refresh
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-6 p-6">
          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Today</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {loadingOverview && !overview ? (
                  <Skeleton className="h-7 w-24" />
                ) : (
                  <p className="text-2xl font-semibold text-foreground">
                    {formatCurrency(overview?.today_total)}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Spend recorded since midnight local time.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  This month
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {loadingOverview && !overview ? (
                  <Skeleton className="h-7 w-28" />
                ) : (
                  <p className="text-2xl font-semibold text-foreground">
                    {formatCurrency(overview?.month_total)}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Rolling total from the 1st of the current month.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Monthly budget
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => void handleBudgetUpdate()}>
                  Edit
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {loadingOverview && !overview ? (
                  <Skeleton className="h-7 w-32" />
                ) : (
                  <div>
                    <p className="text-2xl font-semibold text-foreground">
                      {overview?.monthly_budget != null
                        ? formatCurrency(overview.monthly_budget)
                        : 'Not set'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Remaining: {formatCurrency(overview?.remaining_budget ?? null)}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="h-[360px]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Cost over time
                </CardTitle>
              </CardHeader>
              <CardContent className="h-full">
                {loadingAnalytics && !analytics ? (
                  <div className="flex h-full items-center justify-center">
                    <Skeleton className="h-48 w-full" />
                  </div>
                ) : analytics && analytics.timeseries.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analytics.timeseries}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/70" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <YAxis
                        tickFormatter={(value) => `$${value.toFixed(2)}`}
                        tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <RechartsTooltip
                        formatter={(value: number) => formatCurrency(value)}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--background))',
                          borderRadius: '0.5rem',
                          border: '1px solid hsl(var(--border))',
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="total_cost"
                        stroke="#2563eb"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No cost data available for the selected range.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="h-[360px]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Cost by provider
                </CardTitle>
              </CardHeader>
              <CardContent className="h-full">
                {loadingAnalytics && !analytics ? (
                  <div className="flex h-full items-center justify-center">
                    <Skeleton className="h-48 w-full" />
                  </div>
                ) : analytics && analytics.providers.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics.providers}
                        dataKey="total_cost"
                        nameKey="provider"
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={110}
                        paddingAngle={4}
                      >
                        {analytics.providers.map((entry, index) => (
                          <Cell key={entry.provider} fill={palette[index % palette.length]} />
                        ))}
                      </Pie>
                      <Legend />
                      <RechartsTooltip
                        formatter={(value: number) => formatCurrency(value)}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--background))',
                          borderRadius: '0.5rem',
                          border: '1px solid hsl(var(--border))',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No provider spend recorded for this window.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Top conversations by spend
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void loadAnalytics()}
                className="text-xs"
              >
                Refresh
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingAnalytics && !analytics ? (
                <div className="space-y-2">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                </div>
              ) : analytics && analytics.top_conversations.length > 0 ? (
                <div className="overflow-hidden rounded-lg border border-border/60">
                  <table className="min-w-full divide-y divide-border/60 text-sm">
                    <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Conversation</th>
                        <th className="px-4 py-2 text-right font-medium">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 bg-background/80">
                      {analytics.top_conversations.map((conversation) => (
                        <tr key={conversation.conversation_id}>
                          <td className="px-4 py-2">
                            <div className="flex flex-col">
                              <span className="font-medium text-foreground">
                                {conversation.title ||
                                  `Conversation ${conversation.conversation_id}`}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                ID: {conversation.conversation_id}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right font-medium text-foreground">
                            {formatCurrency(conversation.total_cost)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  No conversations have incurred cost during this period.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>

      {/* Updated Nov 16, 2025: Render accessible dialogs */}
      {promptDialog}
    </div>
  );
});

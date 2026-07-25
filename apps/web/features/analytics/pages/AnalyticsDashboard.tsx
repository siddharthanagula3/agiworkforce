'use client';

import { useState, useMemo } from 'react';
import { getProviderDefaultModel } from '@agiworkforce/types';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';
import {
  AlertTriangle,
  BarChart3,
  Zap,
  DollarSign,
  Users,
  Activity,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import ErrorBoundary from '@shared/components/ErrorBoundary';

import { AnalyticsSummaryCard } from '../components/AnalyticsSummaryCard';
import { SimpleBarChart } from '../components/SimpleBarChart';
import { SimpleLineChart } from '../components/SimpleLineChart';
import { ActivityTable, type ActivityRow } from '../components/ActivityTable';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DateRange = '7d' | '30d' | '90d';

// ---------------------------------------------------------------------------
// STB-10 — SAMPLE DATA, NOT WORKSPACE DATA.
//
// Every number this component renders is a hand-written fixture. There is no
// analytics API behind it: no executions, tokens, cost, per-model split, tool
// counts, activity rows, or team members are read from anywhere. The named
// "team leaderboard" entries are invented people.
//
// What changed here:
//   - The `Math.random()` calls are gone. Random values made the fixtures shift
//     on every render, which is precisely what a real feed looks like.
//   - The Refresh button (a 900ms `setTimeout` that toasted "Analytics
//     refreshed") is gone. It refreshed nothing.
//   - The CSV export is gone. Exporting invented figures turns them into a file
//     that outlives the screen that labelled them.
//   - The rendered output now carries a sample-data banner, so the disclaimer
//     survives a screenshot instead of living only in this comment.
//
// Wiring this to real data means replacing `buildAnalyticsSampleData` with an
// API call AND removing the banner + `SAMPLE_DATA` guard below in the same
// change — not one without the other.
// ---------------------------------------------------------------------------

/**
 * Deterministic pseudo-noise in [0, 1) from an integer seed. Fixtures must be
 * stable: a chart that redraws differently each render reads as live telemetry.
 */
function fixtureNoise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function generateUsageTimeSeries(days: number): Array<{ date: string; value: number }> {
  const result: Array<{ date: string; value: number }> = [];
  const now = new Date();
  let base = 420;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const label =
      days <= 7
        ? d.toLocaleDateString('en-US', { weekday: 'short' })
        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    // Slightly noisy upward trend — deterministic in the day offset.
    base = Math.max(50, base + (fixtureNoise(i + 1) - 0.38) * 80);
    result.push({ date: label, value: Math.round(base) });
  }
  return result;
}

function buildAnalyticsSampleData(range: DateRange) {
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const multiplier = days / 7;

  // Summary cards
  const totalExecutions = Math.round(3241 * multiplier);
  const totalTokens = Math.round(48_320_000 * multiplier);
  const totalCost = parseFloat((312.84 * multiplier).toFixed(2));
  const activeUsers = Math.round(42 + multiplier * 3);

  const prevMultiplier = multiplier * 0.85; // previous period was 15% less
  const execChange =
    ((totalExecutions - Math.round(3241 * prevMultiplier)) / Math.round(3241 * prevMultiplier)) *
    100;
  const tokenChange = 18.4;
  const costChange = -6.2;
  const userChange = 8.7;

  // Usage time series
  const usageSeries = generateUsageTimeSeries(days);

  // Model distribution · display labels read from catalog, not hardcoded IDs

  const modelDistribution = [
    {
      label: getProviderDefaultModel('anthropic') ?? 'anthropic-default',
      value: Math.round(1120 * multiplier),
      color: 'bg-indigo-500',
    },
    {
      label: getProviderDefaultModel('openai') ?? 'openai-default',
      value: Math.round(890 * multiplier),
      color: 'bg-emerald-500',
    },
    {
      label: getProviderDefaultModel('google') ?? 'google-default',
      value: Math.round(620 * multiplier),
      color: 'bg-blue-500',
    },
    {
      label: getProviderDefaultModel('deepseek') ?? 'deepseek-default',
      value: Math.round(201 * multiplier),
      color: 'bg-amber-500',
    },
  ];

  // Top tools
  const topTools = [
    { label: 'web_search', value: Math.round(2840 * multiplier), color: 'bg-sky-500' },
    { label: 'code_execute', value: Math.round(2210 * multiplier), color: 'bg-emerald-500' },
    { label: 'file_read', value: Math.round(1980 * multiplier), color: 'bg-violet-500' },
    { label: 'browser_navigate', value: Math.round(1420 * multiplier), color: 'bg-orange-500' },
    { label: 'screenshot', value: Math.round(980 * multiplier), color: 'bg-rose-500' },
    { label: 'email_send', value: Math.round(720 * multiplier), color: 'bg-teal-500' },
  ];

  // Recent activity preview data · display labels read from catalog, not hardcoded IDs

  const agents = ['Research Bot', 'Code Assistant', 'Data Analyst', 'Email Writer', 'SEO Agent'];
  const models = [
    getProviderDefaultModel('anthropic') ?? 'anthropic-default',
    getProviderDefaultModel('openai') ?? 'openai-default',
    getProviderDefaultModel('google') ?? 'google-default',
    getProviderDefaultModel('xai') ?? 'xai-default',
  ];

  const statuses: ActivityRow['status'][] = [
    'success',
    'success',
    'success',
    'failed',
    'running',
    'queued',
  ];
  const taskNames = [
    'Summarize Q1 earnings report',
    'Build React component',
    'Analyze user churn data',
    'Draft partnership email',
    'Research competitor pricing',
    'Generate SEO meta tags',
    'Review pull request',
    'Scrape product listings',
    'Write unit tests',
    'Create slide deck',
    'Translate document to Spanish',
    'Classify support tickets',
    'Optimize SQL query',
    'Deploy to staging',
    'Monitor error rates',
    'Generate image descriptions',
  ];

  const now = Date.now();
  const recentActivity: ActivityRow[] = Array.from({ length: 40 }, (_, i) => ({
    id: `act_${i}`,
    taskName: taskNames[i % taskNames.length]!,
    agent: agents[i % agents.length]!,
    model: models[i % models.length]!,
    status: statuses[i % statuses.length]!,
    durationMs: Math.round(800 + fixtureNoise(i + 101) * 45000),
    cost: parseFloat((fixtureNoise(i + 211) * 0.12).toFixed(6)),
    startedAt: new Date(now - i * 1800000 - fixtureNoise(i + 307) * 600000).toISOString(),
  }));

  // Team leaderboard
  const leaderboard = [
    {
      name: 'Priya S.',
      executions: Math.round(820 * multiplier),
      tokens: Math.round(12_400_000 * multiplier),
      cost: parseFloat((98.4 * multiplier).toFixed(2)),
    },
    {
      name: 'Marcus T.',
      executions: Math.round(640 * multiplier),
      tokens: Math.round(9_800_000 * multiplier),
      cost: parseFloat((76.2 * multiplier).toFixed(2)),
    },
    {
      name: 'Elena K.',
      executions: Math.round(510 * multiplier),
      tokens: Math.round(7_200_000 * multiplier),
      cost: parseFloat((57.8 * multiplier).toFixed(2)),
    },
    {
      name: 'James R.',
      executions: Math.round(390 * multiplier),
      tokens: Math.round(5_900_000 * multiplier),
      cost: parseFloat((44.1 * multiplier).toFixed(2)),
    },
    {
      name: 'Aisha M.',
      executions: Math.round(310 * multiplier),
      tokens: Math.round(4_600_000 * multiplier),
      cost: parseFloat((33.5 * multiplier).toFixed(2)),
    },
    {
      name: 'Lena W.',
      executions: Math.round(240 * multiplier),
      tokens: Math.round(3_300_000 * multiplier),
      cost: parseFloat((24.9 * multiplier).toFixed(2)),
    },
    {
      name: 'David C.',
      executions: Math.round(180 * multiplier),
      tokens: Math.round(2_100_000 * multiplier),
      cost: parseFloat((16.7 * multiplier).toFixed(2)),
    },
  ];

  return {
    totalExecutions,
    totalTokens,
    totalCost,
    activeUsers,
    execChange,
    tokenChange,
    costChange,
    userChange,
    usageSeries,
    modelDistribution,
    topTools,
    recentActivity,
    leaderboard,
  };
}

// STB-10: `downloadAnalyticsCsv()` / `csvValue()` were removed along with the
// Export button. They serialised the fixtures below into `agi-analytics-<range>.csv`
// — invented executions, costs, and named team members — and once a file leaves
// the screen nothing travels with it to say the numbers are not real.

// ---------------------------------------------------------------------------
// Range picker
// ---------------------------------------------------------------------------

interface RangePickerProps {
  value: DateRange;
  onChange: (v: DateRange) => void;
}

function RangePicker({ value, onChange }: RangePickerProps) {
  const options: DateRange[] = ['7d', '30d', '90d'];
  return (
    <div className="flex items-center rounded-lg bg-muted p-1">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={cn(
            'rounded-md px-3 py-1 text-sm transition-colors',
            value === opt
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const AnalyticsDashboard: React.FC = () => {
  const [range, setRange] = useState<DateRange>('30d');

  const data = useMemo(() => buildAnalyticsSampleData(range), [range]);

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return n.toString();
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  return (
    <ErrorBoundary componentName="AnalyticsDashboard" compact>
      <div className="space-y-4 p-4 md:space-y-6 md:p-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold md:text-3xl">Workspace Analytics</h1>
              <Badge variant="destructive" className="uppercase tracking-wide">
                Sample data
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Layout preview for adoption metrics, usage patterns, and task insights.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RangePicker value={range} onChange={setRange} />
          </div>
        </div>

        {/*
          STB-10: the sample-data notice is rendered, not just commented. Every
          figure below — executions, tokens, cost, model split, tool counts,
          activity rows, and the named leaderboard — is a fixture. Delete this
          banner only in the change that wires the real analytics API.
        */}
        <div
          role="note"
          className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>Sample data.</strong> This page is a layout preview — no workspace analytics API
            is connected. The executions, token counts, costs, model split, tool usage, activity
            rows, and team leaderboard names below are illustrative fixtures, not your data. Do not
            use them for reporting or billing.
          </span>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <AnalyticsSummaryCard
            title="Total Executions"
            value={data.totalExecutions.toLocaleString()}
            change={data.execChange}
            trend={data.execChange >= 0 ? 'up' : 'down'}
            icon={Zap}
            subtitle={`vs prev ${range}`}
            iconColor="text-violet-600"
            iconBg="bg-violet-500/10"
          />
          <AnalyticsSummaryCard
            title="Total Tokens"
            value={formatTokens(data.totalTokens)}
            change={data.tokenChange}
            trend="up"
            icon={Activity}
            subtitle={`vs prev ${range}`}
            iconColor="text-blue-600"
            iconBg="bg-blue-500/10"
          />
          <AnalyticsSummaryCard
            title="Total Cost"
            value={formatCurrency(data.totalCost)}
            change={Math.abs(data.costChange)}
            trend="down"
            icon={DollarSign}
            subtitle="cost down · efficiency up"
            iconColor="text-emerald-600"
            iconBg="bg-emerald-500/10"
          />
          <AnalyticsSummaryCard
            title="Active Users"
            value={data.activeUsers}
            change={data.userChange}
            trend="up"
            icon={Users}
            subtitle={`vs prev ${range}`}
            iconColor="text-amber-600"
            iconBg="bg-amber-500/10"
          />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Usage over time · takes 2/3 width on large screens */}
          <Card className="glass-strong lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4 text-primary" />
                Executions Over Time
              </CardTitle>
              <CardDescription>Daily agent task executions in the selected period</CardDescription>
            </CardHeader>
            <CardContent>
              <SimpleLineChart
                data={data.usageSeries}
                height={180}
                color="#6366f1"
                showDots={range === '7d'}
              />
            </CardContent>
          </Card>

          {/* Model distribution */}
          <Card className="glass-strong">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-primary" />
                Model Distribution
              </CardTitle>
              <CardDescription>Executions by LLM provider</CardDescription>
            </CardHeader>
            <CardContent>
              <SimpleBarChart data={data.modelDistribution} />
            </CardContent>
          </Card>
        </div>

        {/* Top tools */}
        <Card className="glass-strong">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" />
              Top Tools Used
            </CardTitle>
            <CardDescription>Most frequently invoked agent tools in the workspace</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
              <SimpleBarChart data={data.topTools.slice(0, 3)} unit=" calls" />
              <SimpleBarChart data={data.topTools.slice(3)} unit=" calls" />
            </div>
          </CardContent>
        </Card>

        {/* Activity table + leaderboard */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Activity table · 2/3 */}
          <Card className="glass-strong lg:col-span-2">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Activity className="h-4 w-4 text-primary" />
                    Recent Activity
                  </CardTitle>
                  <CardDescription>Latest agent executions · sortable by column</CardDescription>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {data.recentActivity.length} executions
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <ActivityTable data={data.recentActivity} pageSize={8} />
            </CardContent>
          </Card>

          {/* Team leaderboard · 1/3 */}
          <Card className="glass-strong">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Trophy className="h-4 w-4 text-amber-500" />
                Team Leaderboard
              </CardTitle>
              <CardDescription>Most active users by executions</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {data.leaderboard.map((member, i) => (
                  <li key={member.name} className="flex items-center gap-3">
                    <span
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                        i === 0
                          ? 'bg-amber-400/20 text-amber-600'
                          : i === 1
                            ? 'bg-zinc-400/20 text-zinc-500'
                            : i === 2
                              ? 'bg-orange-400/20 text-orange-500'
                              : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{member.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {member.executions.toLocaleString()} executions
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-medium tabular-nums">
                        {formatTokens(member.tokens)}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatCurrency(member.cost)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default AnalyticsDashboard;

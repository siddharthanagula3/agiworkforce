/**
 * Dashboard Home Page - Stats & Activity Overview
 * Landing page with usage stats, recent conversations, quick actions, and activity feed.
 * Dark-themed with glassmorphism cards and terra cotta accents.
 */

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorBoundary } from '@shared/components/ErrorBoundary';
import { useAuthStore } from '@shared/stores/authentication-store';
import { useWorkforceStore } from '@shared/stores/workforce-store';
import { supabase } from '@shared/lib/supabase-client';
import { Button } from '@shared/ui/button';
import { Progress } from '@shared/ui/progress';
import { Badge } from '@shared/ui/badge';
import {
  MessageSquare,
  Sparkles,
  Users,
  Image,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  CreditCard,
  Zap,
  Clock,
  TrendingUp,
  Monitor,
  Smartphone,
  Chrome,
  Terminal,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Bot,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { WelcomeBanner } from '@shared/components/dashboard/WelcomeBanner';
import { Skeleton } from '@shared/ui/skeleton';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// Formats a relative time string from an ISO date string
function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

interface RecentConversation {
  id: string;
  title: string;
  updatedAt: string;
}

interface TokenCreditsRow {
  credits_allocated_cents: number;
  credits_used_cents: number;
  credits_remaining_cents: number;
}

/** Row shape for web_conversations (not yet in generated Supabase types). */
interface ConversationRow {
  id: string;
  title: string | null;
  updated_at: string;
  last_message_at: string | null;
}

/** Row shape for web_messages token columns. */
interface TokenUsageRow {
  input_tokens: number | null;
  output_tokens: number | null;
}

// ---------------------------------------------------------------------------
// Control-plane types
// ---------------------------------------------------------------------------

type SurfaceId = 'desktop' | 'mobile' | 'extension' | 'cli';
type SurfaceStatus = 'online' | 'offline' | 'unknown';

interface SurfaceState {
  id: SurfaceId;
  label: string;
  icon: React.ElementType;
  status: SurfaceStatus;
  lastSeen: string | null;
}

interface AgentActivity {
  running: number;
  pendingApprovals: number;
  completedToday: number;
}

interface ProviderHealth {
  name: string;
  status: 'up' | 'degraded' | 'down';
  latencyMs: number | null;
}

interface RecentActivityItem {
  id: string;
  surface: SurfaceId;
  action: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Control-plane hero section
// ---------------------------------------------------------------------------

const STATUS_DOT: Record<SurfaceStatus | 'up' | 'degraded' | 'down', string> = {
  online: 'bg-emerald-400',
  offline: 'bg-red-400',
  unknown: 'bg-amber-400',
  up: 'bg-emerald-400',
  degraded: 'bg-amber-400',
  down: 'bg-red-400',
};

const SURFACE_ICON: Record<SurfaceId, React.ElementType> = {
  desktop: Monitor,
  mobile: Smartphone,
  extension: Chrome,
  cli: Terminal,
};

const SURFACE_LABELS: Record<SurfaceId, string> = {
  desktop: 'Desktop',
  mobile: 'Mobile',
  extension: 'Extension',
  cli: 'CLI',
};

function SurfacePill({ surface }: { surface: SurfaceState }) {
  const Icon = surface.icon;
  const isOnline = surface.status === 'online';
  const isUnknown = surface.status === 'unknown';
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
      <span
        className={
          'h-2 w-2 flex-shrink-0 rounded-full ' +
          STATUS_DOT[surface.status] +
          (isOnline ? ' animate-pulse' : '')
        }
      />
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-xs font-medium">{surface.label}</span>
      {surface.lastSeen && !isOnline && (
        <span className="ml-1 hidden text-[10px] text-muted-foreground/50 sm:inline">
          {formatRelativeTime(surface.lastSeen)}
        </span>
      )}
      {isUnknown && (
        <span className="ml-1 hidden text-[10px] text-amber-400/70 sm:inline">checking…</span>
      )}
    </div>
  );
}

interface ControlPanelHeroProps {
  surfaces: SurfaceState[];
  agentActivity: AgentActivity;
  providers: ProviderHealth[];
  recentActivity: RecentActivityItem[];
  isRefreshing: boolean;
  onRefresh: () => void;
}

function ControlPlaneHero({
  surfaces,
  agentActivity,
  providers,
  recentActivity,
  isRefreshing,
  onRefresh,
}: ControlPanelHeroProps) {
  const onlineSurfaces = surfaces.filter((s) => s.status === 'online').length;
  const providersUp = providers.filter((p) => p.status === 'up').length;
  const allProvidersUp = providersUp === providers.length;

  return (
    <section
      aria-label="System control plane"
      className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 backdrop-blur-xl sm:p-5"
    >
      {/* Header row */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
            <Activity className="h-3.5 w-3.5 text-primary" />
          </div>
          <h2 className="text-sm font-semibold">Control Plane</h2>
          <Badge
            variant="outline"
            className={
              'border-none px-1.5 py-0.5 text-[10px] font-medium ' +
              (onlineSurfaces > 0
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-muted/60 text-muted-foreground')
            }
          >
            {onlineSurfaces}/{surfaces.length} surfaces
          </Badge>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1 text-[11px] text-muted-foreground/60 transition-colors hover:text-muted-foreground"
          aria-label="Refresh control plane status"
        >
          <RefreshCw className={'h-3 w-3 ' + (isRefreshing ? 'animate-spin' : '')} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Connected Surfaces */}
        <div>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
            Connected Surfaces
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {surfaces.map((s) => (
              <SurfacePill key={s.id} surface={s} />
            ))}
          </div>
        </div>

        {/* Agent Activity */}
        <div>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
            Agent Activity
          </p>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
              <div className="flex items-center gap-2">
                <Bot className="h-3.5 w-3.5 text-blue-400" />
                <span className="text-xs text-muted-foreground">Running</span>
              </div>
              <span className="text-sm font-semibold text-blue-400">{agentActivity.running}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-xs text-muted-foreground">Pending Approvals</span>
              </div>
              <span className="text-sm font-semibold text-amber-400">
                {agentActivity.pendingApprovals}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-xs text-muted-foreground">Completed Today</span>
              </div>
              <span className="text-sm font-semibold text-emerald-400">
                {agentActivity.completedToday}
              </span>
            </div>
          </div>
        </div>

        {/* System Health */}
        <div>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
            Model Provider Health
          </p>
          <div className="space-y-1.5">
            {providers.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                <span className="text-xs text-muted-foreground/60">No providers configured</span>
              </div>
            ) : (
              providers.map((p) => (
                <div
                  key={p.name}
                  className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5"
                >
                  <span
                    className={
                      'h-1.5 w-1.5 flex-shrink-0 rounded-full ' +
                      STATUS_DOT[p.status] +
                      (p.status === 'up' ? ' animate-pulse' : '')
                    }
                  />
                  <span className="flex-1 truncate text-xs">{p.name}</span>
                  {p.latencyMs !== null && (
                    <span className="text-[10px] text-muted-foreground/50">{p.latencyMs}ms</span>
                  )}
                  {p.status === 'down' && (
                    <XCircle className="h-3 w-3 flex-shrink-0 text-red-400" />
                  )}
                  {p.status === 'degraded' && (
                    <AlertCircle className="h-3 w-3 flex-shrink-0 text-amber-400" />
                  )}
                </div>
              ))
            )}
            <div
              className={
                'mt-1 flex items-center gap-1.5 px-1 text-[10px] ' +
                (allProvidersUp ? 'text-emerald-400/70' : 'text-amber-400/70')
              }
            >
              {allProvidersUp ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {allProvidersUp
                ? 'All providers operational'
                : `${providersUp}/${providers.length} operational`}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity Feed */}
      {recentActivity.length > 0 && (
        <div className="mt-4 border-t border-white/[0.04] pt-4">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
            Recent Activity
          </p>
          <ul className="space-y-0.5">
            {recentActivity.slice(0, 5).map((item) => {
              const Icon = SURFACE_ICON[item.surface];
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-2.5 rounded-md px-2 py-1 transition-colors hover:bg-white/[0.02]"
                >
                  <Icon className="h-3 w-3 flex-shrink-0 text-muted-foreground/40" />
                  <span className="flex-1 truncate text-xs text-muted-foreground/80">
                    {item.action}
                  </span>
                  <span className="flex-shrink-0 text-[10px] text-muted-foreground/40">
                    {formatRelativeTime(item.timestamp)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

// --- Sub-components ---

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  trend?: string;
  trendUp?: boolean;
  accentColor: string;
  glowColor: string;
}

const StatCard: React.FC<StatCardProps> = ({
  icon: Icon,
  label,
  value,
  trend,
  trendUp,
  accentColor,
  glowColor,
}) => (
  <div
    className={
      'group relative overflow-hidden rounded-xl border border-white/[0.06] ' +
      'bg-white/[0.03] p-5 backdrop-blur-xl ' +
      'transition-all duration-300 hover:border-white/[0.12] hover:bg-white/[0.05]'
    }
  >
    {/* Subtle glow on hover */}
    <div
      className={
        'pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-0 blur-2xl ' +
        'transition-opacity duration-500 group-hover:opacity-100 ' +
        glowColor
      }
    />
    <div className="relative flex items-center justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
          {label}
        </p>
        <p className="mt-1.5 text-2xl font-bold tracking-tight">{value}</p>
        {trend && (
          <div className="mt-1.5 flex items-center gap-1">
            {trendUp ? (
              <ArrowUpRight className="h-3 w-3 text-emerald-400" />
            ) : (
              <ArrowDownRight className="h-3 w-3 text-red-400" />
            )}
            <span
              className={'text-xs font-medium ' + (trendUp ? 'text-emerald-400' : 'text-red-400')}
            >
              {trend}
            </span>
            <span className="text-xs text-muted-foreground/50">vs last month</span>
          </div>
        )}
      </div>
      <div className={'flex h-11 w-11 items-center justify-center rounded-lg ' + accentColor}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
  </div>
);

interface CreditCardProps {
  value: string;
  usedPercent: number;
  label: string;
  icon: React.ElementType;
  accentColor: string;
  glowColor: string;
}

const CreditStatCard: React.FC<CreditCardProps> = ({
  value,
  usedPercent,
  label,
  icon: Icon,
  accentColor,
  glowColor,
}) => (
  <div
    className={
      'group relative overflow-hidden rounded-xl border border-white/[0.06] ' +
      'bg-white/[0.03] p-5 backdrop-blur-xl ' +
      'transition-all duration-300 hover:border-white/[0.12] hover:bg-white/[0.05]'
    }
  >
    <div
      className={
        'pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-0 blur-2xl ' +
        'transition-opacity duration-500 group-hover:opacity-100 ' +
        glowColor
      }
    />
    <div className="relative">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
            {label}
          </p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight">{value}</p>
        </div>
        <div className={'flex h-11 w-11 items-center justify-center rounded-lg ' + accentColor}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] font-medium text-muted-foreground/60">
            {usedPercent}% used
          </span>
          <span className="text-[10px] font-medium text-muted-foreground/60">
            {100 - usedPercent}% remaining
          </span>
        </div>
        <Progress
          value={usedPercent}
          className="h-1.5 bg-white/[0.06]"
          indicatorClassName="bg-gradient-to-r from-emerald-500 to-teal-400"
          aria-label="Credit usage"
        />
      </div>
    </div>
  </div>
);

interface QuickActionCardProps {
  icon: React.ElementType;
  label: string;
  description: string;
  href: string;
  accentColor: string;
}

const QuickActionCard: React.FC<QuickActionCardProps> = ({
  icon: Icon,
  label,
  description,
  href,
  accentColor,
}) => {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(href)}
      className={
        'group relative flex w-full items-start gap-4 overflow-hidden rounded-xl ' +
        'border border-white/[0.06] bg-white/[0.03] p-5 text-left backdrop-blur-xl ' +
        'transition-all duration-300 hover:border-white/[0.12] hover:bg-white/[0.05]'
      }
    >
      <div
        className={
          'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ' +
          'transition-transform duration-300 group-hover:scale-110 ' +
          accentColor
        }
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground/70">{description}</p>
      </div>
      <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground/40 transition-transform duration-300 group-hover:translate-x-1" />
    </button>
  );
};

// ---------------------------------------------------------------------------
// Default control-plane surface states (static while no real-time connection)
// ---------------------------------------------------------------------------

const DEFAULT_SURFACES: SurfaceState[] = [
  { id: 'desktop', label: 'Desktop', icon: Monitor, status: 'unknown', lastSeen: null },
  { id: 'mobile', label: 'Mobile', icon: Smartphone, status: 'unknown', lastSeen: null },
  { id: 'extension', label: 'Extension', icon: Chrome, status: 'unknown', lastSeen: null },
  { id: 'cli', label: 'CLI', icon: Terminal, status: 'unknown', lastSeen: null },
];

const DEFAULT_PROVIDERS: ProviderHealth[] = [
  { name: 'Anthropic', status: 'up', latencyMs: null },
  { name: 'OpenAI', status: 'up', latencyMs: null },
  { name: 'Google', status: 'up', latencyMs: null },
];

// --- Main Page ---

export const DashboardHomePage: React.FC = () => {
  const router = useRouter();
  const { user } = useAuthStore();
  const { hiredEmployees, fetchHiredEmployees } = useWorkforceStore();

  // Real: recent conversations from Supabase web_conversations table
  const [recentConversations, setRecentConversations] = useState<RecentConversation[]>([]);
  const [convoLoading, setConvoLoading] = useState(true);

  // Real: credit balance from Supabase token_credits table
  const [tokenCredits, setTokenCredits] = useState<TokenCreditsRow | null>(null);

  // Real: aggregated token usage from web_messages
  const [totalTokens, setTotalTokens] = useState<number>(0);

  // Real: count of web_conversations created in last 7 days
  const [weeklySessionCount, setWeeklySessionCount] = useState<number>(0);

  // Control-plane state
  const [surfaces, setSurfaces] = useState<SurfaceState[]>(DEFAULT_SURFACES);
  const [agentActivity, setAgentActivity] = useState<AgentActivity>({
    running: 0,
    pendingApprovals: 0,
    completedToday: 0,
  });
  const [providers, setProviders] = useState<ProviderHealth[]>(DEFAULT_PROVIDERS);
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const displayName = user?.name || user?.email?.split('@')[0] || 'there';

  // Fetch control-plane status from the API gateway heartbeat endpoint
  const fetchControlPlane = useCallback(async () => {
    if (!user) return;
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/control-plane/status', {
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          surfaces?: Array<{
            id: SurfaceId;
            status: SurfaceStatus;
            lastSeen: string | null;
          }>;
          agents?: { running: number; pendingApprovals: number; completedToday: number };
          providers?: Array<{
            name: string;
            status: 'up' | 'degraded' | 'down';
            latencyMs: number | null;
          }>;
          recentActivity?: RecentActivityItem[];
        };
        if (json.surfaces) {
          setSurfaces(
            json.surfaces.map((s) => ({
              ...s,
              label: SURFACE_LABELS[s.id] ?? s.id,
              icon: SURFACE_ICON[s.id] ?? Monitor,
            })),
          );
        }
        if (json.agents) setAgentActivity(json.agents);
        if (json.providers) setProviders(json.providers);
        if (json.recentActivity) setRecentActivity(json.recentActivity);
      }
    } catch {
      // API not available yet — keep default unknown states
    } finally {
      setIsRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    // Fetch hired employees for "Active Skills" stat
    fetchHiredEmployees();

    // Fetch control plane status
    fetchControlPlane();

    // web_conversations and token_credits are not in the generated Supabase types yet,
    // so we cast the client to an untyped SupabaseClient for these queries.
    const untypedClient = supabase as unknown as import('@supabase/supabase-js').SupabaseClient;

    // Fetch 5 most recent non-deleted conversations
    const fetchConversations = async () => {
      setConvoLoading(true);
      try {
        const { data, error } = await untypedClient
          .from('web_conversations')
          .select('id, title, updated_at, last_message_at')
          .eq('user_id', user.id)
          .is('deleted_at', null)
          .order('updated_at', { ascending: false })
          .limit(5);

        if (!error && data) {
          setRecentConversations(
            (data as ConversationRow[]).map((row) => ({
              id: row.id,
              title: row.title || 'Untitled conversation',
              updatedAt: row.last_message_at || row.updated_at,
            })),
          );
        }
      } finally {
        setConvoLoading(false);
      }
    };

    // Fetch current period token credits
    const fetchCredits = async () => {
      const { data } = await untypedClient
        .from('token_credits')
        .select('credits_allocated_cents, credits_used_cents, credits_remaining_cents')
        .eq('user_id', user.id)
        .order('period_end', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setTokenCredits(data as TokenCreditsRow);
      }
    };

    // Fetch total tokens used (aggregate input_tokens + output_tokens from web_messages)
    const fetchTokens = async () => {
      try {
        const { data: tokenData } = await untypedClient
          .from('web_messages')
          .select('input_tokens, output_tokens')
          .eq('user_id', user.id);

        if (tokenData) {
          const total = (tokenData as TokenUsageRow[]).reduce(
            (sum: number, msg: TokenUsageRow) =>
              sum + (msg.input_tokens || 0) + (msg.output_tokens || 0),
            0,
          );
          setTotalTokens(total);
        }
      } catch {
        // Table may not exist yet — silently fall back to 0
      }
    };

    // Fetch sessions created in the last 7 days
    const fetchWeeklySessions = async () => {
      try {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const { count } = await untypedClient
          .from('web_conversations')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('created_at', weekAgo.toISOString());

        setWeeklySessionCount(count || 0);
      } catch {
        // Table may not exist yet — silently fall back to 0
      }
    };

    fetchConversations();
    fetchCredits();
    fetchTokens();
    fetchWeeklySessions();
  }, [user, fetchHiredEmployees, fetchControlPlane]);

  // Web surface heartbeat — upserts every 60 s while the dashboard is mounted
  useEffect(() => {
    if (!user?.id) return;

    const userId = user.id;
    const HEARTBEAT_INTERVAL_MS = 60_000;

    const sendHeartbeat = async () => {
      try {
        const untypedClient = supabase as unknown as import('@supabase/supabase-js').SupabaseClient;
        await untypedClient.from('surface_heartbeats').upsert(
          {
            user_id: userId,
            surface_id: 'web',
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,surface_id' },
        );
      } catch {
        // Non-fatal — table may not be migrated in all envs yet
      }
    };

    void sendHeartbeat();
    const intervalId = setInterval(() => void sendHeartbeat(), HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [user?.id]);

  // Derive credit display values
  const creditsRemainingDollars = tokenCredits
    ? (tokenCredits.credits_remaining_cents / 100).toFixed(2)
    : null;
  const creditsUsedPercent =
    tokenCredits && tokenCredits.credits_allocated_cents > 0
      ? Math.round((tokenCredits.credits_used_cents / tokenCredits.credits_allocated_cents) * 100)
      : null;

  return (
    <div className="animate-fade-in-up space-y-6 px-4 py-4 sm:space-y-8 sm:px-6 sm:py-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {getGreeting()},{' '}
          <span className="bg-gradient-to-r from-terra-cotta-300 to-terra-cotta-500 bg-clip-text text-transparent">
            {displayName}
          </span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground/70">
          Here&apos;s your workspace overview for today.
        </p>
      </div>

      {/* First-run welcome banner — persisted in localStorage, auto-hides when done */}
      <WelcomeBanner displayName={displayName} />

      {/* Control-Plane Hero — cross-surface operational status */}
      <ControlPlaneHero
        surfaces={surfaces}
        agentActivity={agentActivity}
        providers={providers}
        recentActivity={recentActivity}
        isRefreshing={isRefreshing}
        onRefresh={fetchControlPlane}
      />

      {/* Stats Cards Grid */}
      <section aria-label="Usage statistics">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Zap}
            label="Tokens Used"
            value={totalTokens > 0 ? totalTokens.toLocaleString() : '0'}
            accentColor="bg-amber-500/10 text-amber-400"
            glowColor="bg-amber-500/20"
          />
          <CreditStatCard
            icon={CreditCard}
            label="Credits Remaining"
            value={creditsRemainingDollars !== null ? `$${creditsRemainingDollars}` : '—'}
            usedPercent={creditsUsedPercent ?? 0}
            accentColor="bg-emerald-500/10 text-emerald-400"
            glowColor="bg-emerald-500/20"
          />
          <StatCard
            icon={Activity}
            label="Active Skills"
            value={String(hiredEmployees.length)}
            accentColor="bg-blue-500/10 text-blue-400"
            glowColor="bg-blue-500/20"
          />
          <StatCard
            icon={TrendingUp}
            label="Sessions This Week"
            value={weeklySessionCount.toString()}
            accentColor="bg-purple-500/10 text-purple-400"
            glowColor="bg-purple-500/20"
          />
        </div>
      </section>

      {/* Two-column layout: Conversations + Quick Actions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Conversations — 2/3 width */}
        <section className="lg:col-span-2" aria-label="Recent conversations">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent Conversations</h2>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => router.push('/chat')}
            >
              View all
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
          <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl">
            {convoLoading ? (
              <div
                className="divide-y divide-white/[0.04]"
                aria-busy="true"
                aria-label="Loading conversations"
              >
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3.5">
                    <Skeleton className="h-4 w-4 flex-shrink-0 rounded bg-white/[0.06]" />
                    <Skeleton
                      className="h-3.5 flex-1 rounded bg-white/[0.06]"
                      style={{ maxWidth: `${60 + (i % 3) * 15}%` }}
                    />
                    <Skeleton className="hidden h-3 w-14 rounded bg-white/[0.06] sm:block" />
                  </div>
                ))}
              </div>
            ) : recentConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <MessageSquare className="mb-3 h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm font-medium text-muted-foreground/60">No conversations yet</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3 text-terra-cotta-400 hover:text-terra-cotta-300"
                  onClick={() => router.push('/chat')}
                >
                  Start your first chat
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-white/[0.04]">
                {recentConversations.map((convo) => (
                  <li key={convo.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-white/[0.03]"
                      onClick={() => router.push(`/chat/${convo.id}`)}
                    >
                      <MessageSquare className="h-4 w-4 flex-shrink-0 text-muted-foreground/50" />
                      <span className="flex-1 truncate text-sm">{convo.title}</span>
                      <div className="hidden items-center gap-1 text-muted-foreground/40 sm:flex">
                        <Clock className="h-3 w-3" />
                        <span className="text-xs">{formatRelativeTime(convo.updatedAt)}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Hired Skills summary — 1/3 width */}
        <section aria-label="Hired skills">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Your Skills</h2>
            <Sparkles className="h-4 w-4 text-muted-foreground/30" />
          </div>
          <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl">
            {hiredEmployees.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-5 text-center">
                <Users className="mb-3 h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm font-medium text-muted-foreground/60">No skills hired yet</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => router.push('/chat')}
                >
                  Browse skills
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-white/[0.04]">
                {hiredEmployees.slice(0, 5).map((emp) => (
                  <li key={emp.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-primary/10">
                      <Users className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <span className="flex-1 truncate text-sm">
                      {emp.employee_name || emp.employee_id}
                    </span>
                  </li>
                ))}
                {hiredEmployees.length > 5 && (
                  <li className="px-5 py-2.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => router.push('/chat')}
                    >
                      +{hiredEmployees.length - 5} more
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                  </li>
                )}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* Quick Actions */}
      <section aria-label="Quick actions">
        <h2 className="mb-4 text-lg font-semibold">Quick Actions</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickActionCard
            icon={MessageSquare}
            label="New Chat"
            description="Start a conversation with any AI model"
            href="/chat"
            accentColor="bg-terra-cotta/10 text-terra-cotta-300"
          />
          <QuickActionCard
            icon={Zap}
            label="Open VIBE"
            description="Visual IDE and build environment"
            href="/chat"
            accentColor="bg-amber-500/10 text-amber-400"
          />
          <QuickActionCard
            icon={Users}
            label="Browse Skills"
            description="AI specialists for any task"
            href="/chat"
            accentColor="bg-blue-500/10 text-blue-400"
          />
          <QuickActionCard
            icon={Image}
            label="Media Studio"
            description="Generate images, video, and audio"
            href="/chat"
            accentColor="bg-pink-500/10 text-pink-400"
          />
        </div>
      </section>
    </div>
  );
};

const DashboardHomePageWithErrorBoundary: React.FC = () => (
  <ErrorBoundary componentName="DashboardHomePage" showReportDialog>
    <DashboardHomePage />
  </ErrorBoundary>
);

export default DashboardHomePageWithErrorBoundary;

/* eslint-disable @typescript-eslint/no-explicit-any -- supabase client type bridge and dynamic query results */
/**
 * Dashboard Home Page - Stats & Activity Overview
 * Landing page with usage stats, recent conversations, quick actions, and activity feed.
 * Dark-themed with glassmorphism cards and terra cotta accents.
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorBoundary } from '@shared/components/ErrorBoundary';
import { useAuthStore } from '@shared/stores/authentication-store';
import { useWorkforceStore } from '@shared/stores/workforce-store';
import { supabase } from '@shared/lib/supabase-client';
import { Button } from '@shared/ui/button';
import { Progress } from '@shared/ui/progress';
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
} from 'lucide-react';

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

  // TODO: tokensUsed (aggregate of web_messages.input_tokens + output_tokens) and
  //       sessionsThisWeek (count of web_conversations created in last 7 days) have no
  //       dedicated summary table. Wire up when a usage-summary view or edge function is added.

  const displayName = user?.name || user?.email?.split('@')[0] || 'there';

  useEffect(() => {
    if (!user) return;

    // Fetch hired employees for "Active Skills" stat
    fetchHiredEmployees();

    // web_conversations and token_credits are not in the generated Supabase types yet,
    // so we cast the client to `any` for these queries.

    const untypedClient = supabase as any;

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
            (data as any[]).map((row: any) => ({
              id: row.id as string,
              title: (row.title as string) || 'Untitled conversation',
              updatedAt: (row.last_message_at || row.updated_at) as string,
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

    fetchConversations();
    fetchCredits();
  }, [user, fetchHiredEmployees]);

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

      {/* Stats Cards Grid */}
      <section aria-label="Usage statistics">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* TODO: Wire tokensUsed to aggregate of web_messages.input_tokens+output_tokens */}
          <StatCard
            icon={Zap}
            label="Tokens Used"
            value="—"
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
          {/* TODO: Wire sessionsThisWeek to count of web_conversations in last 7 days */}
          <StatCard
            icon={TrendingUp}
            label="Sessions This Week"
            value="—"
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
              <div className="flex flex-col items-center justify-center py-12">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
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
                  onClick={() => router.push('/dashboard/hire')}
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
                      onClick={() => router.push('/dashboard/agents')}
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
            href="/dashboard/vibe"
            accentColor="bg-amber-500/10 text-amber-400"
          />
          <QuickActionCard
            icon={Users}
            label="Browse Skills"
            description="AI specialists for any task"
            href="/dashboard/hire"
            accentColor="bg-blue-500/10 text-blue-400"
          />
          <QuickActionCard
            icon={Image}
            label="Media Studio"
            description="Generate images, video, and audio"
            href="/dashboard/media"
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

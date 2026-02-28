/**
 * Dashboard Home Page - Stats & Activity Overview
 * Landing page with usage stats, recent conversations, quick actions, and activity feed.
 * Dark-themed with glassmorphism cards and terra cotta accents.
 */

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ErrorBoundary } from '@shared/components/ErrorBoundary';
import { useAuthStore } from '@shared/stores/authentication-store';
import { Button } from '@shared/ui/button';
import { Badge } from '@shared/ui/badge';
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
  Bot,
  Code,
  FileText,
  Palette,
} from 'lucide-react';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// --- Mock Data ---

const MOCK_STATS = {
  tokensUsed: { value: '12.4k', trend: '+18%', up: true },
  creditsRemaining: { value: '$4.50', used: 55, total: 10 },
  activeAgents: { value: '5', trend: '+2', up: true },
  sessionsThisWeek: { value: '23', trend: '-3', up: false },
};

const MOCK_RECENT_CONVERSATIONS = [
  {
    id: '1',
    title: 'Market research for Q2 strategy',
    updatedAt: '2 hours ago',
    status: 'completed' as const,
  },
  {
    id: '2',
    title: 'Code review: auth module refactor',
    updatedAt: '1 day ago',
    status: 'completed' as const,
  },
  {
    id: '3',
    title: 'Blog draft: AI trends in 2026',
    updatedAt: '2 days ago',
    status: 'completed' as const,
  },
  {
    id: '4',
    title: 'Email campaign copy for launch',
    updatedAt: '3 days ago',
    status: 'completed' as const,
  },
  {
    id: '5',
    title: 'React component architecture review',
    updatedAt: '4 days ago',
    status: 'completed' as const,
  },
];

const MOCK_ACTIVITY = [
  { id: '1', text: 'Generated 3 product images', time: '30 min ago', icon: Palette },
  { id: '2', text: 'Completed code review session', time: '2 hours ago', icon: Code },
  { id: '3', text: 'Created marketing brief document', time: '5 hours ago', icon: FileText },
  { id: '4', text: 'Deployed agent for data analysis', time: '1 day ago', icon: Bot },
];

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

const statusColors: Record<string, string> = {
  active: 'bg-emerald-400',
  completed: 'bg-blue-400',
  paused: 'bg-amber-400',
};

// --- Main Page ---

export const DashboardHomePage: React.FC = () => {
  const router = useRouter();
  const { user } = useAuthStore();

  const displayName = user?.name || user?.email?.split('@')[0] || 'there';

  return (
    <div className="animate-fade-in-up space-y-8 py-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
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
          <StatCard
            icon={Zap}
            label="Tokens Used"
            value={MOCK_STATS.tokensUsed.value}
            trend={MOCK_STATS.tokensUsed.trend}
            trendUp={MOCK_STATS.tokensUsed.up}
            accentColor="bg-amber-500/10 text-amber-400"
            glowColor="bg-amber-500/20"
          />
          <CreditStatCard
            icon={CreditCard}
            label="Credits Remaining"
            value={MOCK_STATS.creditsRemaining.value}
            usedPercent={MOCK_STATS.creditsRemaining.used}
            accentColor="bg-emerald-500/10 text-emerald-400"
            glowColor="bg-emerald-500/20"
          />
          <StatCard
            icon={Activity}
            label="Active Skills"
            value={MOCK_STATS.activeAgents.value}
            trend={MOCK_STATS.activeAgents.trend}
            trendUp={MOCK_STATS.activeAgents.up}
            accentColor="bg-blue-500/10 text-blue-400"
            glowColor="bg-blue-500/20"
          />
          <StatCard
            icon={TrendingUp}
            label="Sessions This Week"
            value={MOCK_STATS.sessionsThisWeek.value}
            trend={MOCK_STATS.sessionsThisWeek.trend}
            trendUp={MOCK_STATS.sessionsThisWeek.up}
            accentColor="bg-purple-500/10 text-purple-400"
            glowColor="bg-purple-500/20"
          />
        </div>
      </section>

      {/* Two-column layout: Conversations + Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Conversations — 2/3 width */}
        <section className="lg:col-span-2" aria-label="Recent conversations">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Recent Conversations</h2>
              <Badge
                variant="outline"
                className="border-white/[0.08] text-[10px] text-muted-foreground/50"
              >
                Sample
              </Badge>
            </div>
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
            {MOCK_RECENT_CONVERSATIONS.length === 0 ? (
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
                {MOCK_RECENT_CONVERSATIONS.map((convo) => (
                  <li key={convo.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-white/[0.03]"
                      onClick={() => router.push(`/chat/${convo.id}`)}
                    >
                      <div className="relative flex-shrink-0">
                        <MessageSquare className="h-4 w-4 text-muted-foreground/50" />
                        <div
                          className={
                            'absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-background ' +
                            (statusColors[convo.status] || 'bg-gray-400')
                          }
                        />
                      </div>
                      <span className="flex-1 truncate text-sm">{convo.title}</span>
                      <div className="flex items-center gap-1 text-muted-foreground/40">
                        <Clock className="h-3 w-3" />
                        <span className="text-xs">{convo.updatedAt}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Activity Feed — 1/3 width */}
        <section aria-label="Recent activity">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Activity</h2>
            <Sparkles className="h-4 w-4 text-muted-foreground/30" />
          </div>
          <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl">
            <ul className="divide-y divide-white/[0.04]">
              {MOCK_ACTIVITY.map((item) => {
                const ActivityIcon = item.icon;
                return (
                  <li key={item.id} className="flex items-start gap-3 px-5 py-3.5">
                    <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-white/[0.05]">
                      <ActivityIcon className="h-3.5 w-3.5 text-muted-foreground/60" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug">{item.text}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground/40">{item.time}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
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

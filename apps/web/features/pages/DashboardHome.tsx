/**
 * Dashboard Home Page - Stats & Overview
 * A clean landing page with stats, recent conversations, and quick actions.
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import { ErrorBoundary } from '@shared/components/ErrorBoundary';
import { useAuthStore } from '@shared/stores/authentication-store';
import { Card, CardContent } from '@shared/ui/card';
import { Button } from '@shared/ui/button';
import { Badge } from '@shared/ui/badge';
import {
  MessageSquare,
  Sparkles,
  Users,
  Image,
  ArrowRight,
  Activity,
  CreditCard,
  Zap,
} from 'lucide-react';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// Sample data — replace with real conversation history from API
const MOCK_RECENT_CONVERSATIONS = [
  { id: '1', title: 'TypeScript refactoring help', updatedAt: '2 hours ago' },
  { id: '2', title: 'Marketing copy for landing page', updatedAt: '5 hours ago' },
  { id: '3', title: 'Python data analysis script', updatedAt: 'Yesterday' },
  { id: '4', title: 'Email template for outreach', updatedAt: '2 days ago' },
  { id: '5', title: 'React component architecture', updatedAt: '3 days ago' },
];

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  iconColor: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon: Icon, label, value, iconColor }) => (
  <Card>
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconColor}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </CardContent>
  </Card>
);

interface QuickActionProps {
  icon: React.ElementType;
  label: string;
  description: string;
  href: string;
  iconColor: string;
}

const QuickAction: React.FC<QuickActionProps> = ({
  icon: Icon,
  label,
  description,
  href,
  iconColor,
}) => {
  const router = useRouter();
  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-accent"
      onClick={() => router.push(href)}
    >
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div
            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${iconColor}`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{label}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          </div>
          <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
};

export const DashboardHomePage: React.FC = () => {
  const router = useRouter();
  const { user } = useAuthStore();

  const displayName = user?.name || user?.email?.split('@')[0] || 'there';

  return (
    <div className="space-y-8 py-6">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {getGreeting()}, {displayName}
        </h1>
        <p className="mt-1 text-muted-foreground">
          Here&apos;s what&apos;s happening with your workspace today.
        </p>
      </div>

      {/* Stats Cards */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">Overview</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Zap}
            label="Token Usage"
            value="24.5k"
            iconColor="bg-yellow-500/10 text-yellow-500"
          />
          <StatCard
            icon={CreditCard}
            label="Credits Remaining"
            value="$12.40"
            iconColor="bg-green-500/10 text-green-500"
          />
          <StatCard
            icon={Activity}
            label="Active Conversations"
            value="3"
            iconColor="bg-blue-500/10 text-blue-500"
          />
          <StatCard
            icon={Sparkles}
            label="Tasks Completed"
            value="142"
            iconColor="bg-purple-500/10 text-purple-500"
          />
        </div>
      </div>

      {/* Recent Conversations */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Recent Conversations</h2>
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Sample
            </Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={() => router.push('/chat')}>
            View all
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {MOCK_RECENT_CONVERSATIONS.map((convo) => (
                <li key={convo.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-6 py-4 text-left transition-colors hover:bg-accent"
                    onClick={() => router.push(`/chat/${convo.id}`)}
                  >
                    <MessageSquare className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate text-sm font-medium">{convo.title}</span>
                    <Badge variant="secondary" className="flex-shrink-0 text-xs font-normal">
                      {convo.updatedAt}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">Quick Actions</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <QuickAction
            icon={MessageSquare}
            label="New Chat"
            description="Start a new conversation with an AI model"
            href="/chat"
            iconColor="bg-primary/10 text-primary"
          />
          <QuickAction
            icon={Zap}
            label="Open VIBE"
            description="Launch the visual IDE and build environment"
            href="/dashboard/vibe"
            iconColor="bg-yellow-500/10 text-yellow-500"
          />
          <QuickAction
            icon={Users}
            label="Browse Skills"
            description="Hire AI specialists for your tasks"
            href="/dashboard/hire"
            iconColor="bg-blue-500/10 text-blue-500"
          />
          <QuickAction
            icon={Image}
            label="Media Studio"
            description="Generate images, video, and audio with AI"
            href="/dashboard/media"
            iconColor="bg-pink-500/10 text-pink-500"
          />
        </div>
      </div>
    </div>
  );
};

const DashboardHomePageWithErrorBoundary: React.FC = () => (
  <ErrorBoundary componentName="DashboardHomePage" showReportDialog>
    <DashboardHomePage />
  </ErrorBoundary>
);

export default DashboardHomePageWithErrorBoundary;

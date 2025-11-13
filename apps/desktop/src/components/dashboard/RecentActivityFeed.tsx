/**
 * RecentActivityFeed Component
 * Live activity stream showing recent automation runs and events
 */

import { formatDistanceToNow } from 'date-fns';
import { Zap, UserPlus, Trophy, CheckCircle2, XCircle, AlertCircle, Clock, DollarSign } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { ScrollArea } from '../ui/ScrollArea';
import { Badge } from '../ui/Badge';
import { cn } from '../../lib/utils';
import type { ActivityItem } from '../../types/roi';

interface ActivityIconProps {
  type: ActivityItem['type'];
  status?: ActivityItem['status'];
}

function ActivityIcon({ type, status }: ActivityIconProps) {
  let Icon = Zap;
  let colorClass = 'text-primary bg-primary/10';

  if (type === 'employee_hired') {
    Icon = UserPlus;
    colorClass = 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-950';
  } else if (type === 'milestone_achieved') {
    Icon = Trophy;
    colorClass = 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-950';
  } else if (type === 'goal_completed') {
    Icon = CheckCircle2;
    colorClass = 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-950';
  } else if (type === 'automation_run' && status === 'failed') {
    Icon = XCircle;
    colorClass = 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-950';
  } else if (type === 'automation_run' && status === 'partial') {
    Icon = AlertCircle;
    colorClass = 'text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-950';
  }

  return (
    <div className={cn('p-2 rounded-lg', colorClass)}>
      <Icon className="h-4 w-4" />
    </div>
  );
}

interface ActivityItemComponentProps {
  activity: ActivityItem;
}

function ActivityItemComponent({ activity }: ActivityItemComponentProps) {
  const formatTime = (minutes: number): string => {
    if (minutes < 60) {
      return `${minutes}m`;
    }
    return `${(minutes / 60).toFixed(1)}h`;
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return null;

    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      success: 'default',
      failed: 'destructive',
      partial: 'secondary',
    };

    return (
      <Badge variant={variants[status] || 'outline'} className="text-xs">
        {status}
      </Badge>
    );
  };

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
      <ActivityIcon type={activity.type} status={activity.status} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-sm font-medium truncate">{activity.title}</p>
          {activity.status && getStatusBadge(activity.status)}
        </div>

        <p className="text-xs text-muted-foreground mb-2">{activity.description}</p>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{formatDistanceToNow(activity.timestamp, { addSuffix: true })}</span>

          {activity.timeSavedMinutes !== undefined && activity.timeSavedMinutes > 0 && (
            <>
              <span className="text-muted-foreground/50">•</span>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{formatTime(activity.timeSavedMinutes)} saved</span>
              </div>
            </>
          )}

          {activity.costSavedUsd !== undefined && activity.costSavedUsd > 0 && (
            <>
              <span className="text-muted-foreground/50">•</span>
              <div className="flex items-center gap-1 text-green-600 dark:text-green-500">
                <DollarSign className="h-3 w-3" />
                <span>{formatCurrency(activity.costSavedUsd)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface RecentActivityFeedProps {
  activities: ActivityItem[];
  loading?: boolean;
}

export function RecentActivityFeed({ activities, loading = false }: RecentActivityFeedProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>Last 24 hours</CardDescription>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-96">
            <div className="animate-pulse text-muted-foreground">Loading activity...</div>
          </div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
            <Zap className="h-12 w-12 mb-2 opacity-50" />
            <p>No recent activity</p>
            <p className="text-xs mt-1">Activity will appear here as automations run</p>
          </div>
        ) : (
          <ScrollArea className="h-96">
            <div className="space-y-2">
              {activities.map((activity) => (
                <ActivityItemComponent key={activity.id} activity={activity} />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

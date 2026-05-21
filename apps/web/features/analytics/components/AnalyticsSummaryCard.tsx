'use client';

import { Card, CardContent } from '@shared/ui/card';
import { cn } from '@shared/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface AnalyticsSummaryCardProps {
  title: string;
  value: string | number;
  change?: number; // percentage change
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  subtitle?: string;
  iconColor?: string;
  iconBg?: string;
}

export function AnalyticsSummaryCard({
  title,
  value,
  change,
  icon: Icon,
  trend = 'neutral',
  subtitle,
  iconColor = 'text-primary',
  iconBg = 'bg-primary/10',
}: AnalyticsSummaryCardProps) {
  const trendColor =
    trend === 'up'
      ? 'text-emerald-600 dark:text-emerald-400'
      : trend === 'down'
        ? 'text-red-600 dark:text-red-400'
        : 'text-muted-foreground';

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  return (
    <Card className="glass-strong card-hover">
      <CardContent className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', iconBg)}>
            <Icon className={cn('h-5 w-5', iconColor)} />
          </div>
          {typeof change !== 'undefined' && (
            <span className={cn('flex items-center gap-1 text-xs font-medium', trendColor)}>
              <TrendIcon className="h-3 w-3" />
              {Math.abs(change).toFixed(1)}%
            </span>
          )}
        </div>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        <p className="mt-0.5 text-sm font-medium text-muted-foreground">{title}</p>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

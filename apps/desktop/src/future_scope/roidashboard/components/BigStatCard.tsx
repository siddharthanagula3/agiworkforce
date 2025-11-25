/**
 * BigStatCard Component
 * Large, animated stat cards for displaying key metrics
 */

import { type LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { cn } from '../../lib/utils';

interface BigStatCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: LucideIcon;
  iconColor?: string;
  loading?: boolean;
}

export function BigStatCard({
  title,
  value,
  change,
  icon: Icon,
  iconColor = 'text-primary',
  loading = false,
}: BigStatCardProps) {
  return (
    <Card className="relative overflow-hidden group transition-all duration-200 hover:shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={cn('h-4 w-4', iconColor)} />
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="animate-pulse">
            <div className="h-9 bg-muted rounded w-3/4 mb-2" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        ) : (
          <>
            <div className="text-3xl font-bold mb-1">{value}</div>

            {change !== undefined && (
              <div
                className={cn(
                  'flex items-center text-sm font-medium',
                  change > 0 ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500',
                  change === 0 && 'text-muted-foreground'
                )}
              >
                {change > 0 ? (
                  <TrendingUp className="h-4 w-4 mr-1" />
                ) : change < 0 ? (
                  <TrendingDown className="h-4 w-4 mr-1" />
                ) : null}
                <span>
                  {change > 0 ? '+' : ''}
                  {change.toFixed(1)}% from yesterday
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>

      {/* Animated background pulse on hover */}
      <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

      {/* Subtle gradient overlay */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/50 via-primary to-primary/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    </Card>
  );
}

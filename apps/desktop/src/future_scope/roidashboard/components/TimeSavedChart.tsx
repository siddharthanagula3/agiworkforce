/**
 * TimeSavedChart Component
 * Beautiful area chart showing time saved over time
 */

import { format, parseISO } from 'date-fns';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/Card';
import type { ChartDataPoint } from '../../../types/roi';

interface TimeSavedChartProps {
  data: ChartDataPoint[];
  loading?: boolean;
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="bg-popover text-popover-foreground p-3 rounded-lg shadow-lg border border-border">
      <p className="text-sm font-medium mb-1">
        {label ? format(parseISO(label), 'MMM dd, yyyy') : ''}
      </p>
      <p className="text-sm text-primary font-semibold">{payload[0]?.value?.toFixed(1)}h saved</p>
    </div>
  );
}

export function TimeSavedChart({ data, loading = false }: TimeSavedChartProps) {
  // Format dates for display
  const formattedData = data.map((point) => ({
    ...point,
    displayDate: format(parseISO(point.date), 'MMM dd'),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Time Saved</CardTitle>
        <CardDescription>Last {data.length} days</CardDescription>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-[300px]">
            <div className="animate-pulse text-muted-foreground">Loading chart...</div>
          </div>
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            No data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={formattedData}>
              <defs>
                <linearGradient id="timeSavedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.3} />
              <XAxis
                dataKey="displayDate"
                className="text-xs"
                stroke="hsl(var(--muted-foreground))"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis
                className="text-xs"
                stroke="hsl(var(--muted-foreground))"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                label={{ value: 'Hours', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="timeSavedHours"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#timeSavedGradient)"
                animationDuration={800}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

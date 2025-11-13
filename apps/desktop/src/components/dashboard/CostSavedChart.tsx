/**
 * CostSavedChart Component
 * Bar chart showing cost savings by employee
 */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import type { EmployeeChartData } from '../../types/roi';

interface CostSavedChartProps {
  data: EmployeeChartData[];
  loading?: boolean;
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0]?.payload as EmployeeChartData | undefined;

  return (
    <div className="bg-popover text-popover-foreground p-3 rounded-lg shadow-lg border border-border">
      <p className="text-sm font-medium mb-2">{label}</p>
      <div className="space-y-1 text-xs">
        <p className="text-green-600 dark:text-green-500 font-semibold">
          ${payload[0]?.value?.toLocaleString()} saved
        </p>
        {data && (
          <>
            <p className="text-muted-foreground">
              {data.timeSavedHours.toFixed(1)}h saved
            </p>
            <p className="text-muted-foreground">
              {data.automationsRun} automations
            </p>
            <p className="text-muted-foreground">
              {(data.successRate * 100).toFixed(0)}% success rate
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export function CostSavedChart({ data, loading = false }: CostSavedChartProps) {
  // Truncate employee names if too long
  const formattedData = data.map((emp) => ({
    ...emp,
    displayName: emp.employeeName.length > 15
      ? `${emp.employeeName.substring(0, 15)}...`
      : emp.employeeName,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost Saved</CardTitle>
        <CardDescription>Breakdown by AI employee</CardDescription>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-[300px]">
            <div className="animate-pulse text-muted-foreground">Loading chart...</div>
          </div>
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            No employee data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={formattedData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.3} />
              <XAxis
                dataKey="displayName"
                className="text-xs"
                stroke="hsl(var(--muted-foreground))"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis
                className="text-xs"
                stroke="hsl(var(--muted-foreground))"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                label={{ value: 'USD', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))' }} />
              <Bar
                dataKey="costSavedUsd"
                fill="hsl(var(--primary))"
                radius={[8, 8, 0, 0]}
                animationDuration={800}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

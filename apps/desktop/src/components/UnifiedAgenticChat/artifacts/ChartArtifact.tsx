import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import type { Artifact } from '../../../types/chat';

type ChartSeriesConfig = {
  dataKey: string;
  color?: string;
};

type ChartArtifactConfig = {
  type: 'bar' | 'line' | 'pie';
  data: Array<Record<string, number | string>>;
  xKey?: string;
  valueKey?: string;
  nameKey?: string;
  bars?: ChartSeriesConfig[];
  lines?: ChartSeriesConfig[];
};

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#a4de6c', '#d084d0'];

export function ChartArtifact({ artifact }: { artifact: Artifact }) {
  const chartData = useMemo<ChartArtifactConfig | null>(() => {
    try {
      const parsed = JSON.parse(artifact.content) as ChartArtifactConfig;
      if (!parsed?.type || !parsed?.data) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }, [artifact.content]);

  if (!chartData) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Invalid chart data. Expected format: {'{'}type:
        &quot;bar&quot;|&quot;line&quot;|&quot;pie&quot;, data: [...]{'}'}
      </div>
    );
  }

  return (
    <div className="p-4 h-[400px]" data-testid="chart-container">
      <ResponsiveContainer width="100%" height="100%">
        {chartData.type === 'bar' ? (
          <BarChart data={chartData.data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={chartData.xKey || 'name'} />
            <YAxis />
            <RechartsTooltip />
            <Legend />
            {chartData.bars?.map((bar, index) => (
              <Bar
                key={bar.dataKey}
                dataKey={bar.dataKey}
                fill={bar.color || COLORS[index % COLORS.length]}
              />
            )) || <Bar dataKey="value" fill="#8884d8" />}
          </BarChart>
        ) : chartData.type === 'line' ? (
          <LineChart data={chartData.data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={chartData.xKey || 'name'} />
            <YAxis />
            <RechartsTooltip />
            <Legend />
            {chartData.lines?.map((line, index) => (
              <Line
                key={line.dataKey}
                type="monotone"
                dataKey={line.dataKey}
                stroke={line.color || COLORS[index % COLORS.length]}
              />
            )) || <Line type="monotone" dataKey="value" stroke="#8884d8" />}
          </LineChart>
        ) : chartData.type === 'pie' ? (
          <PieChart>
            <Pie
              data={chartData.data}
              dataKey={chartData.valueKey || 'value'}
              nameKey={chartData.nameKey || 'name'}
              cx="50%"
              cy="50%"
              outerRadius={120}
              label
            >
              {chartData.data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <RechartsTooltip />
            <Legend />
          </PieChart>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Unsupported chart type: {chartData.type}
          </div>
        )}
      </ResponsiveContainer>
    </div>
  );
}

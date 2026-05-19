'use client';

interface BarDatum {
  label: string;
  value: number;
  color?: string;
}

interface SimpleBarChartProps {
  data: BarDatum[];
  maxValue?: number;
  showValues?: boolean;
  unit?: string;
}

export function SimpleBarChart({
  data,
  maxValue,
  showValues = true,
  unit = '',
}: SimpleBarChartProps) {
  const max = maxValue ?? Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="space-y-2.5">
      {data.map((item) => {
        const pct = Math.min((item.value / max) * 100, 100);
        const barColor = item.color ?? 'bg-primary';
        return (
          <div key={item.label} className="group flex items-center gap-3">
            <span
              className="w-32 shrink-0 truncate text-right text-xs text-muted-foreground"
              title={item.label}
            >
              {item.label}
            </span>
            <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-muted/50">
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {showValues && (
              <span className="w-16 shrink-0 text-right text-xs font-medium tabular-nums">
                {item.value.toLocaleString()}
                {unit}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

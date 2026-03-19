'use client';

import { useId } from 'react';

interface LineDatum {
  date: string;
  value: number;
}

interface SimpleLineChartProps {
  data: LineDatum[];
  height?: number;
  color?: string;
  fillColor?: string;
  showDots?: boolean;
  showGrid?: boolean;
}

export function SimpleLineChart({
  data,
  height = 160,
  color = '#6366f1',
  fillColor,
  showDots = true,
  showGrid = true,
}: SimpleLineChartProps) {
  const uid = useId();
  if (data.length < 2) return null;

  const W = 600; // internal viewBox width
  const H = height;
  const PAD = { top: 8, right: 8, bottom: 24, left: 36 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const minVal = Math.min(...data.map((d) => d.value));
  const maxVal = Math.max(...data.map((d) => d.value));
  const range = maxVal - minVal || 1;

  const xStep = chartW / (data.length - 1);
  const yFor = (v: number) => chartH - ((v - minVal) / range) * chartH;

  const points = data.map((d, i) => ({
    x: PAD.left + i * xStep,
    y: PAD.top + yFor(d.value),
    label: d.date,
    value: d.value,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  const areaPath = [
    `M ${points[0]!.x} ${PAD.top + chartH}`,
    ...points.map((p) => `L ${p.x} ${p.y}`),
    `L ${points[points.length - 1]!.x} ${PAD.top + chartH}`,
    'Z',
  ].join(' ');

  // Y-axis ticks: 4 evenly spaced
  const yTicks = Array.from({ length: 4 }, (_, i) => {
    const val = minVal + (range / 3) * i;
    const y = PAD.top + yFor(val);
    return { val, y };
  });

  // X-axis labels: show first, mid, last
  const xLabels = [0, Math.floor(data.length / 2), data.length - 1].map((i) => points[i]!);

  const gradId = `lineGrad_${uid.replace(/:/g, '_')}`;

  return (
    <div className="w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-full w-full"
        style={{ height }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fillColor ?? color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={fillColor ?? color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {showGrid &&
          yTicks.map(({ y }, i) => (
            <line
              key={i}
              x1={PAD.left}
              y1={y}
              x2={PAD.left + chartW}
              y2={y}
              stroke="currentColor"
              strokeOpacity="0.08"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          ))}

        {/* Y-axis labels */}
        {yTicks.map(({ val, y }, i) => (
          <text
            key={i}
            x={PAD.left - 6}
            y={y + 4}
            textAnchor="end"
            fontSize="9"
            fill="currentColor"
            opacity="0.45"
          >
            {val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val.toFixed(0)}
          </text>
        ))}

        {/* Area fill */}
        <path d={areaPath} fill={`url(#${gradId})`} />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Dots */}
        {showDots &&
          points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} stroke="white" strokeWidth="1.5" />
          ))}

        {/* X-axis labels */}
        {xLabels.map((p, i) => (
          <text
            key={i}
            x={p.x}
            y={PAD.top + chartH + 14}
            textAnchor="middle"
            fontSize="9"
            fill="currentColor"
            opacity="0.45"
          >
            {p.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ChartArtifact } from '../ChartArtifact';
import { chartSeriesPalette } from '../chart-spec';
import type { Artifact } from '../../../lib/types';

const CONTAINER_WIDTH = 480;
const CONTAINER_HEIGHT = 320;

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      React.cloneElement(children, {
        width: CONTAINER_WIDTH,
        height: CONTAINER_HEIGHT,
      } as Record<string, unknown>),
  };
});

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  // Reduced motion keeps recharts from deferring its shapes to animation frames,
  // so the drawn output is assertable once the lazy canvas has resolved.
  window.matchMedia = ((query: string) => ({
    matches: query === REDUCED_MOTION_QUERY,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

function chartArtifact(content: string): Artifact {
  return { id: 'chart-draw', type: 'chart', title: 'Revenue', content };
}

const twoSeries = JSON.stringify({
  type: 'bar',
  xKey: 'month',
  showLegend: true,
  series: [{ dataKey: 'revenue', name: 'Revenue' }, { dataKey: 'cost' }],
  data: [
    { month: 'Jan', revenue: 10, cost: 4 },
    { month: 'Feb', revenue: 20, cost: 9 },
  ],
});

async function drawn(content: string, isDark: boolean): Promise<HTMLElement> {
  const { container } = render(<ChartArtifact artifact={chartArtifact(content)} isDark={isDark} />);
  await waitFor(() => expect(container.querySelector('.recharts-wrapper')).not.toBeNull());
  return container as HTMLElement;
}

describe('ChartArtifact drawing', () => {
  it('draws a bar per series per point, coloured from the light token ramp', async () => {
    const container = await drawn(twoSeries, false);

    const bars = container.querySelectorAll('.recharts-bar-rectangle');
    expect(bars.length).toBe(4);

    const [first, second] = chartSeriesPalette('light');
    const fills = new Set(
      Array.from(container.querySelectorAll('.recharts-bar-rectangle path')).map((el) =>
        el.getAttribute('fill'),
      ),
    );
    expect(fills.has(first!)).toBe(true);
    expect(fills.has(second!)).toBe(true);
  });

  it('uses the dark ramp when the host says the theme is dark', async () => {
    const container = await drawn(twoSeries, true);

    const [first] = chartSeriesPalette('dark');
    const fills = Array.from(container.querySelectorAll('.recharts-bar-rectangle path')).map((el) =>
      el.getAttribute('fill'),
    );
    expect(fills).toContain(first!);
  });

  it('labels the axis and legend from the spec', async () => {
    await drawn(twoSeries, false);

    expect(await screen.findByText('Jan')).toBeDefined();
    expect(screen.getByText('Revenue')).toBeDefined();
    expect(screen.getByText('cost')).toBeDefined();
  });

  it('plots the declared x axis of the typed chart contract, not a guessed key', async () => {
    const container = await drawn(
      JSON.stringify({
        chart_type: 'bar',
        x_axis: { data_key: 'year' },
        series: [{ data_key: 'revenue' }],
        data: [
          { revenue: 10, year: 2020 },
          { revenue: 20, year: 2021 },
        ],
      }),
      false,
    );

    const ticks = Array.from(container.querySelectorAll('text')).map((el) => el.textContent);
    expect(ticks).toContain('2020');
    expect(ticks).toContain('2021');
  });

  it('draws a line chart with one path per series', async () => {
    const container = await drawn(
      JSON.stringify({
        type: 'line',
        data: [
          { name: 'A', value: 1 },
          { name: 'B', value: 3 },
        ],
      }),
      false,
    );

    expect(container.querySelectorAll('.recharts-line').length).toBe(1);
  });

  it('draws one pie slice per row', async () => {
    const container = await drawn(
      JSON.stringify({
        type: 'pie',
        data: [
          { name: 'A', value: 1 },
          { name: 'B', value: 2 },
          { name: 'C', value: 3 },
        ],
      }),
      false,
    );

    expect(container.querySelectorAll('.recharts-pie-sector').length).toBe(3);
  });
});

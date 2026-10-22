import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ChartArtifact } from '../ChartArtifact';
import { formatChartShare } from '../chart-spec';
import type { Artifact } from '../../../lib/types';
type RechartsModule = typeof import('recharts');

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<RechartsModule>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      React.cloneElement(children, { width: 480, height: 320 } as Record<string, unknown>),
  };
});

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  window.matchMedia = ((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

const SEGMENTS = [
  { product: 'Core', revenue: 13.2 },
  { product: 'Analytics', revenue: 7.1 },
  { product: 'Copilot', revenue: 3.5 },
  { product: 'Support', revenue: 2.2 },
  { product: 'Legacy', revenue: 0.3 },
];

function artifact(type: string): Artifact {
  return {
    id: `chart-${type}`,
    type: 'chart',
    title: 'Revenue share',
    content: JSON.stringify({ type, data: SEGMENTS }),
  };
}

async function drawn(type: string): Promise<HTMLElement> {
  const { container } = render(<ChartArtifact artifact={artifact(type)} isDark={false} />);
  await waitFor(() => expect(container.querySelector('.recharts-pie-sector')).not.toBeNull());
  return container as HTMLElement;
}

describe('donut chart', () => {
  it('draws a segment per row with a rounded share label on each', async () => {
    const container = await drawn('donut');

    expect(container.querySelectorAll('.recharts-pie-sector')).toHaveLength(5);
    await waitFor(() =>
      expect(
        Array.from(container.querySelectorAll('[data-chart-share]')).map(
          (node) => node.textContent,
        ),
      ).toEqual(['50%', '27%', '13%', '8%', '1%']),
    );
  });

  it('lists the legend in table-row order', async () => {
    const container = await drawn('donut');

    const legend = Array.from(container.querySelectorAll('.recharts-legend-item-text')).map(
      (node) => node.textContent,
    );
    expect(legend).toEqual(SEGMENTS.map((row) => row.product));
  });

  it('describes each segment share for screen readers', async () => {
    await drawn('donut');

    expect(screen.getByTestId('chart-artifact-summary').textContent).toContain(
      'Donut chart of 5 points, one slice per product.',
    );
    expect(screen.getByTestId('chart-artifact-summary').textContent).toContain(
      'Core 50%, Analytics 27%, Copilot 13%, Support 8%, Legacy 1%.',
    );
  });

  it('keeps a plain pie free of share labels', async () => {
    const container = await drawn('pie');
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(container.querySelectorAll('[data-chart-share]')).toHaveLength(0);
    expect(container.querySelectorAll('.recharts-pie-sector')).toHaveLength(5);
  });

  it('rounds shares and keeps a sliver visible', () => {
    expect(formatChartShare(0.5)).toBe('50%');
    expect(formatChartShare(0.004)).toBe('<1%');
    expect(formatChartShare(0)).toBe('0%');
  });
});

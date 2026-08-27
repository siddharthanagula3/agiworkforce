import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChartArtifact } from '../ChartArtifact';
import type { ChartCanvasProps } from '../ChartCanvas';
import type { Artifact } from '../../../lib/types';

const POISON_KEY = 'boom';

vi.mock('../ChartCanvas', () => ({
  default: ({ spec }: ChartCanvasProps) => {
    if (spec.series.some((entry) => entry.dataKey === POISON_KEY)) {
      throw new Error('recharts blew up on this shape');
    }
    return <div data-testid="chart-canvas" />;
  },
}));

function chartArtifact(content: string): Artifact {
  return { id: 'chart-boundary', type: 'chart', title: 'Revenue', content };
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('ChartArtifact error boundary', () => {
  it('shows the fallback instead of letting the chat crash', async () => {
    render(
      <ChartArtifact
        artifact={chartArtifact(JSON.stringify({ data: [{ name: 'A', [POISON_KEY]: 1 }] }))}
      />,
    );

    expect(await screen.findByTestId('chart-artifact-fallback')).toBeDefined();
  });

  it('clears the fallback once the streamed content stops throwing', async () => {
    const { rerender } = render(
      <ChartArtifact
        artifact={chartArtifact(JSON.stringify({ data: [{ name: 'A', [POISON_KEY]: 1 }] }))}
      />,
    );
    expect(await screen.findByTestId('chart-artifact-fallback')).toBeDefined();

    rerender(
      <ChartArtifact
        artifact={chartArtifact(JSON.stringify({ data: [{ name: 'A', value: 1 }] }))}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('chart-canvas')).toBeDefined());
    expect(screen.queryByTestId('chart-artifact-fallback')).toBeNull();
  });
});

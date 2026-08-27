import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { ArtifactPanel } from '../ArtifactPanel';
import { useArtifact } from '../../hooks/useArtifact';
import type { Artifact } from '../../lib/types';

const CHART_CONTENT = JSON.stringify({
  chart_type: 'bar',
  x_axis: { data_key: 'month' },
  series: [{ data_key: 'revenue' }],
  data: [
    { month: 'Jan', revenue: 10 },
    { month: 'Feb', revenue: 20 },
  ],
});

function chartArtifact(): Artifact {
  return { id: 'chart-panel', type: 'chart', title: 'Revenue', content: CHART_CONTENT };
}

describe('ArtifactPanel chart preview', () => {
  it('previews a chart artifact instead of showing its JSON source', () => {
    render(
      <ArtifactPanel
        artifact={chartArtifact()}
        viewMode="preview"
        onViewModeChange={() => {}}
        onClose={() => {}}
      />,
    );

    const preview = screen.getByTestId('artifact-panel-chart-preview');
    expect(preview.querySelector('[data-chart-kind="bar"]')).not.toBeNull();
    expect(screen.queryByText(CHART_CONTENT)).toBeNull();
  });

  it('offers the preview toggle for charts', () => {
    render(
      <ArtifactPanel
        artifact={chartArtifact()}
        viewMode="code"
        onViewModeChange={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByLabelText('Preview mode')).toBeDefined();
  });

  it('opens a chart in preview mode, not forced to source', () => {
    const { result } = renderHook(() => useArtifact());

    act(() => {
      result.current.openArtifact(chartArtifact());
    });

    expect(result.current.viewMode).toBe('preview');
    expect(result.current.canPreview).toBe(true);
  });
});

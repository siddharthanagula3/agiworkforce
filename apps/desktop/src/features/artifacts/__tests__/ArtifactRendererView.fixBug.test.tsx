/**
 * Regression test for the "Fix Bug" affordance ported from
 * features/canvas/ArtifactPreview.tsx into the live Diagram error state:
 * clicking it must call onFixBug with the render error and the offending
 * source so the caller can send both back to the model.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { RenderedArtifact } from '@/stores/artifactStore';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockRejectedValue(new Error('Parse error on line 1')),
  },
}));

import { ArtifactRendererView } from '../ArtifactRendererView';

const rendered: RenderedArtifact = {
  id: 'art-1',
  title: 'Broken diagram',
  artifact_type: 'diagram',
  rendered_content: {
    type: 'Diagram',
    data: { source: 'graph TD; A--', diagram_type: 'flowchart', theme: 'dark' },
  },
  version_info: {
    current: 1,
    total: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  status: 'complete',
  available_actions: [],
};

describe('ArtifactRendererView Diagram error state', () => {
  it('calls onFixBug with the error and source when "Fix Bug" is clicked', async () => {
    const onFixBug = vi.fn();
    render(<ArtifactRendererView rendered={rendered} onFixBug={onFixBug} />);

    fireEvent.click(await screen.findByRole('button', { name: /fix bug/i }));

    expect(onFixBug).toHaveBeenCalledTimes(1);
    expect(onFixBug).toHaveBeenCalledWith('Parse error on line 1', 'graph TD; A--');
  });

  it('does not render a "Fix Bug" button when onFixBug is not provided', async () => {
    render(<ArtifactRendererView rendered={rendered} />);

    await screen.findByText('Failed to render diagram');
    expect(screen.queryByRole('button', { name: /fix bug/i })).toBeNull();
  });
});

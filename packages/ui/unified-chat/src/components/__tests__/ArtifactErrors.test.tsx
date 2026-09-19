import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ArtifactPanel } from '../ArtifactPanel';
import { ArtifactRenderer } from '../ArtifactRenderer';
import type { Artifact } from '../../lib/types';

const internalDetail = 'HTTP 500: SELECT secret FROM accounts; trace_id=private-trace';

function poisonedHtmlArtifact(): Artifact {
  return {
    id: 'unsafe-html',
    type: 'html',
    title: 'Unsafe HTML',
    content: {
      toString() {
        throw new Error(internalDetail);
      },
    } as unknown as string,
  };
}

describe('artifact errors', () => {
  it('does not expose internal publish failures', async () => {
    render(
      <ArtifactPanel
        artifact={{ id: 'artifact', type: 'code', title: 'Artifact', content: 'const x = 1;' }}
        viewMode="code"
        onViewModeChange={vi.fn()}
        onClose={vi.fn()}
        publishArtifact={vi.fn().mockRejectedValue(new Error(internalDetail))}
      />,
    );

    fireEvent.click(screen.getByLabelText('More options'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Publish' }));

    await waitFor(() => {
      expect(screen.getByTestId('artifact-publish-bar').textContent).toMatch(
        /Something went wrong on our side/i,
      );
    });
    expect(screen.queryByText(/SELECT secret|private-trace|HTTP 500/i)).toBeNull();
  });

  it('does not expose internal HTML preparation failures in the panel', () => {
    render(
      <ArtifactPanel
        artifact={poisonedHtmlArtifact()}
        viewMode="preview"
        onViewModeChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const error = screen.getByTestId('artifact-panel-html-error');
    expect(error.textContent).toMatch(/Something went wrong on our side/i);
    expect(error.textContent).not.toMatch(/SELECT secret|private-trace|HTTP 500/i);
  });

  it('does not expose internal HTML preparation failures in the renderer', () => {
    render(<ArtifactRenderer artifact={poisonedHtmlArtifact()} />);

    const error = screen.getByTestId('html-artifact-error');
    expect(error.textContent).toMatch(/Something went wrong on our side/i);
    expect(error.textContent).not.toMatch(/SELECT secret|private-trace|HTTP 500/i);
  });
});

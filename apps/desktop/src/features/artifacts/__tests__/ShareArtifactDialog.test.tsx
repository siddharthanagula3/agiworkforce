/**
 * DOC-018 — the desktop share dialog must not promise a publish path desktop
 * does not have.
 *
 * Desktop injects a `localFileWriter` and no `CloudPublisher`
 * (`features/artifacts/publishAdapter.ts`), and Cloud mode does not change it:
 * `ChatInterface` renders the shared unified-chat `ArtifactPanel` with no
 * `publishArtifact` prop, so its Publish falls back to a clipboard snapshot.
 * The dialog therefore must not tell the user to switch to Cloud mode to get a
 * hosted link, and must not resurrect a launch-gate ("coming soon", waitlist,
 * invite, private beta) for a product that has none.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShareArtifactDialog } from '../ShareArtifactDialog';
import type { Artifact } from '@/stores/artifactStore';

function artifact(): Artifact {
  return {
    id: 'artifact-1',
    title: 'Pricing Table',
    content: '<div>hi</div>',
    artifact_type: 'html',
  } as unknown as Artifact;
}

describe('ShareArtifactDialog', () => {
  it('states that the local artifact has no share link', () => {
    render(<ShareArtifactDialog artifact={artifact()} isOpen onClose={vi.fn()} />);
    expect(screen.getByText('Local artifacts cannot be shared')).toBeInTheDocument();
    expect(screen.getByText('Pricing Table')).toBeInTheDocument();
  });

  it('does not send the user to Cloud mode for a hosted link desktop cannot produce', () => {
    const { container } = render(
      <ShareArtifactDialog artifact={artifact()} isOpen onClose={vi.fn()} />,
    );
    const copy = container.textContent ?? '';
    expect(copy).not.toMatch(/create it in Cloud mode/i);
    expect(copy).not.toMatch(/(publish|share).{0,40}\bin Cloud mode\b/i);
  });

  it('advertises no launch gate', () => {
    const { container } = render(
      <ShareArtifactDialog artifact={artifact()} isOpen onClose={vi.fn()} />,
    );
    expect(container.textContent ?? '').not.toMatch(
      /coming soon|waitlist|invite|private[\s-]?beta|release controls/i,
    );
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <ShareArtifactDialog artifact={artifact()} isOpen={false} onClose={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

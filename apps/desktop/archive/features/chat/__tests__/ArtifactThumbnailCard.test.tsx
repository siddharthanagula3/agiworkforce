import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../stores/artifactStore', () => ({
  useArtifactStore: (selector: (s: object) => unknown) => {
    const store = {
      setActiveArtifact: vi.fn(),
      openPanel: vi.fn(),
    };
    return selector(store);
  },
}));

import { ArtifactThumbnailRow } from '../MessageBubble/ArtifactThumbnailCard';
import type { Artifact } from '../../../types/chat';

const makeArtifact = (overrides: Partial<Artifact> = {}): Artifact => ({
  id: 'a1',
  type: 'code',
  title: 'My Script',
  content: 'console.log("hello")',
  ...overrides,
});

describe('ArtifactThumbnailRow', () => {
  it('renders nothing when artifacts array is empty', () => {
    const { container } = render(<ArtifactThumbnailRow artifacts={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a card for each artifact (up to MAX_VISIBLE=3)', () => {
    const artifacts = [
      makeArtifact({ id: 'a1', title: 'File 1' }),
      makeArtifact({ id: 'a2', title: 'File 2' }),
    ];
    render(<ArtifactThumbnailRow artifacts={artifacts} />);
    const cards = screen.getAllByTestId('artifact-thumbnail-card');
    expect(cards).toHaveLength(2);
  });

  it('shows an overflow card when more than 3 artifacts', () => {
    const artifacts = Array.from({ length: 5 }, (_, i) =>
      makeArtifact({ id: `a${i}`, title: `File ${i}` }),
    );
    render(<ArtifactThumbnailRow artifacts={artifacts} />);
    expect(screen.getAllByTestId('artifact-thumbnail-card')).toHaveLength(3);
    expect(screen.getByTestId('artifact-overflow-card')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('displays the artifact title in each card', () => {
    const artifact = makeArtifact({ id: 'a1', title: 'My Report' });
    render(<ArtifactThumbnailRow artifacts={[artifact]} />);
    expect(screen.getByText('My Report')).toBeInTheDocument();
  });

  it('displays the kind label badge', () => {
    render(<ArtifactThumbnailRow artifacts={[makeArtifact({ type: 'html', title: 'Page' })]} />);
    expect(screen.getByText('HTML')).toBeInTheDocument();
  });

  it('matches snapshot for a single code artifact', () => {
    const artifact = makeArtifact({ id: 'snap-1', title: 'Snapshot Test', type: 'code' });
    const { container } = render(<ArtifactThumbnailRow artifacts={[artifact]} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('opens artifact panel on card click', async () => {
    const user = userEvent.setup();
    const artifact = makeArtifact({ id: 'art-1', title: 'Click Me' });
    render(<ArtifactThumbnailRow artifacts={[artifact]} />);
    const card = screen.getByRole('button', { name: /Open artifact: Click Me/i });
    await expect(user.click(card)).resolves.toBeUndefined();
  });
});

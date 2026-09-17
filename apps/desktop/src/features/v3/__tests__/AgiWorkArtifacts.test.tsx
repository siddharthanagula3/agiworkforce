import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useArtifactStore, type ArtifactSummary } from '../../../stores/artifactStore';
import { AgiWorkArtifacts } from '../AgiWorkArtifacts';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        'agiWork.artifacts.title': 'Artifacts',
        'agiWork.artifacts.subtitle': 'Saved outputs',
        'agiWork.artifacts.loading': 'Loading artifacts…',
        'agiWork.artifacts.loadFailed': 'Could not load your artifacts.',
        'agiWork.artifacts.loadFailedStale':
          'Could not refresh your artifacts. Showing the last list that loaded.',
        'agiWork.artifacts.emptyTitle': 'No artifacts yet',
        'agiWork.artifacts.empty': 'Files and documents you create in chat show up here.',
        'agiWork.artifacts.startChat': 'Start a chat',
        'common.refresh': 'Refresh',
        'common.tryAgain': 'Try again',
      };
      return labels[key] ?? key;
    },
  }),
}));

function makeSummary(id: string): ArtifactSummary {
  return {
    id,
    title: `Artifact ${id}`,
    artifact_type: 'document',
    status: 'complete',
    current_version: 1,
    version_count: 1,
    created_at: '2026-09-16T00:00:00.000Z',
    updated_at: '2026-09-16T00:00:00.000Z',
    size_bytes: 12,
    tags: [],
    pinned: false,
  };
}

function setStore(summaries: ArtifactSummary[], summariesError: string | null): void {
  useArtifactStore.setState({
    summaries,
    summariesError,
    isLoading: false,
    listPersistedArtifacts: vi.fn(async () => summaries),
  } as Partial<ReturnType<typeof useArtifactStore.getState>> as never);
}

// A failed list used to return [] silently, so the panel rendered its empty
// state: "No artifacts yet", with a button inviting you to make one. Someone
// whose artifacts exist and whose network does not was told the opposite of
// the truth.
describe('the artifacts panel tells a failed load apart from an empty one', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('says the load failed rather than claiming there is nothing', () => {
    setStore([], 'boom');
    render(<AgiWorkArtifacts />);

    expect(screen.getByTestId('artifacts-load-error')).toHaveTextContent(
      'Could not load your artifacts.',
    );
    expect(screen.queryByText('No artifacts yet')).not.toBeInTheDocument();
  });

  it('keeps the last list on screen when a refresh fails, and says so', () => {
    setStore([makeSummary('a1')], 'boom');
    render(<AgiWorkArtifacts />);

    expect(screen.getByTestId('artifacts-load-error')).toHaveTextContent(
      'Showing the last list that loaded.',
    );
    expect(screen.getByText('Artifact a1')).toBeInTheDocument();
  });

  it('still shows the empty state when the load genuinely returned nothing', () => {
    setStore([], null);
    render(<AgiWorkArtifacts />);

    expect(screen.queryByTestId('artifacts-load-error')).not.toBeInTheDocument();
    expect(screen.getByText('No artifacts yet')).toBeInTheDocument();
  });

  it('offers a retry that asks for the list again', () => {
    setStore([], 'boom');
    render(<AgiWorkArtifacts />);

    const retry = screen.getByRole('button', { name: 'Try again' });
    retry.click();

    expect(useArtifactStore.getState().listPersistedArtifacts).toHaveBeenCalled();
  });
});

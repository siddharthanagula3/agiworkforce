import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  artifactArchive: vi.fn(),
  artifactUnarchive: vi.fn(),
}));

vi.mock('@/api/artifacts', async (importOriginal) => ({
  ...(await importOriginal<ArtifactsModule>()),
  artifactArchive: api.artifactArchive,
  artifactUnarchive: api.artifactUnarchive,
}));

import type { Artifact, ArtifactSummary } from '@/api/artifacts';
import { useArtifactStore } from '../artifactStore';

type ArtifactsModule = typeof import('@/api/artifacts');

function seed(status: Artifact['status']) {
  const artifact = { id: 'art-1', title: 'Notes', status } as Artifact;
  const other = { id: 'art-2', title: 'Other', status: 'complete' } as ArtifactSummary;
  useArtifactStore.setState({
    artifacts: new Map([[artifact.id, artifact]]),
    summaries: [{ id: 'art-1', title: 'Notes', status } as ArtifactSummary, other],
  });
}

describe('artifact archive state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useArtifactStore.getState().resetOnLogout();
  });

  it('marks the cached artifact and its gallery row archived, and nothing else', async () => {
    api.artifactArchive.mockResolvedValue(undefined);
    seed('complete');

    expect(await useArtifactStore.getState().archiveArtifact('art-1')).toBe(true);

    const state = useArtifactStore.getState();
    expect(state.artifacts.get('art-1')?.status).toBe('archived');
    expect(state.summaries.map((summary) => summary.status)).toEqual(['archived', 'complete']);
  });

  it('restores both when the artifact is unarchived', async () => {
    api.artifactUnarchive.mockResolvedValue(undefined);
    seed('archived');

    expect(await useArtifactStore.getState().unarchiveArtifact('art-1')).toBe(true);

    const state = useArtifactStore.getState();
    expect(api.artifactUnarchive).toHaveBeenCalledWith('art-1');
    expect(state.artifacts.get('art-1')?.status).toBe('complete');
    expect(state.summaries[0]?.status).toBe('complete');
  });

  it('leaves the state alone and reports failure when the host refuses', async () => {
    api.artifactUnarchive.mockRejectedValue(new Error('Artifact not found: art-1'));
    seed('archived');

    expect(await useArtifactStore.getState().unarchiveArtifact('art-1')).toBe(false);
    expect(useArtifactStore.getState().summaries[0]?.status).toBe('archived');
  });
});

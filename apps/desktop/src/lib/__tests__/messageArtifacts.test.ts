import { describe, expect, it } from 'vitest';
import type { EnhancedMessage } from '../../stores/chat/types';
import type { Artifact } from '../../types/chat';
import {
  buildMessageArtifactUpdate,
  buildToolArtifactTerminalArtifact,
  finalizeRunningMessageArtifacts,
  getMergedMessageArtifacts,
  upsertMessageArtifact,
  updateMessageArtifactById,
} from '../messageArtifacts';

const createMessage = (overrides: Partial<EnhancedMessage> = {}): EnhancedMessage => ({
  id: 'assistant-1',
  role: 'assistant',
  content: 'Working...',
  timestamp: new Date('2026-03-12T00:00:00.000Z'),
  ...overrides,
});

describe('messageArtifacts', () => {
  it('merges top-level and metadata artifacts without duplicates', () => {
    const sharedArtifact: Artifact = {
      id: 'shared',
      type: 'code',
      title: 'Shared',
      content: 'same',
    };
    const metadataOnly: Artifact = {
      id: 'metadata-only',
      type: 'code',
      title: 'Metadata only',
      content: 'metadata',
    };

    const artifacts = getMergedMessageArtifacts(
      createMessage({
        artifacts: [sharedArtifact],
        metadata: { artifacts: [sharedArtifact, metadataOnly] },
      }),
    );

    expect(artifacts.map((artifact) => artifact.id)).toEqual(['shared', 'metadata-only']);
  });

  it('upserts artifacts by id', () => {
    const existing: Artifact = { id: 'tool-1', type: 'code', title: 'Old', content: 'old' };
    const next: Artifact = { id: 'tool-1', type: 'code', title: 'New', content: 'new' };

    const artifacts = upsertMessageArtifact(
      createMessage({
        artifacts: [existing],
      }),
      next,
    );

    expect(artifacts).toEqual([next]);
  });

  it('builds message updates that preserve metadata while syncing artifacts', () => {
    const artifact: Artifact = { id: 'tool-1', type: 'code', title: 'Tool', content: 'ok' };
    const update = buildMessageArtifactUpdate(
      createMessage({
        metadata: { event: 'extension', sidecarType: 'browser' },
      }),
      [artifact],
      { status: 'running' },
    );

    expect(update.artifacts).toEqual([artifact]);
    expect(update.metadata).toMatchObject({
      event: 'extension',
      sidecarType: 'browser',
      status: 'running',
      artifacts: [artifact],
    });
  });

  it('updates a message artifact by id without disturbing neighbors', () => {
    const artifactA: Artifact = { id: 'tool-1', type: 'code', title: 'A', content: 'a' };
    const artifactB: Artifact = { id: 'tool-2', type: 'code', title: 'B', content: 'b' };

    const artifacts = updateMessageArtifactById(
      createMessage({ artifacts: [artifactA, artifactB] }),
      'tool-2',
      (artifact) => ({ ...artifact, content: 'updated' }),
    );

    expect(artifacts).toEqual([artifactA, { ...artifactB, content: 'updated' }]);
  });

  it('builds a terminal artifact state with top-level and metadata fields aligned', () => {
    const updated = buildToolArtifactTerminalArtifact(
      {
        id: 'tool-1',
        type: 'code',
        title: 'Tool',
        content: '',
        metadata: { phase: 'running' },
      },
      {
        status: 'cancelled',
        reason: 'Cancelled by user',
        completedAt: '2026-03-12T01:00:00.000Z',
        durationMs: 1200,
      },
    ) as Artifact & { status?: string; success?: boolean; error?: string };

    expect(updated).toMatchObject({
      id: 'tool-1',
      status: 'cancelled',
      success: false,
      error: 'Cancelled by user',
      content: 'Cancelled by user',
      metadata: {
        phase: 'running',
        status: 'cancelled',
        error: 'Cancelled by user',
        completedAt: '2026-03-12T01:00:00.000Z',
        duration_ms: 1200,
      },
    });
  });

  it('finalizes only running artifacts', () => {
    const finished = {
      id: 'done',
      type: 'code',
      title: 'Done',
      content: 'done',
      status: 'completed',
    } as Artifact;
    const running = {
      id: 'running',
      type: 'code',
      title: 'Run',
      content: '',
      status: 'running',
    } as Artifact;

    const artifacts = finalizeRunningMessageArtifacts(
      createMessage({ artifacts: [finished, running] }),
      {
        status: 'failed',
        reason: 'Tool failed',
      },
    ) as Array<Artifact & { status?: string; error?: string; success?: boolean }>;

    expect(artifacts).toHaveLength(2);
    expect(artifacts[0]).toMatchObject({ id: 'done', status: 'completed' });
    expect(artifacts[1]).toMatchObject({
      id: 'running',
      status: 'failed',
      success: false,
      error: 'Tool failed',
      content: 'Tool failed',
      metadata: {
        status: 'failed',
        error: 'Tool failed',
      },
    });
  });
});

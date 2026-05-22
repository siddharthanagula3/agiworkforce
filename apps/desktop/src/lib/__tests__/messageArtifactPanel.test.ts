import { describe, expect, it } from 'vitest';
import type { Artifact as MessageArtifact } from '@/types/chat';
import {
  attachPersistedArtifactId,
  artifactToSummary,
  buildPanelArtifactCreateInput,
  getArtifactPanelCandidateIds,
  getPanelArtifactType,
  PERSISTED_ARTIFACT_ID_METADATA_KEY,
} from '../messageArtifactPanel';

describe('messageArtifactPanel', () => {
  it('maps message artifact types to panel artifact types', () => {
    expect(getPanelArtifactType(artifact({ type: 'markdown', language: 'markdown' }))).toBe(
      'document',
    );
    expect(getPanelArtifactType(artifact({ type: 'html', language: 'html' }))).toBe('web');
    expect(getPanelArtifactType(artifact({ type: 'mermaid' }))).toBe('diagram');
    expect(getPanelArtifactType(artifact({ type: 'code', language: 'typescript' }))).toBe('code');
  });

  it('builds backend create input with durable source metadata', () => {
    const createInput = buildPanelArtifactCreateInput(
      artifact({
        id: 'message-artifact-1',
        type: 'markdown',
        title: 'Launch Plan',
        content: '# Launch Plan\n\nShip the workbench.',
        language: 'markdown',
      }),
    );

    expect(createInput).toMatchObject({
      title: 'Launch Plan',
      artifactType: 'document',
      content: '# Launch Plan\n\nShip the workbench.',
      tags: ['message-artifact'],
      metadata: {
        format: 'markdown',
        source_message_artifact_id: 'message-artifact-1',
      },
    });
  });

  it('prefers persisted artifact ids before legacy message artifact ids', () => {
    expect(
      getArtifactPanelCandidateIds(
        artifact({
          id: 'legacy-id',
          metadata: { [PERSISTED_ARTIFACT_ID_METADATA_KEY]: 'persisted-id' },
        }),
      ),
    ).toEqual(['persisted-id', 'legacy-id']);
  });

  it('converts a backend artifact to a panel summary', () => {
    const summary = artifactToSummary({
      id: 'artifact-1',
      title: 'Example',
      artifact_type: 'document',
      content: 'hello',
      metadata: { Generic: {} },
      status: 'complete',
      versions: [],
      current_version: 1,
      created_at: '2026-05-21T00:00:00.000Z',
      updated_at: '2026-05-21T00:00:00.000Z',
      tags: ['message-artifact'],
      pinned: false,
      conversation_id: 42,
    });

    expect(summary).toMatchObject({
      id: 'artifact-1',
      title: 'Example',
      artifact_type: 'document',
      size_bytes: 5,
      conversation_id: 42,
    });
  });

  it('records the persisted artifact id on message artifact metadata', () => {
    expect(attachPersistedArtifactId(artifact(), 'persisted-1').metadata).toMatchObject({
      [PERSISTED_ARTIFACT_ID_METADATA_KEY]: 'persisted-1',
    });
  });
});

function artifact(overrides: Partial<MessageArtifact> = {}): MessageArtifact {
  return {
    id: 'message-artifact',
    type: 'code',
    title: 'Artifact',
    content: 'content',
    ...overrides,
  };
}

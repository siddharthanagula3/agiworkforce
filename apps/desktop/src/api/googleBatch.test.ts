import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import { modelRegistry } from '@agiworkforce/model-registry';
import { createEmbeddingsBatch } from './googleBatch';

describe('createEmbeddingsBatch model ownership', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({
      name: 'batch-1',
      state: 'PENDING',
      model: 'resolved-by-command',
      createTime: '2026-07-15T00:00:00Z',
    });
  });

  it('uses the canonical embedding slot when the caller omits a model', async () => {
    const embeddingSlot = (
      modelRegistry.policies.auto.slots as Record<string, { modelKey: string } | undefined>
    )['embedding_default'];

    expect(embeddingSlot?.modelKey).toBe('gemini-embedding-2');

    await createEmbeddingsBatch({ texts: ['hello'] });

    expect(invokeMock).toHaveBeenCalledWith('google_batch_create_embeddings', {
      texts: ['hello'],
      inputFilePath: undefined,
      model: embeddingSlot?.modelKey,
      taskType: undefined,
      displayName: undefined,
    });
  });
});

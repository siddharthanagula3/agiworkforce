import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ index: vi.fn(), claimed: vi.fn() }));

vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn(() => ({})) }));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({ createClaimedUserScopedDb: mocks.claimed }));
vi.mock('@/lib/services/retrieval-index-service', () => ({ indexRetrievalDocument: mocks.index }));

const { indexRetrievalDocumentWorkflowStep, parseRetrievalIndexWorkflowInput } =
  await import('./steps/index-retrieval-document');

const INPUT = {
  version: 1 as const,
  documentId: '11111111-1111-4111-8111-111111111111',
  userId: 'user_1',
  organizationId: null,
};

describe('retrieval index workflow step', () => {
  it('refuses input that is not a document owned by a real scope', () => {
    expect(() => parseRetrievalIndexWorkflowInput({ ...INPUT, documentId: 'nope' })).toThrow();
    expect(() => parseRetrievalIndexWorkflowInput({ ...INPUT, userId: ' ' })).toThrow();
    expect(() =>
      parseRetrievalIndexWorkflowInput({ ...INPUT, organizationId: 'not-a-uuid' }),
    ).toThrow();
  });

  it('indexes under the owner row-level-security scope, never the owner connection', async () => {
    const scoped = { scoped: true };
    mocks.claimed.mockReturnValue(scoped);
    mocks.index.mockResolvedValue({ kind: 'indexed', chunkCount: 3, semantic: true });

    await expect(indexRetrievalDocumentWorkflowStep(INPUT, 'run-1')).resolves.toMatchObject({
      kind: 'indexed',
    });
    expect(mocks.claimed).toHaveBeenCalledWith({}, { userId: 'user_1', organizationId: null });
    expect(mocks.index).toHaveBeenCalledWith(scoped, INPUT.documentId, 'run-1');
  });
});

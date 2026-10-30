import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  assertAssistantContinuationSeed,
  refuseEditedAssistantOverwrite,
} from './assistant-content-edits';
import { ASSISTANT_CONTENT_CHANGED_REASON } from '@/features/chat/lib/assistant-content-edit-contract';

const query = vi.fn();
const EDIT_REVISION = '33333333-3333-4333-8333-333333333333';
const db: DatabaseAdapter = {
  query,
  execute: vi.fn(),
  transaction: (run) => run(db),
  withUser: () => db,
  withOrg: () => db,
  dispose: async () => {},
};
const scope = {
  db,
  userId: 'owner',
  organizationId: null,
  conversationId: '11111111-1111-4111-8111-111111111111',
  messageId: '22222222-2222-4222-8222-222222222222',
};

beforeEach(() => query.mockReset());

describe('edited assistant continuation admission', () => {
  it('returns the owned authoritative seed only when the submitted seed is exact', async () => {
    query.mockResolvedValue([{ content: 'Saved edit.', edit_revision: EDIT_REVISION }]);

    await expect(
      assertAssistantContinuationSeed({ ...scope, seed: 'Saved edit.' }),
    ).resolves.toEqual({
      content: 'Saved edit.',
      editRevision: EDIT_REVISION,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(
        /conversation.user_id = \$3[\s\S]*organization_id is not distinct from \$4/,
      ),
      [scope.messageId, scope.conversationId, scope.userId, scope.organizationId],
    );
  });

  it.each([null, 'Stale text.', 'Saved edit. Extra text.'])(
    'rejects a stale or missing seed: %s',
    async (seed) => {
      query.mockResolvedValue([{ content: 'Saved edit.', edit_revision: EDIT_REVISION }]);

      await expect(assertAssistantContinuationSeed({ ...scope, seed })).rejects.toMatchObject({
        statusCode: 409,
        code: 'CONFLICT',
        details: { reason: ASSISTANT_CONTENT_CHANGED_REASON },
      });
    },
  );

  it('leaves new, unmarked and inaccessible rows outside the edit guard', async () => {
    query.mockResolvedValue([]);

    await expect(assertAssistantContinuationSeed({ ...scope, seed: null })).resolves.toBeNull();
  });

  it('reports a protected stale write as a conflict without exposing its content', async () => {
    query.mockResolvedValue([{ content: 'Private saved edit.', edit_revision: EDIT_REVISION }]);

    await expect(refuseEditedAssistantOverwrite(scope)).rejects.toMatchObject({
      statusCode: 409,
      details: { reason: ASSISTANT_CONTENT_CHANGED_REASON },
    });
  });

  it('fails closed for a stored marker that is not an opaque revision', async () => {
    query.mockResolvedValue([{ content: 'Saved edit.', edit_revision: true }]);

    await expect(
      assertAssistantContinuationSeed({ ...scope, seed: 'Saved edit.' }),
    ).rejects.toMatchObject({
      statusCode: 409,
      details: { reason: ASSISTANT_CONTENT_CHANGED_REASON },
    });
  });
});

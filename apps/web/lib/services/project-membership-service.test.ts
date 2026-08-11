import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  ProjectConversationMembershipError,
  replaceProjectConversationMembership,
} from './project-membership-service';

function adapter(
  query: DatabaseAdapter['query'],
  execute: DatabaseAdapter['execute'],
): DatabaseAdapter {
  return { query, execute } as DatabaseAdapter;
}

describe('replaceProjectConversationMembership', () => {
  const organizationId = '11111111-1111-4111-8111-111111111111';

  it('rejects unavailable conversations before changing any membership', async () => {
    const query = vi.fn().mockResolvedValue([{ id: 'chat-1' }]);
    const execute = vi.fn();

    await expect(
      replaceProjectConversationMembership(adapter(query, execute), {
        userId: 'user-1',
        organizationId,
        projectId: 'project-1',
        conversationIds: ['chat-1', 'chat-2'],
      }),
    ).rejects.toBeInstanceOf(ProjectConversationMembershipError);

    expect(execute).not.toHaveBeenCalled();
  });

  it('deduplicates the requested set and replaces membership in two scoped updates', async () => {
    const query = vi.fn().mockResolvedValue([{ id: 'chat-1' }, { id: 'chat-2' }]);
    const execute = vi.fn().mockResolvedValue(2);
    const db = adapter(query, execute);

    await replaceProjectConversationMembership(db, {
      userId: 'user-1',
      organizationId,
      projectId: 'project-1',
      conversationIds: ['chat-1', 'chat-2', 'chat-1'],
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('organization_id is not distinct from $3::uuid'),
      ['user-1', ['chat-1', 'chat-2'], organizationId],
    );
    expect(execute).toHaveBeenNthCalledWith(1, expect.stringContaining('set project_id = null'), [
      'user-1',
      'project-1',
      ['chat-1', 'chat-2'],
      organizationId,
    ]);
    expect(execute).toHaveBeenNthCalledWith(2, expect.stringContaining('set project_id = $2'), [
      'user-1',
      'project-1',
      ['chat-1', 'chat-2'],
      organizationId,
    ]);
  });

  it('detaches every live conversation when the replacement set is empty', async () => {
    const query = vi.fn();
    const execute = vi.fn().mockResolvedValue(3);

    await replaceProjectConversationMembership(adapter(query, execute), {
      userId: 'user-1',
      organizationId: null,
      projectId: 'project-1',
      conversationIds: [],
    });

    expect(query).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(expect.stringContaining('set project_id = null'), [
      'user-1',
      'project-1',
      [],
      null,
    ]);
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { ManagedCloudAccountWorkspaces } from '@agiworkforce/cloud-contracts';
import {
  captureCallerConversationContext,
  assertCallerConversationAuthority,
} from '../src/features/cloud-bridge/callerConversationAuthority';
import type { CallerToolCustodyBinding } from '../src/features/cloud-bridge/callerToolCustody';
import type { ConversationEntry } from '../src/features/background/conversation-history';

function workspace(organizationId: string | null = null): ManagedCloudAccountWorkspaces {
  return {
    accountId: 'fixture-account',
    activeOrganizationId: organizationId,
    activeWorkspaceId: organizationId ? 'organization' : 'personal',
    scope: organizationId ? 'organization' : 'personal',
    workspaces: organizationId
      ? [
          {
            id: 'organization',
            kind: 'organization',
            organizationId,
            name: 'Fixture',
            slug: 'fixture',
            isPrimary: false,
            role: 'member',
          },
        ]
      : [],
  };
}

const owner = { accountId: 'fixture-account', authIncarnation: 'fixture-session' };
const cloudId = '11111111-1111-4111-8111-111111111111';
const orgId = '22222222-2222-4222-8222-222222222222';
const binding: CallerToolCustodyBinding = {
  owner,
  clientInstanceId: 'fixture-panel',
  streamId: 'fixture-stream',
  historyConversationId: 'fixture-local',
  conversationContext: { id: cloudId, organizationId: null, projectId: null },
};
function fixture() {
  const entry: ConversationEntry = {
    id: 'fixture-local',
    owner,
    title: 'Fixture',
    messages: [],
    savedAt: 1,
    routing: { selectedModel: 'auto' },
    cloudSync: {
      state: 'idle',
      createAcknowledged: true,
      conversationId: cloudId,
      organizationId: null,
      syncedProjectId: null,
    },
  };
  const remote = {
    id: cloudId,
    organizationId: null as string | null,
    projectId: null as string | null,
    title: 'Fixture',
    pinned: false,
    starred: false,
    archived: false,
    isTemporary: false,
    createdAt: '2026-11-09T00:00:00Z',
    updatedAt: '2026-11-09T00:00:00Z',
  };
  const getConversation = vi.fn(async () => ({
    conversation: { ...remote },
    messages: [],
    total: 0,
    hasMore: false,
  }));
  const deps = {
    readLocal: vi.fn(async () => structuredClone(entry)),
    readWorkspace: vi.fn(async () => workspace()),
    client: vi.fn(() => ({ getConversation })),
  };
  return { entry, remote, deps, getConversation };
}
describe('original caller conversation authority', () => {
  it('captures only an acknowledged local-to-cloud scope without making network reads', async () => {
    const h = fixture();
    expect(
      await captureCallerConversationContext(
        owner,
        'fixture-local',
        cloudId,
        () => undefined,
        h.deps,
      ),
    ).toEqual(binding.conversationContext);
    expect(h.deps.readWorkspace).not.toHaveBeenCalled();
    expect(h.deps.client).not.toHaveBeenCalled();
  });
  it('does not invent a workspace for an unacknowledged conversation', async () => {
    const h = fixture();
    delete h.entry.cloudSync!.organizationId;
    expect(
      await captureCallerConversationContext(
        owner,
        'fixture-local',
        cloudId,
        () => undefined,
        h.deps,
      ),
    ).toBeUndefined();
  });
  it('refuses a different outbound cloud conversation', async () => {
    const h = fixture();
    await expect(
      captureCallerConversationContext(owner, 'fixture-local', orgId, () => undefined, h.deps),
    ).rejects.toThrow('conversation changed');
  });
  it('checks local, remote and active-workspace scope before and after reattachment', async () => {
    const h = fixture();
    await assertCallerConversationAuthority(
      binding,
      'fixture-local',
      () => true,
      undefined,
      h.deps,
    );
    expect(h.deps.readLocal).toHaveBeenCalledTimes(2);
    expect(h.deps.readWorkspace).toHaveBeenCalledTimes(2);
    expect(h.getConversation).toHaveBeenCalledWith(
      cloudId,
      { limit: 1, offset: 0 },
      expect.objectContaining({ organizationId: null }),
    );
  });
  it.each([undefined, 'another-local'])(
    'refuses a different or missing local conversation %s before reads',
    async (id) => {
      const h = fixture();
      await expect(
        assertCallerConversationAuthority(binding, id, () => true, undefined, h.deps),
      ).rejects.toThrow('original browser task conversation');
      expect(h.deps.readLocal).not.toHaveBeenCalled();
    },
  );
  it('refuses missing original workspace proof', async () => {
    const h = fixture();
    await expect(
      assertCallerConversationAuthority(
        { ...binding, conversationContext: undefined },
        'fixture-local',
        () => true,
        undefined,
        h.deps,
      ),
    ).rejects.toThrow('workspace could not be proven');
    expect(h.deps.readLocal).not.toHaveBeenCalled();
  });
  it('refuses a current workspace change before reading remote messages', async () => {
    const h = fixture();
    h.deps.readWorkspace.mockResolvedValueOnce(workspace(orgId));
    await expect(
      assertCallerConversationAuthority(binding, 'fixture-local', () => true, undefined, h.deps),
    ).rejects.toThrow('different account workspace');
    expect(h.getConversation).not.toHaveBeenCalled();
  });
  it('refuses a mismatched account workspace response', async () => {
    const h = fixture();
    h.deps.readWorkspace.mockResolvedValueOnce({ ...workspace(), accountId: 'another-account' });
    await expect(
      assertCallerConversationAuthority(binding, 'fixture-local', () => true, undefined, h.deps),
    ).rejects.toThrow('different account workspace');
    expect(h.getConversation).not.toHaveBeenCalled();
  });
  it('stops after cancellation while workspace refresh yields', async () => {
    const h = fixture();
    const controller = new AbortController();
    h.deps.readWorkspace.mockImplementationOnce(async () => {
      controller.abort();
      return workspace();
    });
    await expect(
      assertCallerConversationAuthority(
        binding,
        'fixture-local',
        () => true,
        controller.signal,
        h.deps,
      ),
    ).rejects.toThrow();
    expect(h.getConversation).not.toHaveBeenCalled();
  });
  it('refuses remote project changes even when the local copy is stale', async () => {
    const h = fixture();
    h.remote.projectId = 'new-project';
    await expect(
      assertCallerConversationAuthority(binding, 'fixture-local', () => true, undefined, h.deps),
    ).rejects.toThrow('original account conversation');
  });
  it('refuses a local project move while a remote read yields', async () => {
    const h = fixture();
    h.getConversation.mockImplementationOnce(async () => {
      h.entry.projectId = 'new-project';
      return { conversation: h.remote, messages: [], total: 0, hasMore: false };
    });
    await expect(
      assertCallerConversationAuthority(binding, 'fixture-local', () => true, undefined, h.deps),
    ).rejects.toThrow('project or workspace changed');
  });
  it('refuses a workspace change during a remote read', async () => {
    const h = fixture();
    h.deps.readWorkspace.mockResolvedValueOnce(workspace()).mockResolvedValueOnce(workspace(orgId));
    await expect(
      assertCallerConversationAuthority(binding, 'fixture-local', () => true, undefined, h.deps),
    ).rejects.toThrow('different account workspace');
  });
  it('does not adopt a mutated original scope during an await', async () => {
    const h = fixture();
    const input = structuredClone(binding);
    h.deps.readWorkspace.mockImplementationOnce(async () => {
      input.conversationContext!.projectId = 'new-project';
      h.remote.projectId = 'new-project';
      return workspace();
    });
    await expect(
      assertCallerConversationAuthority(input, 'fixture-local', () => true, undefined, h.deps),
    ).rejects.toThrow('original account conversation');
  });
  it('checks operation retirement after remote work before allowing continuation', async () => {
    const h = fixture();
    let current = true;
    h.getConversation.mockImplementationOnce(async () => {
      current = false;
      return { conversation: h.remote, messages: [], total: 0, hasMore: false };
    });
    await expect(
      assertCallerConversationAuthority(binding, 'fixture-local', () => current, undefined, h.deps),
    ).rejects.toThrow('no longer current');
  });
});

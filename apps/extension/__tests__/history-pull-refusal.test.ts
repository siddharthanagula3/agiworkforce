import { beforeEach, describe, expect, it, vi } from 'vitest';

type ClerkAuthModule = typeof import('../src/features/cloud-bridge/clerkAuth');
type CloudMirroringModule = typeof import('../src/features/privacy/cloudMirroring');
type ConversationHistoryModule = typeof import('../src/features/background/conversation-history');

const fixture = vi.hoisted(() => {
  vi.stubGlobal('chrome', {
    i18n: {
      getMessage: (key: string) => key,
      getUILanguage: () => 'en',
    },
    runtime: { id: 'test-extension', getURL: (path: string) => `chrome-extension://test/${path}` },
    storage: { local: {}, session: {}, onChanged: { addListener: vi.fn() } },
  });
  return {
    owner: { accountId: 'account-a', authIncarnation: 'session-a' },
    recorded: [] as Array<Record<string, unknown>>,
    conversationAnswer: null as Response | null,
  };
});

vi.mock('../src/features/cloud-bridge/clerkAuth', async (importOriginal) => ({
  ...(await importOriginal<ClerkAuthModule>()),
  getFreshClerkAuthContext: async () => ({ token: 'token-a', owner: fixture.owner }),
}));
vi.mock('../src/features/privacy/cloudMirroring', async (importOriginal) => ({
  ...(await importOriginal<CloudMirroringModule>()),
  readCloudMirroringEnabled: async () => true,
}));
vi.mock('../src/features/background/conversation-history', async (importOriginal) => ({
  ...(await importOriginal<ConversationHistoryModule>()),
  recordCloudSyncState: async (_owner: unknown, _id: string, patch: Record<string, unknown>) => {
    fixture.recorded.push(patch);
  },
}));

import {
  CloudHistoryUnavailableError,
  refreshManagedCloudConversationHistory,
} from '../src/features/cloud-bridge/conversationHistoryPull';
import type { ConversationEntry } from '../src/features/background/conversation-history';

const CLOUD_ID = '7b2e4c6a-8d0f-4a1b-9c3e-5f7a9b1d3e50';

function entry(): ConversationEntry {
  return {
    id: 'local-pull',
    owner: fixture.owner,
    title: 'Pulled',
    messages: [],
    savedAt: 1,
    routing: { selectedModel: 'auto' },
    cloudSync: {
      state: 'idle',
      conversationId: CLOUD_ID,
      organizationId: null,
      createAcknowledged: true,
      messagesLoaded: false,
    },
  };
}

beforeEach(() => {
  fixture.recorded.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) =>
      String(input).endsWith('/api/settings/workspaces')
        ? Response.json({
            workspaces: [],
            activeWorkspaceId: null,
            activeOrganizationId: null,
            scope: 'personal',
          })
        : fixture.conversationAnswer!.clone(),
    ),
  );
});

async function refreshWithAnswer(answer: Response): Promise<void> {
  fixture.conversationAnswer = answer;
  await expect(
    refreshManagedCloudConversationHistory(fixture.owner, entry(), {
      isCurrent: () => true,
      protectsConversation: () => false,
    }),
  ).rejects.toBeInstanceOf(CloudHistoryUnavailableError);
}

describe('reading an account chat the workspace refuses', () => {
  it('holds the chat for a policy or lockdown refusal and retries later, in the server words', async () => {
    const reason =
      'This workspace is locked down while an incident is investigated. Contact support.';
    await refreshWithAnswer(
      Response.json({ error: { code: 'FORBIDDEN', message: reason } }, { status: 403 }),
    );

    expect(fixture.recorded).toHaveLength(1);
    expect(fixture.recorded[0]).toMatchObject({
      state: 'blocked',
      blockedReason: 'policy',
      lastError: reason,
    });
    expect(fixture.recorded[0]?.['retryAfter']).toEqual(expect.any(Number));
  });

  it('still ends sync for a chat whose workspace this account cannot reach', async () => {
    await refreshWithAnswer(
      Response.json(
        {
          error: {
            type: 'organization_policy',
            code: 'workspace_not_accessible',
            message: 'You are no longer a member of this workspace.',
          },
        },
        { status: 403 },
      ),
    );

    expect(fixture.recorded[0]).toMatchObject({ state: 'blocked', blockedReason: 'workspace' });
  });

  it('keeps an expired session as a sign-in state', async () => {
    await refreshWithAnswer(
      Response.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 },
      ),
    );

    expect(fixture.recorded[0]).toMatchObject({ blockedReason: 'auth' });
  });
});

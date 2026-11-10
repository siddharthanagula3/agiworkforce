import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MANAGED_CLOUD_DEFAULT_MODEL_SELECTION,
  MANAGED_CLOUD_WORKSPACES_PATH,
  managedCloudConversationBranchesPath,
  managedCloudConversationPath,
} from '@agiworkforce/cloud-contracts';
import {
  getConversation,
  importManagedCloudConversationHistory,
  pendingCloudMessages,
  type ConversationEntry,
} from '../src/features/background/conversation-history';
import { forkManagedCloudConversationHistory } from '../src/features/cloud-bridge/conversationHistoryPull';
type FreeTrialClientModule = typeof import('../src/features/cloud-bridge/freeTrialClient');
type ClerkAuthModule = typeof import('../src/features/cloud-bridge/clerkAuth');
type CloudMirroringModule = typeof import('../src/features/privacy/cloudMirroring');

const state = vi.hoisted(() => ({
  owner: { accountId: 'account-a', authIncarnation: 'session-a' },
  mirror: true,
}));
vi.mock('../src/features/cloud-bridge/freeTrialClient', async (importOriginal) => ({
  ...(await importOriginal<FreeTrialClientModule>()),
  getManagedCloudAuthContext: async () => ({ owner: state.owner, token: 'fixture-token' }),
}));
vi.mock('../src/features/cloud-bridge/clerkAuth', async (importOriginal) => ({
  ...(await importOriginal<ClerkAuthModule>()),
  getFreshClerkAuthContext: async () => ({ owner: state.owner, token: 'fixture-token' }),
}));
vi.mock('../src/features/privacy/cloudMirroring', async (importOriginal) => ({
  ...(await importOriginal<CloudMirroringModule>()),
  readCloudMirroringEnabled: async () => state.mirror,
}));

const owner = { accountId: 'account-a', authIncarnation: 'session-a' };
const sourceId = '11111111-1111-4111-8111-111111111111';
const branchId = '22222222-2222-4222-8222-222222222222';
const oldMessageId = '33333333-3333-4333-8333-333333333333';
const newMessageId = '44444444-4444-4444-8444-444444444444';
const oldRunId = '55555555-5555-4555-8555-555555555555';
const storage: Record<string, unknown> = {};
const local = {
  get: vi.fn((keys: string | string[], callback?: (value: Record<string, unknown>) => void) => {
    const result = structuredClone(
      Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((k) => [k, storage[k]])),
    );
    callback?.(result);
    return Promise.resolve(result);
  }),
  set: vi.fn((items: Record<string, unknown>, callback?: () => void) => {
    Object.assign(storage, structuredClone(items));
    callback?.();
    return Promise.resolve();
  }),
  remove: vi.fn((keys: string | string[], callback?: () => void) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
    callback?.();
    return Promise.resolve();
  }),
};
vi.stubGlobal('chrome', {
  storage: { local, onChanged: { addListener: vi.fn() } },
  runtime: { lastError: undefined },
});

const sourceConversation = {
  id: sourceId,
  organizationId: null,
  title: 'Saved source',
  projectId: null,
  pinned: false,
  starred: false,
  archived: false,
  isTemporary: false,
  model: MANAGED_CLOUD_DEFAULT_MODEL_SELECTION,
  createdAt: '2026-11-09T00:00:00.000Z',
  updatedAt: '2026-11-09T00:00:00.000Z',
};
const branchWire = {
  id: branchId,
  organization_id: null,
  title: 'Saved source (branch)',
  project_id: null,
  model: MANAGED_CLOUD_DEFAULT_MODEL_SELECTION,
  selected_route_id: MANAGED_CLOUD_DEFAULT_MODEL_SELECTION,
  pinned: false,
  starred: false,
  archived: false,
  is_temporary: false,
  created_at: '2026-11-09T00:00:00.000Z',
  updated_at: '2026-11-09T00:00:00.000Z',
};
const run = {
  runId: oldRunId,
  runPath: `/api/llm/v1/chat/completions/runs/${oldRunId}`,
  lastSequence: 2,
  state: 'completed' as const,
};
const options = () => ({
  isCurrent: () => true,
  protectsConversation: (id: string) => id === sourceId,
});

async function seed(): Promise<ConversationEntry> {
  await importManagedCloudConversationHistory(
    owner,
    null,
    [
      {
        conversation: sourceConversation,
        messages: [
          {
            role: 'assistant',
            content: 'Saved answer',
            timestamp: Date.now(),
            runtime: 'managed-cloud',
            cloudMessageId: oldMessageId,
            cloudAgentRun: run,
            cloudApprovalDecisions: { old: 'approved' },
          },
        ],
      },
    ],
    () => true,
    () => false,
  );
  return (await getConversation(owner, sourceId))!;
}

function transport(
  overrides: {
    workspace?: string | null;
    branch?: Record<string, unknown>;
    afterCreate?: () => void;
  } = {},
) {
  const fetchImpl = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    if (url.pathname === MANAGED_CLOUD_WORKSPACES_PATH) {
      const organizationId = overrides.workspace ?? null;
      return new Response(
        JSON.stringify({
          workspaces: organizationId
            ? [
                {
                  id: organizationId,
                  kind: 'organization',
                  organizationId,
                  name: 'Fixture workspace',
                  slug: 'fixture',
                  isPrimary: false,
                  role: 'member',
                },
              ]
            : [],
          activeWorkspaceId: organizationId,
          activeOrganizationId: organizationId,
          scope: organizationId ? 'organization' : 'personal',
        }),
      );
    }
    if (
      url.pathname === managedCloudConversationBranchesPath(sourceId) &&
      init?.method === 'POST'
    ) {
      overrides.afterCreate?.();
      return new Response(
        JSON.stringify({ conversation: { ...branchWire, ...overrides.branch } }),
        { status: 201 },
      );
    }
    if (url.pathname === managedCloudConversationPath(branchId)) {
      return new Response(
        JSON.stringify({
          conversation: branchWire,
          total: 1,
          hasMore: false,
          messages: [
            {
              id: newMessageId,
              role: 'assistant',
              content: 'Saved answer',
              model: MANAGED_CLOUD_DEFAULT_MODEL_SELECTION,
              provider: null,
              input_tokens: 0,
              output_tokens: 0,
              created_at: '2026-11-09T00:00:00.000Z',
              metadata: {
                runtime: 'managed-cloud',
                cloudAgentRunId: oldRunId,
                cloudAgentRun: run,
                cloudApprovalDecisions: { old: 'approved' },
              },
            },
          ],
        }),
      );
    }
    throw new Error(`Unexpected fixture route ${url.pathname}`);
  });
  vi.stubGlobal('fetch', fetchImpl);
  return fetchImpl;
}

beforeEach(() => {
  for (const key of Object.keys(storage)) delete storage[key];
  state.owner = { ...owner };
  state.mirror = true;
  vi.clearAllMocks();
});

describe('owned cloud history branch to canonical import', () => {
  it('imports fresh message identities and leaves source run, approvals and transcript unchanged', async () => {
    const original = await seed();
    const before = structuredClone(original);
    const fetchImpl = transport();
    const branch = await forkManagedCloudConversationHistory(owner, original, branchId, options());
    expect(branch.id).toBe(branchId);
    expect(branch.cloudSync).toMatchObject({
      conversationId: branchId,
      createAcknowledged: true,
      messagesLoaded: true,
    });
    expect(branch.messages[0]).toMatchObject({
      cloudMessageId: newMessageId,
      content: 'Saved answer',
    });
    expect(branch.messages[0]?.cloudAgentRun).toBeUndefined();
    expect(branch.messages[0]?.cloudApprovalDecisions).toBeUndefined();
    expect(pendingCloudMessages(branch)).toEqual([]);
    expect(branch.routing).toEqual(original.routing);
    expect(await getConversation(owner, sourceId)).toEqual(before);
    const mutation = fetchImpl.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(mutation[1]!.body as string)).toEqual({
      messageId: oldMessageId,
      requestId: branchId,
    });
  });

  it.each([
    'disabled mirror',
    'unsynced message',
    'streaming',
    'cancellation',
    'local runtime',
  ] as const)('does not mutate an account for %s', async (condition) => {
    const original = await seed();
    const fetchImpl = transport();
    if (condition === 'disabled mirror') state.mirror = false;
    if (condition === 'unsynced message') original.messages[0]!.content += ' unsent';
    if (condition === 'streaming') original.messages[0]!.streaming = true;
    if (condition === 'cancellation') original.messages[0]!.streamCancellation = 'pending';
    if (condition === 'local runtime') original.messages[0]!.runtime = 'local';
    await expect(
      forkManagedCloudConversationHistory(owner, original, branchId, options()),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await getConversation(owner, branchId)).toBeUndefined();
  });

  it('refuses a replaced authentication incarnation before creating a branch', async () => {
    const original = await seed();
    const fetchImpl = transport();
    state.owner = { ...owner, authIncarnation: 'session-replaced' };
    await expect(
      forkManagedCloudConversationHistory(owner, original, branchId, options()),
    ).rejects.toThrow(/account changed/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not copy a personal chat into a different active workspace', async () => {
    const original = await seed();
    const fetchImpl = transport({ workspace: '66666666-6666-4666-8666-666666666666' });
    await expect(
      forkManagedCloudConversationHistory(owner, original, branchId, options()),
    ).rejects.toThrow(/workspace/);
    expect(fetchImpl.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
    expect(await getConversation(owner, branchId)).toBeUndefined();
  });

  it('does not import a branch when its view is superseded during creation', async () => {
    const original = await seed();
    let current = true;
    transport({
      afterCreate: () => {
        current = false;
      },
    });
    await expect(
      forkManagedCloudConversationHistory(owner, original, branchId, {
        ...options(),
        isCurrent: () => current,
      }),
    ).rejects.toThrow(/account changed/i);
    expect(await getConversation(owner, branchId)).toBeUndefined();
    expect(await getConversation(owner, sourceId)).toEqual(original);
  });

  it('rejects a response bound to another request identity without importing it', async () => {
    const original = await seed();
    transport({ branch: { id: sourceId } });
    await expect(
      forkManagedCloudConversationHistory(owner, original, branchId, options()),
    ).rejects.toThrow(/could not be verified/);
    expect(await getConversation(owner, branchId)).toBeUndefined();
  });
});

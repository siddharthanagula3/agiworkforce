import { getConversation, type ConversationEntry } from '../background/conversation-history';
import {
  cloudHistoryReadSignal,
  readCurrentWorkspace,
  CloudHistoryWorkspaceChangedError,
} from './conversationHistoryPull';
import { createExtensionCloudChatClient } from './conversationSyncClient';
import type { CallerConversationContext, CallerToolCustodyBinding } from './callerToolCustody';
import type { ManagedCloudOwner } from './managedCloudAuthority';

interface CallerConversationDependencies {
  readLocal: typeof getConversation;
  readWorkspace: typeof readCurrentWorkspace;
  client: (
    ...args: Parameters<typeof createExtensionCloudChatClient>
  ) => Pick<ReturnType<typeof createExtensionCloudChatClient>, 'getConversation'>;
}
const dependencies: CallerConversationDependencies = {
  readLocal: getConversation,
  readWorkspace: readCurrentWorkspace,
  client: createExtensionCloudChatClient,
};

function scopeOf(entry: ConversationEntry | undefined): CallerConversationContext | undefined {
  const sync = entry?.cloudSync;
  if (
    !entry ||
    !sync?.createAcknowledged ||
    !sync.conversationId ||
    sync.organizationId === undefined ||
    sync.blockedReason ||
    (sync.syncedProjectId ?? null) !== (entry.projectId ?? null)
  )
    return undefined;
  return {
    id: sync.conversationId,
    organizationId: sync.organizationId,
    projectId: entry.projectId ?? null,
  };
}

export async function captureCallerConversationContext(
  owner: ManagedCloudOwner,
  historyConversationId: string | undefined,
  cloudConversationId: string | undefined,
  assertCurrent: () => void,
  deps: CallerConversationDependencies = dependencies,
): Promise<CallerConversationContext | undefined> {
  if (!historyConversationId || !cloudConversationId) return undefined;
  assertCurrent();
  const entry = await deps.readLocal({ ...owner }, historyConversationId);
  assertCurrent();
  const context = scopeOf(entry);
  if (context && context.id !== cloudConversationId)
    throw new Error('The browser task conversation changed before admission.');
  return context;
}

export function assertCallerConversationLink(
  binding: CallerToolCustodyBinding,
  historyConversationId: string | undefined,
): asserts historyConversationId is string {
  if (!binding.historyConversationId || historyConversationId !== binding.historyConversationId)
    throw new Error('Open the original browser task conversation before continuing.');
}

export async function assertCallerConversationAuthority(
  binding: CallerToolCustodyBinding,
  historyConversationId: string | undefined,
  isCurrent: () => boolean,
  signal?: AbortSignal,
  deps: CallerConversationDependencies = dependencies,
): Promise<void> {
  binding = structuredClone(binding);
  const context = binding.conversationContext;
  assertCallerConversationLink(binding, historyConversationId);
  if (!context) throw new Error('The original browser task workspace could not be proven.');
  const boundedSignal = cloudHistoryReadSignal(signal);
  const assertCurrent = () => {
    boundedSignal.throwIfAborted();
    if (!isCurrent()) throw new Error('The browser task conversation is no longer current.');
  };
  const readLocal = async () => {
    assertCurrent();
    const current = scopeOf(await deps.readLocal(binding.owner, historyConversationId));
    assertCurrent();
    if (
      !current ||
      current.id !== context.id ||
      current.organizationId !== context.organizationId ||
      current.projectId !== context.projectId
    )
      throw new Error(
        'The original browser task project or workspace changed. No browser action was repeated.',
      );
  };
  const readWorkspace = async () => {
    assertCurrent();
    const workspace = await deps.readWorkspace(binding.owner, { isCurrent }, boundedSignal);
    assertCurrent();
    if (
      (workspace.accountId !== undefined && workspace.accountId !== binding.owner.accountId) ||
      workspace.activeOrganizationId !== context.organizationId
    )
      throw new CloudHistoryWorkspaceChangedError();
  };
  await readLocal();
  await readWorkspace();
  const client = deps.client(binding.owner, { isCurrent });
  const detail = await client.getConversation(
    context.id,
    { limit: 1, offset: 0 },
    { organizationId: context.organizationId, signal: boundedSignal },
  );
  assertCurrent();
  const remote = detail.conversation;
  if (
    remote.id !== context.id ||
    remote.organizationId !== context.organizationId ||
    remote.projectId !== context.projectId ||
    remote.isTemporary
  )
    throw new Error('The saved browser task does not match its original account conversation.');
  await readWorkspace();
  await readLocal();
}

import {
  ManagedCloudAccountWorkspacesSchema,
  MANAGED_CLOUD_WORKSPACES_PATH,
  ManagedCloudCreateMessageRequestSchema,
  ManagedCloudChatHttpError,
  parseGeneratedFilesDelta,
  readPersistedInteractiveCards,
  resolveVisibleThread,
  type ManagedCloudAccountWorkspaces,
  type ManagedCloudConversation,
  type ManagedCloudMessage,
} from '@agiworkforce/cloud-contracts';
import {
  getModelMetadataById,
  getProviderSurface,
  PROVIDER_MODES,
  providerModeToPrivacyMode,
  isAutoModeModelId,
  type ProviderMode,
} from '@agiworkforce/types';
import { ThinkingTagSplitter } from '@agiworkforce/provider-protocol/thinking-tag-splitter';
import {
  BACKGROUND_ANSWER_TRUNCATION_NOTICE,
  blockCloudPersistence,
  getConversation,
  importManagedCloudConversationHistory,
  MAX_CONVERSATIONS,
  MAX_CONVERSATION_STORE_BYTES,
  MAX_HISTORY_CONTENT_CHARS,
  MAX_MESSAGES_PER_CONVERSATION,
  pendingCloudMessages,
  recordCloudSyncState,
  type ConversationEntry,
  type HistoryMessage,
} from '../background/conversation-history';
import { getFreshClerkAuthContext } from './clerkAuth';
import { FREE_TRIAL_GATEWAY } from './freeTrialClient';
import {
  createExtensionCloudChatClient,
  ManagedCloudOwnerChangedError,
  ManagedCloudSignedOutError,
} from './conversationSyncClient';
import { sameManagedCloudOwner, type ManagedCloudOwner } from './managedCloudAuthority';
import { readCloudMirroringEnabled } from '../privacy/cloudMirroring';
import { platformRequestHeaders } from '../../platformHeaders';

const HISTORY_PULL_TIMEOUT_MS = 20_000;

export interface CloudHistoryPullOptions {
  isCurrent(): boolean;
  protectsConversation(conversationId: string): boolean;
  signal?: AbortSignal;
}

export type CloudHistoryRefreshResult =
  | { status: 'disabled' }
  | { status: 'refreshed'; organizationId: string | null; imported: number; hasMore: boolean };

export class CloudHistoryWorkspaceChangedError extends Error {
  constructor() {
    super(
      'This chat belongs to a different account workspace. Switch workspaces on Web before opening it.',
    );
  }
}

export class CloudHistoryTrustBoundaryError extends Error {
  constructor() {
    super(
      'This chat cannot be continued in Chrome under its original privacy mode. Open it on its original surface.',
    );
  }
}

export class CloudHistoryCacheWindowError extends Error {
  constructor() {
    super(
      'This chat cannot fit in this browser’s history window without replacing unsynced work. Open the full chat on Web.',
    );
  }
}

export class CloudHistoryUnavailableError extends Error {
  constructor() {
    super(
      'This account chat is no longer available in the current workspace. Its saved device copy was preserved.',
    );
  }
}

class CloudHistoryBodyLimitError extends Error {
  constructor() {
    super('The account history response exceeded this browser’s memory limit.');
  }
}

async function boundedHistoryResponse(response: Response): Promise<Response> {
  if (!response.body) return response;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const read = await reader.read();
      if (read.done) break;
      bytes += read.value.byteLength;
      if (bytes > MAX_CONVERSATION_STORE_BYTES) throw new CloudHistoryBodyLimitError();
      chunks.push(read.value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function boundedPublicContent(message: ManagedCloudMessage): string {
  let content = message.content;
  if (message.role === 'assistant') {
    const splitter = new ThinkingTagSplitter();
    content = [...splitter.push(content), ...splitter.flush(true)]
      .filter((part) => part.type === 'text')
      .map((part) => ('text' in part ? part.text : ''))
      .join('');
  }
  return content.length <= MAX_HISTORY_CONTENT_CHARS
    ? content
    : `${content.slice(0, MAX_HISTORY_CONTENT_CHARS - BACKGROUND_ANSWER_TRUNCATION_NOTICE.length)}${BACKGROUND_ANSWER_TRUNCATION_NOTICE}`;
}

function isManagedHistoryMessage(
  message: ManagedCloudMessage,
  conversation: ManagedCloudConversation,
): boolean {
  const metadata = message.metadata ?? {};
  if (metadata['runtime'] !== undefined && metadata['runtime'] !== 'managed-cloud') return false;
  if (metadata['privacyMode'] !== undefined && metadata['privacyMode'] !== 'managed') return false;
  const mode = metadata['providerMode'];
  if (
    mode !== undefined &&
    (typeof mode !== 'string' ||
      !(PROVIDER_MODES as readonly string[]).includes(mode) ||
      providerModeToPrivacyMode(mode as ProviderMode) !== 'managed')
  )
    return false;
  const reference = message.model ?? conversation.model;
  const model = getModelMetadataById(reference ?? '');
  const explicitlyManaged =
    metadata['runtime'] === 'managed-cloud' ||
    metadata['privacyMode'] === 'managed' ||
    mode === 'ManagedGateway' ||
    mode === 'ManagedNative';
  if (!model && !isAutoModeModelId(reference) && !explicitlyManaged) return false;
  if (model && getProviderSurface(model.provider) === 'local') return false;
  if (
    model &&
    getProviderSurface(model.provider) === 'byok' &&
    metadata['runtime'] !== 'managed-cloud' &&
    metadata['privacyMode'] !== 'managed' &&
    mode !== 'ManagedGateway' &&
    mode !== 'ManagedNative'
  )
    return false;
  return true;
}

function projectPublicHistoryMessage(message: ManagedCloudMessage): HistoryMessage | null {
  if (message.role !== 'user' && message.role !== 'assistant') return null;
  const timestamp = Date.parse(message.createdAt);
  if (!ManagedCloudCreateMessageRequestSchema.shape.id.safeParse(message.id).success)
    throw new Error('An account history message has an invalid identity.');
  if (!Number.isFinite(timestamp))
    throw new Error('An account history message has an invalid timestamp.');
  const metadata = message.metadata ?? {};
  const rawFiles = Array.isArray(metadata['generatedFiles']) ? metadata['generatedFiles'] : [];
  const files = rawFiles.map((file: unknown) => {
    if (!file || typeof file !== 'object' || Array.isArray(file)) return null;
    const record = file as Record<string, unknown>;
    return {
      id: record['id'],
      file_name: record['file_name'] ?? record['fileName'],
      mime_type: record['mime_type'] ?? record['mimeType'],
      uri: record['uri'],
      byte_count: record['byte_count'] ?? record['byteCount'],
      kind: record['kind'],
      checksum_sha256: record['checksum_sha256'] ?? record['checksumSha256'],
      surface: record['surface'],
      previewable: record['previewable'],
    };
  });
  const generatedFiles = parseGeneratedFilesDelta({ files });
  const interactiveCards = readPersistedInteractiveCards(metadata);
  return {
    role: message.role,
    content: boundedPublicContent(message),
    timestamp,
    runtime: 'managed-cloud',
    cloudMessageId: message.id,
    ...(message.model ? { model: message.model } : {}),
    ...(message.provider ? { provider: message.provider } : {}),
    ...(metadata['managedQuickMode'] === true ? { managedQuickMode: true } : {}),
    ...(generatedFiles.length > 0 ? { generatedFiles } : {}),
    ...(interactiveCards.length > 0 ? { interactiveCards } : {}),
  };
}

function pullSignal(options: CloudHistoryPullOptions): AbortSignal {
  return AbortSignal.any([
    ...(options.signal ? [options.signal] : []),
    AbortSignal.timeout(HISTORY_PULL_TIMEOUT_MS),
  ]);
}

function awaitPullOperation<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    void operation.catch(() => undefined);
    return Promise.reject(signal.reason);
  }
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (apply: () => void): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      apply();
    };
    const abort = (): void => finish(() => reject(signal.reason));
    signal.addEventListener('abort', abort, { once: true });
    operation.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
    if (signal.aborted) abort();
  });
}

async function readCurrentWorkspace(
  owner: ManagedCloudOwner,
  options: CloudHistoryPullOptions,
  signal: AbortSignal,
): Promise<ManagedCloudAccountWorkspaces> {
  if (!options.isCurrent() || signal.aborted) throw new ManagedCloudOwnerChangedError();
  const context = await awaitPullOperation(getFreshClerkAuthContext(), signal);
  if (!context) throw new ManagedCloudSignedOutError();
  if (!sameManagedCloudOwner(context.owner, owner) || !options.isCurrent() || signal.aborted)
    throw new ManagedCloudOwnerChangedError();
  const response = await fetch(`${FREE_TRIAL_GATEWAY}${MANAGED_CLOUD_WORKSPACES_PATH}`, {
    method: 'GET',
    cache: 'no-store',
    signal,
    headers: { Authorization: `Bearer ${context.token}`, ...platformRequestHeaders() },
  });
  if (!response.ok)
    throw new Error(
      'Account workspace could not be refreshed. Your saved chats remain on this device.',
    );
  const workspaces = ManagedCloudAccountWorkspacesSchema.parse(
    await (await boundedHistoryResponse(response)).json(),
  );
  if (!options.isCurrent() || signal.aborted) throw new ManagedCloudOwnerChangedError();
  return workspaces;
}

function ownedHistoryClient(
  owner: ManagedCloudOwner,
  options: CloudHistoryPullOptions,
  signal: AbortSignal,
) {
  return createExtensionCloudChatClient(owner, {
    isCurrent: () => options.isCurrent() && !signal.aborted,
    fetchImpl: async (input, init) =>
      boundedHistoryResponse(await fetch(input, { ...init, cache: 'no-store', signal })),
  });
}

async function workspaceIsCurrent(
  owner: ManagedCloudOwner,
  options: CloudHistoryPullOptions,
  signal: AbortSignal,
  organizationId: string | null,
): Promise<boolean> {
  if (!options.isCurrent() || signal.aborted || !(await readCloudMirroringEnabled())) return false;
  const workspaces = await readCurrentWorkspace(owner, options, signal);
  return (
    options.isCurrent() && !signal.aborted && workspaces.activeOrganizationId === organizationId
  );
}

export async function refreshManagedCloudRecentHistory(
  owner: ManagedCloudOwner,
  options: CloudHistoryPullOptions,
): Promise<CloudHistoryRefreshResult> {
  if (!(await readCloudMirroringEnabled())) return { status: 'disabled' };
  const signal = pullSignal(options);
  const workspace = await readCurrentWorkspace(owner, options, signal);
  const organizationId = workspace.activeOrganizationId;
  const page = await ownedHistoryClient(owner, options, signal).listConversations(
    { limit: MAX_CONVERSATIONS, offset: 0, archived: 'include' },
    { signal, organizationId },
  );
  if (!(await workspaceIsCurrent(owner, options, signal, organizationId)))
    throw new CloudHistoryWorkspaceChangedError();
  const imported = await importManagedCloudConversationHistory(
    owner,
    organizationId,
    page.conversations
      .filter((conversation) => {
        if (conversation.isTemporary || conversation.organizationId !== organizationId)
          return false;
        const model = getModelMetadataById(conversation.model ?? '');
        return !model || getProviderSurface(model.provider) === 'managed_cloud';
      })
      .map((conversation) => ({ conversation })),
    () => options.isCurrent() && !signal.aborted,
    options.protectsConversation,
  );
  if (!options.isCurrent() || signal.aborted) throw new ManagedCloudOwnerChangedError();
  return { status: 'refreshed', organizationId, imported, hasMore: page.hasMore };
}

export async function refreshManagedCloudConversationHistory(
  owner: ManagedCloudOwner,
  entry: ConversationEntry,
  options: CloudHistoryPullOptions,
): Promise<ConversationEntry | undefined> {
  const cloudConversationId = entry.cloudSync?.conversationId;
  const organizationId = entry.cloudSync?.organizationId;
  if (!cloudConversationId || organizationId === undefined || !(await readCloudMirroringEnabled()))
    return entry;
  const signal = pullSignal(options);
  const workspace = await readCurrentWorkspace(owner, options, signal);
  if (workspace.activeOrganizationId !== organizationId)
    throw new CloudHistoryWorkspaceChangedError();
  if (options.protectsConversation(entry.id) || pendingCloudMessages(entry).length > 0)
    return entry;
  const client = ownedHistoryClient(owner, options, signal);
  const readWindow = async (limit: number, offset: number) => {
    try {
      return await client.getConversation(
        cloudConversationId,
        { limit, offset },
        { signal, organizationId },
      );
    } catch (error) {
      if (error instanceof ManagedCloudChatHttpError && [401, 403, 404].includes(error.status)) {
        if (options.isCurrent() && !signal.aborted) {
          await recordCloudSyncState(owner, entry.id, {
            state: 'blocked',
            blockedReason:
              error.status === 404 ? 'not-found' : error.status === 403 ? 'workspace' : 'auth',
            lastError: 'The account chat could not be read in the current workspace.',
          });
        }
        throw new CloudHistoryUnavailableError();
      }
      throw error;
    }
  };
  const first = await readWindow(1, 0);
  if (!Number.isSafeInteger(first.total) || first.total < 0)
    throw new Error('The account history message count could not be verified.');
  if (first.conversation.isTemporary || first.conversation.organizationId !== organizationId)
    throw new Error('This account chat cannot be imported into Chrome.');
  let detail = first;
  let limit = Math.min(MAX_MESSAGES_PER_CONVERSATION, first.total);
  while (limit > 0) {
    try {
      detail = await readWindow(limit, Math.max(0, first.total - limit));
      break;
    } catch (error) {
      if (!(error instanceof CloudHistoryBodyLimitError) || limit <= 1) throw error;
      limit = Math.max(1, Math.floor(limit / 2));
    }
  }
  if (
    detail.conversation.id !== cloudConversationId ||
    detail.conversation.isTemporary ||
    detail.conversation.organizationId !== organizationId
  )
    throw new Error('This account chat cannot be imported into Chrome.');
  if (
    [...first.messages, ...detail.messages].some(
      (message) => !isManagedHistoryMessage(message, detail.conversation),
    )
  ) {
    if (options.isCurrent() && !signal.aborted)
      await blockCloudPersistence(owner, entry.id, 'non-cloud-runtime');
    throw new CloudHistoryTrustBoundaryError();
  }
  if (
    detail.conversation.activeLeafMessageId &&
    !detail.messages.some((message) => message.id === detail.conversation.activeLeafMessageId)
  )
    throw new CloudHistoryCacheWindowError();
  const messages = resolveVisibleThread(detail.messages, detail.conversation.activeLeafMessageId)
    .map(projectPublicHistoryMessage)
    .filter((message): message is HistoryMessage => message !== null);
  if (messages.length === 0)
    throw new Error('This account chat has no public messages to restore.');
  if (!(await workspaceIsCurrent(owner, options, signal, organizationId)))
    throw new CloudHistoryWorkspaceChangedError();
  await importManagedCloudConversationHistory(
    owner,
    organizationId,
    [
      {
        conversation: detail.conversation,
        messages,
        totalMessageCount: detail.total,
        messagesOffset: Math.max(0, detail.total - limit),
      },
    ],
    () => options.isCurrent() && !signal.aborted,
    options.protectsConversation,
  );
  if (!options.isCurrent() || signal.aborted) throw new ManagedCloudOwnerChangedError();
  const imported = await getConversation(owner, entry.id);
  if (!imported || imported.cloudSync?.messagesLoaded === false || imported.messages.length === 0)
    throw new CloudHistoryCacheWindowError();
  return imported;
}

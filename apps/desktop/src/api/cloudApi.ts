import { guardedFetch } from '../lib/egressGuard';
import { isElectronHost, isTauri } from '../lib/runtimeEnvironment';
import { cloudAccountAuth } from '../services/cloudAccountAuth';
import {
  MANAGED_CLOUD_CONVERSATION_LIMITS,
  MANAGED_CLOUD_MESSAGE_LIMITS,
  MANAGED_CLOUD_PAGE_SIZE,
  createManagedCloudPaginationGuard,
} from '../services/managedCloudPagination';
import { WEB_APP_URL } from './config';
import type { CloudWorkMode } from '@agiworkforce/types';
import {
  parseManagedUsageSummaryResponse,
  type ManagedUsageSummaryResponse,
} from '@agiworkforce/types';
import {
  createManagedCloudChatClient,
  createManagedCloudAgentRunClient,
  ManagedMediaImageGenerationRequestSchema,
  ManagedMediaVideoGenerationRequestSchema,
  parseAgentEventDelta,
  readManagedCloudAgentRunHandle,
  TOOL_APPROVAL_RESUME_PATH,
  type ManagedMediaImageProvider,
  type ManagedMediaVideoProvider,
  type ManagedCloudAgentRunClient,
  type ManagedCloudAgentRunHandle,
  type ManagedCloudConversation,
  type ManagedCloudMessage,
} from '@agiworkforce/cloud-contracts';

// Exported so runtimes can resolve relative wire uris (e.g. the
export const CLOUD_API_BASE_URL = isTauri || isElectronHost ? WEB_APP_URL : '';
const usesNativeCloudSession = isTauri || isElectronHost;

export const CLOUD_SSE_MAX_EVENT_CHARS = 1_048_576;
export const CLOUD_SSE_IDLE_TIMEOUT_MS = 90_000;
export const CLOUD_MAX_CONVERSATIONS = MANAGED_CLOUD_CONVERSATION_LIMITS.maxItems;
export const CLOUD_MAX_MESSAGES_PER_CONVERSATION = MANAGED_CLOUD_MESSAGE_LIMITS.maxItems;

export interface CloudMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  provider?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface CloudConversation {
  id: string;
  user_id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
  project_id?: string | null;
  pinned?: boolean;
  starred?: boolean;
  archived?: boolean;
  is_temporary?: boolean;
  messages?: CloudMessage[];
}

export type CloudUsage = ManagedUsageSummaryResponse;

export interface SendMessageRequest {
  conversation_id?: string;
  message: string;
  model: string;
}

export type CloudChatMessageContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'file'; file: { asset_id: string } }
      | { type: 'image_url'; image_url: { url: string } }
    >;

function captureDesktopCloudAccountId(): string | undefined {
  return usesNativeCloudSession ? cloudAccountAuth.getSession()?.user?.id : undefined;
}

async function readAccountBoundSession(expectedAccountId?: string) {
  const session = await cloudAccountAuth.getValidSession();
  if (expectedAccountId && session?.user?.id !== expectedAccountId) {
    throw new Error('The Managed Cloud account changed while this request was in progress.');
  }
  return session;
}

export async function getAuthHeaders(
  expectedAccountId = captureDesktopCloudAccountId(),
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'X-AGI-Surface': 'desktop',
  };

  const session = await readAccountBoundSession(expectedAccountId);
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  if (usesNativeCloudSession && !session?.access_token) {
    throw new Error('AGI Cloud requires a connected Desktop session.');
  }

  if (!session?.access_token && typeof document !== 'undefined') {
    try {
      const csrfResp = await guardedFetch(`${CLOUD_API_BASE_URL}/api/csrf`, {
        credentials: 'include',
      });
      if (csrfResp.ok) {
        const csrfData = await csrfResp.json();
        const csrfToken = csrfData.token ?? csrfData.csrfToken;
        if (csrfToken) {
          headers['X-CSRF-Token'] = csrfToken;
        }
      }
    } catch {
      // CSRF fetch failed — continue without it
    }
  }

  return headers;
}

export async function cloudFetch(
  input: Parameters<typeof guardedFetch>[0],
  init?: Parameters<typeof guardedFetch>[1],
  expectedAccountId?: string,
): Promise<Response> {
  const response = await guardedFetch(input, init);
  if (expectedAccountId && cloudAccountAuth.getSession()?.user?.id !== expectedAccountId) {
    throw new Error('The Managed Cloud account changed while this request was in progress.');
  }
  if (usesNativeCloudSession && response.status === 401) {
    const dispatchedAuthorization = new Headers(init?.headers).get('Authorization');
    const dispatchedToken = dispatchedAuthorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    const currentSession = cloudAccountAuth.getSession();
    if (dispatchedToken && currentSession?.access_token === dispatchedToken) {
      await cloudAccountAuth.invalidateSession();
    }
  }
  return response;
}

export async function accountBoundCloudFetch(
  input: Parameters<typeof guardedFetch>[0],
  init: Parameters<typeof guardedFetch>[1] | undefined,
  expectedAccountId: string | undefined,
  assertBoundary?: () => void,
  onCredential?: (credential: DesktopCloudRunCleanupCredential) => void,
): Promise<Response> {
  assertBoundary?.();
  if (!expectedAccountId) return cloudFetch(input, init);

  const session = await readAccountBoundSession(expectedAccountId);
  assertBoundary?.();
  if (!session?.access_token) {
    throw new Error('AGI Cloud requires a connected Desktop session.');
  }
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  onCredential?.({ accountId: session.user.id, accessToken: session.access_token });
  return cloudFetch(input, { ...init, headers }, expectedAccountId);
}

function projectManagedConversation(conversation: ManagedCloudConversation): CloudConversation {
  return {
    id: conversation.id,
    user_id: '',
    title: conversation.title,
    model: conversation.model ?? 'auto',
    created_at: conversation.createdAt,
    updated_at: conversation.updatedAt,
    ...(conversation.projectId !== undefined ? { project_id: conversation.projectId } : {}),
    ...(conversation.pinned !== undefined ? { pinned: conversation.pinned } : {}),
    ...(conversation.starred !== undefined ? { starred: conversation.starred } : {}),
    ...(conversation.archived !== undefined ? { archived: conversation.archived } : {}),
    ...(conversation.isTemporary !== undefined ? { is_temporary: conversation.isTemporary } : {}),
  };
}

function projectManagedMessage(message: ManagedCloudMessage): CloudMessage {
  return {
    id: message.id,
    conversation_id: message.conversationId,
    role: message.role,
    content: message.content,
    ...(message.model ? { model: message.model } : {}),
    ...(message.provider ? { provider: message.provider } : {}),
    ...(message.metadata ? { metadata: message.metadata } : {}),
    created_at: message.createdAt,
  };
}

export function createCloudChatPersistenceClient(
  expectedAccountId = captureDesktopCloudAccountId(),
) {
  return createManagedCloudChatClient({
    baseUrl: CLOUD_API_BASE_URL,
    getAuthToken: async () =>
      (await readAccountBoundSession(expectedAccountId))?.access_token ?? null,
    decorateMutationHeaders: async (headers) => ({
      ...headers,
      ...(await getAuthHeaders(expectedAccountId)),
    }),
    fetchImpl: (input, init) =>
      accountBoundCloudFetch(
        input,
        {
          ...init,
          credentials: 'include',
        },
        expectedAccountId,
      ),
  });
}

export interface DesktopCloudRunCleanupCredential {
  accountId: string;
  accessToken: string;
}

export function createDesktopCloudAgentRunClient(
  expectedAccountId = captureDesktopCloudAccountId(),
  onCredential?: (credential: DesktopCloudRunCleanupCredential) => void,
): ManagedCloudAgentRunClient {
  return createManagedCloudAgentRunClient({
    baseUrl: CLOUD_API_BASE_URL,
    getAuthToken: async () =>
      (await readAccountBoundSession(expectedAccountId))?.access_token ?? null,
    decorateMutationHeaders: async (headers) => ({
      ...headers,
      ...(await getAuthHeaders(expectedAccountId)),
    }),
    fetchImpl: (input, init) =>
      accountBoundCloudFetch(
        input,
        {
          ...init,
          credentials: 'include',
        },
        expectedAccountId,
        undefined,
        onCredential,
      ),
  });
}

export function createDesktopCloudAgentRunCleanupClient(
  credential: DesktopCloudRunCleanupCredential,
): ManagedCloudAgentRunClient {
  if (!credential.accountId || !credential.accessToken) {
    throw new Error('Managed Cloud run cleanup requires its original account credential.');
  }
  const fixedHeaders = (headers?: HeadersInit) => {
    const next = new Headers(headers);
    next.set('Authorization', `Bearer ${credential.accessToken}`);
    next.set('Content-Type', 'application/json');
    next.set('X-Requested-With', 'XMLHttpRequest');
    next.set('X-AGI-Surface', 'desktop');
    return next;
  };
  return createManagedCloudAgentRunClient({
    baseUrl: CLOUD_API_BASE_URL,
    getAuthToken: async () => credential.accessToken,
    decorateMutationHeaders: async (headers) => Object.fromEntries(fixedHeaders(headers).entries()),
    fetchImpl: (input, init) =>
      guardedFetch(input, {
        ...init,
        credentials: 'include',
        headers: fixedHeaders(init?.headers),
      }),
  });
}

export async function listCloudConversations(): Promise<CloudConversation[]> {
  const client = createCloudChatPersistenceClient();
  const conversations: CloudConversation[] = [];
  const pagination = createManagedCloudPaginationGuard('conversations');
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const page = await client.listConversations({
      limit: MANAGED_CLOUD_PAGE_SIZE,
      offset,
    });
    const nextOffset = pagination.acceptPage({
      items: page.conversations,
      hasMore: page.hasMore,
      currentOffset: offset,
      nextOffset: page.nextOffset,
    });
    conversations.push(...page.conversations.map(projectManagedConversation));
    hasMore = page.hasMore;
    if (!hasMore) break;
    offset = nextOffset;
  }
  return conversations;
}

export async function createCloudConversation(
  title: string,
  model: string,
): Promise<CloudConversation> {
  return projectManagedConversation(
    await createCloudChatPersistenceClient().createConversation({ title, model }),
  );
}

export async function getCloudConversation(id: string): Promise<CloudConversation> {
  const client = createCloudChatPersistenceClient();
  const messages: CloudMessage[] = [];
  const pagination = createManagedCloudPaginationGuard('messages');
  let offset = 0;
  let conversation: ManagedCloudConversation | undefined;
  let hasMore = true;
  while (hasMore) {
    const page = await client.getConversation(id, {
      limit: MANAGED_CLOUD_PAGE_SIZE,
      offset,
    });
    conversation = page.conversation;
    const nextOffset = pagination.acceptPage({
      items: page.messages,
      hasMore: page.hasMore,
      currentOffset: offset,
      reportedTotal: page.total,
    });
    messages.push(...page.messages.map(projectManagedMessage));
    hasMore = page.hasMore;
    offset = nextOffset;
  }
  if (!conversation) throw new Error(`Cloud conversation ${id} was not found`);
  return {
    ...projectManagedConversation(conversation),
    messages,
  };
}

export async function deleteCloudConversation(id: string): Promise<void> {
  await createCloudChatPersistenceClient().deleteConversation(id);
}

export async function updateCloudConversationTitle(
  id: string,
  title: string,
): Promise<CloudConversation> {
  return projectManagedConversation(
    await createCloudChatPersistenceClient().updateConversation(id, { title }),
  );
}

export async function getCloudUsage(): Promise<CloudUsage> {
  const expectedAccountId = captureDesktopCloudAccountId();
  const headers = await getAuthHeaders(expectedAccountId);

  const res = await accountBoundCloudFetch(
    `${CLOUD_API_BASE_URL}/api/usage`,
    {
      method: 'GET',
      headers,
      credentials: 'include',
    },
    expectedAccountId,
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch cloud usage: HTTP ${res.status}`);
  }

  return parseManagedUsageSummaryResponse(await res.json());
}

export interface CloudModelInfo {
  id: string;
  name: string;
  provider: string;
}

export interface CloudModelsResponse {
  models: CloudModelInfo[];
  version?: string;
  lastUpdated?: string;
}

export interface CloudGeneratedImage {
  id: string;
  uri: string;
  provider: ManagedMediaImageProvider;
  model: string;
}

export interface CloudGeneratedVideo {
  id: string;
  uri: string;
  provider: ManagedMediaVideoProvider;
  model: string;
}

/**
 * Fetches the canonical public model catalog for the embedded Cloud shell.
 * Catalog membership is not an entitlement claim; execution remains
 * server-authorized and the native Desktop picker uses privileged discovery.
 *
 * @returns Valid model identity records from the canonical catalog
 * @throws {Error} If the API call fails
 */
export async function getCloudModels(): Promise<CloudModelInfo[]> {
  const relativePath = '/api/models';
  const url = new URL(
    `${CLOUD_API_BASE_URL}${relativePath}`,
    CLOUD_API_BASE_URL || globalThis.location?.origin || 'http://localhost',
  );

  try {
    const requestUrl = CLOUD_API_BASE_URL ? url.toString() : `${url.pathname}${url.search}`;
    const res = await guardedFetch(requestUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch cloud models: HTTP ${res.status}`);
    }

    const payload: unknown = await res.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('model catalog returned an invalid response');
    }
    const rawModels = (payload as Record<string, unknown>)['models'];
    if (!Array.isArray(rawModels)) {
      throw new Error('model catalog did not include a model list');
    }
    return rawModels.flatMap((candidate): CloudModelInfo[] => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [];
      const record = candidate as Record<string, unknown>;
      const id = typeof record['id'] === 'string' ? record['id'].trim() : '';
      const name = typeof record['name'] === 'string' ? record['name'].trim() : '';
      const provider = typeof record['provider'] === 'string' ? record['provider'].trim() : '';
      return id && name && provider ? [{ id, name, provider }] : [];
    });
  } catch (err) {
    throw new Error(
      `Failed to fetch cloud models: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function generateCloudImage(input: {
  prompt: string;
  provider: ManagedMediaImageProvider;
  model: string;
  idempotencyKey: string;
  signal?: AbortSignal;
}): Promise<CloudGeneratedImage> {
  const expectedAccountId = captureDesktopCloudAccountId();
  const request = ManagedMediaImageGenerationRequestSchema.parse({
    prompt: input.prompt,
    provider: input.provider,
    model: input.model,
    size: '1024x1024',
    n: 1,
    quality: 'standard',
  });
  const headers = await getAuthHeaders(expectedAccountId);
  headers['Idempotency-Key'] = input.idempotencyKey;

  const response = await accountBoundCloudFetch(
    `${CLOUD_API_BASE_URL}/api/media/image/generate`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
      signal: input.signal,
      credentials: 'include',
    },
    expectedAccountId,
  );
  if (!response.ok) throw await readCloudResponseError(response);

  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('AGI Cloud returned an invalid image-generation response.');
  }
  const record = payload as Record<string, unknown>;
  if (record['success'] !== true) {
    const message =
      typeof record['error'] === 'string'
        ? record['error']
        : 'AGI Cloud could not generate the image.';
    throw new Error(message);
  }
  if (record['persisted'] !== true) {
    throw new Error(
      'The image provider returned an inline result, but durable Cloud media storage is not configured.',
    );
  }

  const images = Array.isArray(record['images']) ? record['images'] : [];
  const first = images[0];
  const rawUri =
    first && typeof first === 'object' && !Array.isArray(first)
      ? (first as Record<string, unknown>)['url']
      : undefined;
  if (typeof rawUri !== 'string' || !rawUri.trim()) {
    throw new Error('AGI Cloud generated an image but returned no durable file URL.');
  }

  const fallbackOrigin = globalThis.location?.origin || 'http://localhost';
  const cloudOrigin = new URL(CLOUD_API_BASE_URL || fallbackOrigin);
  const resolved = new URL(rawUri, cloudOrigin);
  const fileMatch = /^\/api\/files\/([^/]+)$/.exec(resolved.pathname);
  if (resolved.origin !== cloudOrigin.origin || !fileMatch?.[1]) {
    throw new Error('AGI Cloud returned an invalid image file URL.');
  }

  const provider = record['provider'];
  const model = record['model'];
  if (
    (provider !== 'google' && provider !== 'openai' && provider !== 'stability') ||
    typeof model !== 'string' ||
    !model.trim()
  ) {
    throw new Error('AGI Cloud returned incomplete image provenance.');
  }

  return {
    id: decodeURIComponent(fileMatch[1]),
    uri: CLOUD_API_BASE_URL
      ? resolved.toString()
      : `${resolved.pathname}${resolved.search}${resolved.hash}`,
    provider,
    model,
  };
}

export const CLOUD_VIDEO_POLL_INTERVAL_MS = 5_000;
export const CLOUD_VIDEO_POLL_TIMEOUT_MS = 5 * 60_000;

function durableCloudFileUri(rawUri: unknown): { id: string; uri: string } | null {
  if (typeof rawUri !== 'string' || !rawUri.trim()) return null;
  const fallbackOrigin = globalThis.location?.origin || 'http://localhost';
  const cloudOrigin = new URL(CLOUD_API_BASE_URL || fallbackOrigin);
  let resolved: URL;
  try {
    resolved = new URL(rawUri, cloudOrigin);
  } catch {
    return null;
  }
  const fileMatch = /^\/api\/files\/([^/]+)$/.exec(resolved.pathname);
  if (resolved.origin !== cloudOrigin.origin || !fileMatch?.[1]) return null;
  return {
    id: decodeURIComponent(fileMatch[1]),
    uri: CLOUD_API_BASE_URL
      ? resolved.toString()
      : `${resolved.pathname}${resolved.search}${resolved.hash}`,
  };
}

function waitFor(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Video generation was cancelled', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException('Video generation was cancelled', 'AbortError'));
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function cancelCloudVideoTask(taskId: string, expectedAccountId: string | undefined) {
  try {
    const headers = await getAuthHeaders(expectedAccountId);
    await accountBoundCloudFetch(
      `${CLOUD_API_BASE_URL}/api/media/video/cancel`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ task_id: taskId }),
        credentials: 'include',
      },
      expectedAccountId,
    );
  } catch {
    // The server-side reconciler settles a task the client could not cancel.
  }
}

export async function generateCloudVideo(input: {
  prompt: string;
  idempotencyKey: string;
  durationSecs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: number | undefined, status: string) => void;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}): Promise<CloudGeneratedVideo> {
  const expectedAccountId = captureDesktopCloudAccountId();
  const request = ManagedMediaVideoGenerationRequestSchema.parse({
    prompt: input.prompt,
    ...(input.durationSecs !== undefined ? { duration_secs: input.durationSecs } : {}),
  });
  const headers = await getAuthHeaders(expectedAccountId);
  headers['Idempotency-Key'] = input.idempotencyKey;

  const started = await accountBoundCloudFetch(
    `${CLOUD_API_BASE_URL}/api/media/video/generate`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
      signal: input.signal,
      credentials: 'include',
    },
    expectedAccountId,
  );
  if (!started.ok) throw await readCloudResponseError(started);

  const startPayload: unknown = await started.json();
  if (!startPayload || typeof startPayload !== 'object' || Array.isArray(startPayload)) {
    throw new Error('AGI Cloud returned an invalid video-generation response.');
  }
  const startRecord = startPayload as Record<string, unknown>;
  const taskId = startRecord['task_id'];
  if (typeof taskId !== 'string' || !taskId.trim()) {
    throw new Error('AGI Cloud accepted the video request but returned no task to poll.');
  }
  const provider = startRecord['provider'];
  const model = startRecord['model'];
  if (
    (provider !== 'runway' && provider !== 'google' && provider !== 'openrouter') ||
    typeof model !== 'string' ||
    !model.trim()
  ) {
    throw new Error('AGI Cloud returned incomplete video provenance.');
  }

  const intervalMs = input.pollIntervalMs ?? CLOUD_VIDEO_POLL_INTERVAL_MS;
  const deadline = Date.now() + (input.pollTimeoutMs ?? CLOUD_VIDEO_POLL_TIMEOUT_MS);

  for (;;) {
    try {
      await waitFor(intervalMs, input.signal);
    } catch (err) {
      await cancelCloudVideoTask(taskId, expectedAccountId);
      throw err;
    }

    const statusHeaders = await getAuthHeaders(expectedAccountId);
    const response = await accountBoundCloudFetch(
      `${CLOUD_API_BASE_URL}/api/media/video/status?task_id=${encodeURIComponent(taskId)}`,
      { method: 'GET', headers: statusHeaders, signal: input.signal, credentials: 'include' },
      expectedAccountId,
    );
    if (!response.ok) throw await readCloudResponseError(response);

    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('AGI Cloud returned an invalid video-status response.');
    }
    const record = payload as Record<string, unknown>;
    const status = typeof record['status'] === 'string' ? record['status'] : 'unknown';
    const progress = typeof record['progress'] === 'number' ? record['progress'] : undefined;
    input.onProgress?.(progress, status);

    if (status === 'completed') {
      const durable = durableCloudFileUri(record['video_url']);
      if (!durable) {
        throw new Error('AGI Cloud finished the video but returned no durable file URL.');
      }
      return { id: durable.id, uri: durable.uri, provider, model };
    }
    if (status === 'failed' || status === 'timeout') {
      const message =
        typeof record['error'] === 'string' && record['error'].trim()
          ? record['error']
          : 'AGI Cloud could not generate the video.';
      throw new Error(message);
    }

    if (Date.now() >= deadline) {
      await cancelCloudVideoTask(taskId, expectedAccountId);
      throw new Error('AGI Cloud did not finish the video before the polling window closed.');
    }
  }
}

class CloudSseEventLimitError extends Error {
  constructor() {
    super('AGI Cloud returned a stream event that exceeds the safe renderer limit.');
    this.name = 'CloudSseEventLimitError';
  }
}

class CloudSseIdleTimeoutError extends Error {
  constructor() {
    super(`AGI Cloud response stream was idle for ${CLOUD_SSE_IDLE_TIMEOUT_MS / 1_000} seconds.`);
    this.name = 'CloudSseIdleTimeoutError';
  }
}

class BoundedCloudSseDecoder {
  private buffer = '';
  private dataLines: string[] = [];
  private dataLength = 0;

  push(text: string): string[] {
    this.buffer += text;
    const events = this.drain(false);
    this.assertWithinLimit();
    return events;
  }

  finish(): string[] {
    const events = this.drain(true);
    if (this.dataLines.length > 0) events.push(this.takeEvent());
    this.buffer = '';
    this.assertWithinLimit();
    return events;
  }

  private assertWithinLimit(): void {
    if (this.buffer.length + this.dataLength > CLOUD_SSE_MAX_EVENT_CHARS) {
      throw new CloudSseEventLimitError();
    }
  }

  private drain(flush: boolean): string[] {
    const events: string[] = [];
    while (this.buffer.length > 0) {
      const lineEnding = this.findLineEnding();
      if (lineEnding === -1) break;
      if (this.buffer[lineEnding] === '\r' && lineEnding === this.buffer.length - 1 && !flush) {
        break;
      }

      const line = this.buffer.slice(0, lineEnding);
      const lineBreakLength =
        this.buffer[lineEnding] === '\r' && this.buffer[lineEnding + 1] === '\n' ? 2 : 1;
      this.buffer = this.buffer.slice(lineEnding + lineBreakLength);
      this.processLine(line, events);
      this.assertWithinLimit();
    }

    if (flush && this.buffer.length > 0) {
      const trailingLine = this.buffer;
      this.buffer = '';
      this.processLine(trailingLine, events);
    }
    return events;
  }

  private findLineEnding(): number {
    const lf = this.buffer.indexOf('\n');
    const cr = this.buffer.indexOf('\r');
    if (lf === -1) return cr;
    if (cr === -1) return lf;
    return Math.min(lf, cr);
  }

  private processLine(line: string, events: string[]): void {
    if (line.length === 0) {
      if (this.dataLines.length > 0) events.push(this.takeEvent());
      return;
    }
    if (line.startsWith(':')) return;

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field !== 'data') return;

    this.dataLines.push(value);
    this.dataLength += value.length + (this.dataLines.length > 1 ? 1 : 0);
  }

  private takeEvent(): string {
    const event = this.dataLines.join('\n');
    this.dataLines = [];
    this.dataLength = 0;
    return event;
  }
}

interface CloudRequestAbortScope {
  controller: AbortController;
  dispose: () => void;
}

function createCloudRequestAbortScope(callerSignal?: AbortSignal): CloudRequestAbortScope {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) {
    abortFromCaller();
  } else {
    callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
  }
  return {
    controller,
    dispose: () => callerSignal?.removeEventListener('abort', abortFromCaller),
  };
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('The Managed Cloud request was aborted.', 'AbortError');
}

function cancelResponseBody(response: Response, reason: Error): void {
  if (!response.body) return;
  try {
    void response.body.cancel(reason).catch(() => undefined);
  } catch {
    // Best-effort cleanup must not mask the protocol error being reported.
  }
}

function readCloudStreamChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  abortController: AbortController,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      abortController.signal.removeEventListener('abort', handleAbort);
    };
    const settle = (
      callback: (value: ReadableStreamReadResult<Uint8Array>) => void,
      value: ReadableStreamReadResult<Uint8Array>,
    ) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const handleAbort = () => {
      const error = abortReason(abortController.signal);
      try {
        void reader.cancel(error).catch(() => undefined);
      } catch {
        // The stream may already be closed or errored.
      }
      fail(error);
    };

    abortController.signal.addEventListener('abort', handleAbort, { once: true });
    const timer = setTimeout(() => {
      abortController.abort(new CloudSseIdleTimeoutError());
    }, CLOUD_SSE_IDLE_TIMEOUT_MS);

    if (abortController.signal.aborted) {
      handleAbort();
      return;
    }
    reader.read().then(
      (result) => settle(resolve, result),
      (error) => fail(error),
    );
  });
}

function resolveClientTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === 'string' && zone.trim().length > 0 && zone.length <= 64
      ? zone.trim()
      : null;
  } catch {
    return null;
  }
}

/**
 * Sends a message to a cloud conversation and streams the assistant reply
 * via SSE. Calls the provided callbacks as the stream progresses.
 *
 * @param conversationId - Target conversation ID
 * @param content        - User message text
 * @param model          - Model identifier to use for this request
 * @param onChunk        - Called with each incremental text chunk
 * @param onDone         - Called when the stream ends successfully
 * @param onError        - Called if a network or parse error occurs
 * @param signal         - Optional AbortSignal for cancellation
 */
export async function sendCloudMessage(
  conversationId: string,
  content: string,
  model: string,
  onChunk: (text: string) => void,
  onDone: () => void | Promise<void>,
  onError: (err: Error) => void,
  signal?: AbortSignal,
  onEvent?: (payload: Record<string, unknown>) => void,
  webSearch?: boolean,
  messageHistory?: Array<{
    role: 'user' | 'assistant' | 'system';
    content: CloudChatMessageContent;
  }>,
  thinkingEnabled?: boolean,
  codeExecution?: boolean,
  idempotencyKey?: string,
  requestOptions?: {
    research?: boolean;
    workMode?: CloudWorkMode;
    skillName?: string;
    effort?: string;
    assistantMessageId?: string;
  },
  onRunHandle?: (handle: ManagedCloudAgentRunHandle | null) => void,
  onCredential?: (credential: DesktopCloudRunCleanupCredential) => void,
): Promise<void> {
  let headers: Record<string, string>;
  const expectedAccountId = captureDesktopCloudAccountId();

  try {
    headers = await getAuthHeaders(expectedAccountId);
    if (!idempotencyKey) {
      throw new Error('Managed Cloud chat requires a stable idempotency key');
    }
    headers['Idempotency-Key'] = idempotencyKey;
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  const chatMessages =
    messageHistory && messageHistory.length > 0
      ? messageHistory
      : [{ role: 'user' as const, content }];

  const clientTimeZone = resolveClientTimeZone();

  const openAiBody: Record<string, unknown> = {
    model,
    messages: chatMessages,
    conversation_id: conversationId,
    stream: true,
    ...(webSearch || requestOptions?.research ? { web_search: true, web_fetch: true } : {}),
    ...(typeof thinkingEnabled === 'boolean' ? { thinking_mode: thinkingEnabled } : {}),
    ...(codeExecution ? { code_execution: true } : {}),
    ...(requestOptions?.research ? { research: true } : {}),
    ...(requestOptions?.workMode ? { work_mode: requestOptions.workMode } : {}),
    ...(requestOptions?.skillName ? { skill_name: requestOptions.skillName } : {}),
    ...(requestOptions?.effort ? { effort: requestOptions.effort } : {}),
    ...(requestOptions?.assistantMessageId
      ? { assistant_message_id: requestOptions.assistantMessageId }
      : {}),
    ...(clientTimeZone ? { client_timezone: clientTimeZone } : {}),
    use_prompt_cache: true,
  };

  const abortScope = createCloudRequestAbortScope(signal);
  try {
    let res: Response;
    try {
      res = await accountBoundCloudFetch(
        `${CLOUD_API_BASE_URL}/api/llm/v1/chat/completions`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(openAiBody),
          signal: abortScope.controller.signal,
          credentials: 'include',
        },
        expectedAccountId,
        undefined,
        onCredential,
      );
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    try {
      const runHandle = readManagedCloudAgentRunHandle(res);
      onRunHandle?.(runHandle);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      cancelResponseBody(res, error);
      abortScope.controller.abort(error);
      onError(error);
      return;
    }

    await consumeCloudSseResponse(res, onChunk, onDone, onError, onEvent, abortScope.controller);
  } finally {
    abortScope.dispose();
  }
}

export async function sendCloudApprovalResume(
  runId: string,
  toolApprovals: Array<{ tool_call_id: string; decision: 'approved' | 'rejected' }>,
  onChunk: (text: string) => void,
  onDone: () => void | Promise<void>,
  onError: (err: Error) => void,
  signal?: AbortSignal,
  onEvent?: (payload: Record<string, unknown>) => void,
  idempotencyKey?: string,
  onCredential?: (credential: DesktopCloudRunCleanupCredential) => void,
): Promise<void> {
  let headers: Record<string, string>;
  const expectedAccountId = captureDesktopCloudAccountId();

  try {
    headers = await getAuthHeaders(expectedAccountId);
    if (!idempotencyKey) {
      throw new Error('Managed Cloud tool resume requires a stable idempotency key');
    }
    headers['Idempotency-Key'] = idempotencyKey;
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  const abortScope = createCloudRequestAbortScope(signal);
  try {
    let res: Response;
    try {
      res = await accountBoundCloudFetch(
        `${CLOUD_API_BASE_URL}${TOOL_APPROVAL_RESUME_PATH}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ run_id: runId, tool_approvals: toolApprovals }),
          signal: abortScope.controller.signal,
          credentials: 'include',
        },
        expectedAccountId,
        undefined,
        onCredential,
      );
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    await consumeCloudSseResponse(res, onChunk, onDone, onError, onEvent, abortScope.controller);
  } finally {
    abortScope.dispose();
  }
}

async function consumeCloudSseResponse(
  res: Response,
  onChunk: (text: string) => void,
  onDone: () => void | Promise<void>,
  onError: (err: Error) => void,
  onEvent?: (payload: Record<string, unknown>) => void,
  abortController = new AbortController(),
): Promise<void> {
  if (!res.ok) {
    onError(await readCloudResponseError(res));
    return;
  }

  if (!res.body) {
    onError(new Error('Send message response has no body'));
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  const sseDecoder = new BoundedCloudSseDecoder();
  const canonicalCursor: {
    sessionId?: string;
    turnId?: string;
    sequence: number;
  } = { sequence: -1 };

  try {
    while (true) {
      const { done, value } = await readCloudStreamChunk(reader, abortController);

      if (done) {
        const trailingText = decoder.decode();
        const events = [
          ...(trailingText ? sseDecoder.push(trailingText) : []),
          ...sseDecoder.finish(),
        ];
        for (const event of events) {
          if (event.trim() === '[DONE]') {
            await onDone();
            return;
          }
          const terminalError = parseAndDispatchLine(
            event,
            onChunk,
            onError,
            onEvent,
            canonicalCursor,
          );
          if (terminalError) return;
        }
        await onDone();
        return;
      }

      const events = sseDecoder.push(decoder.decode(value, { stream: true }));
      for (const event of events) {
        if (event.trim() === '[DONE]') {
          await onDone();
          return;
        }
        const terminalError = parseAndDispatchLine(
          event,
          onChunk,
          onError,
          onEvent,
          canonicalCursor,
        );
        if (terminalError) return;
      }
    }
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
  } finally {
    try {
      void reader.cancel().catch(() => undefined);
    } catch {
      // The reader may already be closed or errored.
    }
    try {
      reader.releaseLock();
    } catch {
      // A hostile stream may keep a cancelled read pending; cleanup must not
      // hide the bounded timeout/contract error already reported to the UI.
    }
  }
}

export class CloudApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly resetAt: string | undefined;

  constructor(
    message: string,
    options: { status: number; code?: string | undefined; resetAt?: string | undefined },
  ) {
    super(message);
    this.name = 'CloudApiError';
    this.status = options.status;
    this.code = options.code;
    this.resetAt = options.resetAt;
  }
}

function readErrorString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readCloudErrorResetAt(payload: unknown, response: Response): string | undefined {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const body = payload as Record<string, unknown>;
    const error = body['error'];
    const candidate =
      error && typeof error === 'object' && !Array.isArray(error)
        ? (error as Record<string, unknown>)['reset_at']
        : body['reset_at'];
    if (typeof candidate === 'string' && !Number.isNaN(Date.parse(candidate))) {
      return new Date(candidate).toISOString();
    }
  }
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) {
      return new Date(Date.now() + seconds * 1000).toISOString();
    }
  }
  return undefined;
}

async function readCloudResponseError(response: Response): Promise<CloudApiError> {
  let serverMessage: string | undefined;
  let serverCode: string | undefined;
  let payload: unknown;
  try {
    payload = await response.json();
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const record = payload as Record<string, unknown>;
      const nested =
        record['error'] && typeof record['error'] === 'object' && !Array.isArray(record['error'])
          ? (record['error'] as Record<string, unknown>)
          : undefined;
      serverMessage =
        readErrorString(record['message']) ??
        readErrorString(nested?.['message']) ??
        readErrorString(record['error']);
      serverCode = readErrorString(nested?.['code']) ?? readErrorString(record['code']);
    }
  } catch {
    // Never surface an untrusted HTML/error response body. The status remains
    // enough to diagnose the request without leaking response content.
  }
  const resetAt = readCloudErrorResetAt(payload, response);

  const message =
    serverMessage ||
    (response.status === 401 || response.status === 403
      ? 'Your AGI Cloud session is no longer authorized. Please connect again.'
      : response.status === 429
        ? 'AGI Cloud is receiving too many requests. Please wait and retry.'
        : `AGI Cloud request failed (HTTP ${response.status}).`);
  return new CloudApiError(message, {
    status: response.status,
    ...(serverCode ? { code: serverCode } : {}),
    ...(resetAt ? { resetAt } : {}),
  });
}

function parseAndDispatchLine(
  line: string,
  onChunk: (text: string) => void,
  onError: (err: Error) => void,
  onEvent?: (payload: Record<string, unknown>) => void,
  canonicalCursor: { sessionId?: string; turnId?: string; sequence: number } = { sequence: -1 },
): boolean {
  const jsonStr = line.startsWith('data: ') ? line.slice('data: '.length) : line;

  if (jsonStr === '[DONE]') {
    return false;
  }

  try {
    const parsed: unknown = JSON.parse(jsonStr);

    if (!parsed || typeof parsed !== 'object') {
      return false;
    }

    const obj = parsed as Record<string, unknown>;
    const choices = obj['choices'];
    const firstDelta =
      Array.isArray(choices) && choices[0] && typeof choices[0] === 'object'
        ? (choices[0] as Record<string, unknown>)['delta']
        : undefined;
    const envelope =
      firstDelta && typeof firstDelta === 'object'
        ? parseAgentEventDelta((firstDelta as Record<string, unknown>)['x_agent_event'])
        : null;
    if (
      envelope &&
      canonicalCursor.sessionId === envelope.sessionId &&
      canonicalCursor.turnId === envelope.turnId &&
      envelope.sequence <= canonicalCursor.sequence
    ) {
      return false;
    }
    if (envelope) {
      canonicalCursor.sessionId = envelope.sessionId;
      canonicalCursor.turnId = envelope.turnId;
      canonicalCursor.sequence = envelope.sequence;
    }
    onEvent?.(obj);

    const rawError = obj['error'];
    const streamErrorMessage =
      typeof rawError === 'string'
        ? rawError
        : rawError && typeof rawError === 'object' && !Array.isArray(rawError)
          ? (rawError as Record<string, unknown>)['message']
          : undefined;
    if (typeof streamErrorMessage === 'string' && streamErrorMessage.trim()) {
      onError(new Error(streamErrorMessage));
      return true;
    }

    if (typeof obj['text'] === 'string') {
      onChunk(obj['text']);
      return false;
    }

    if (Array.isArray(choices) && choices.length > 0) {
      const delta = (choices[0] as Record<string, unknown>)['delta'];
      if (delta && typeof delta === 'object') {
        const deltaContent = (delta as Record<string, unknown>)['content'];
        if (typeof deltaContent === 'string') {
          onChunk(deltaContent);
        }
      }
    }
    return false;
  } catch {
    onError(new Error('AGI Cloud returned a malformed stream event.'));
    return true;
  }
}

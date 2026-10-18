import type {
  ChatRuntime,
  Artifact,
  InterruptedTurn,
  SendMessageOptions,
  SendMessageParams,
  SteeredMessage,
  StreamChunk,
  TauriAttachmentPayload,
  TurnUsage,
} from '@agiworkforce/unified-chat';
import type { Conversation, ChatMessage } from '@agiworkforce/unified-chat';
import {
  SteerRefusedError,
  useChatArtifactStore,
  useChatModelStore,
  useChatUIStore,
} from '@agiworkforce/unified-chat';
import {
  getModelMetadataById,
  getToolDisplayLabel,
  type AgentEventEnvelope,
  type AgentEventToolCategory,
  type ChatExecutionMode,
} from '@agiworkforce/types';
import type { AgentEvent, JsonValue } from '@agiworkforce/types/protocol';
import type { AgentEventSource } from '@agiworkforce/types';
import { AGENT_EVENT_SCHEMA_VERSION } from '@agiworkforce/types';
import { invoke } from '../lib/tauri-mock';
import { listen } from '../lib/tauri-mock';
import { useSettingsStore } from '../stores/settingsStore';
import { personalizationToPrompt } from '../features/chat/personalizationToPrompt';
import { ACCOUNT_INSTRUCTION, orderLocalPromptBlocks } from '../lib/context-precedence';
import {
  dbIdToUuid,
  resolveDesktopChatOwnerId,
  useChatStore as useDesktopChatStore,
  uuidToDbId,
} from '../stores/chat/chatStore';
import { useArtifactStore } from '../stores/artifactStore';
import { useProjectStore } from '../stores/projectStore';
import { useSkillMarketplaceStore } from '../stores/skillMarketplaceStore';
import { toast } from 'sonner';
import { PartialArtifactAccumulator } from './partialArtifactArgs';
import {
  LOCAL_CHAT_ATTACHMENT_POLICY,
  messageDetailFromRow,
  storedAttachmentList,
  temporaryHistoryTurns,
  TurnDetailRecorder,
  unreadableImageNotice,
  type RawMessageDetail,
} from './localChatTurn';

async function resolveSkillSystemPrompt(options?: SendMessageOptions): Promise<string | undefined> {
  if (!options?.skillName) return options?.systemPrompt;
  const instructions = await useSkillMarketplaceStore
    .getState()
    .getSkillInstructions(options.skillName);
  if (!instructions?.trim()) return options.systemPrompt;
  return [options.systemPrompt, instructions]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join('\n\n');
}

interface StreamChunkPayload {
  conversation_id: string | number;
  message_id: string | number;
  delta: string;
  content: string;
}

interface StreamEndPayload {
  conversation_id: string | number;
  message_id: string | number;
  backend_message_id?: number;
  usage?: {
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
    total_tokens?: number | null;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  } | null;
  model?: string | null;
}

function tokenCount(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function turnContextWindow(modelId: string | undefined): number | undefined {
  if (!modelId) return undefined;
  const catalogWindow = getModelMetadataById(modelId)?.contextWindow;
  if (catalogWindow !== undefined) return catalogWindow;
  const runtimeModel = useChatModelStore
    .getState()
    .models.find((candidate) => candidate.id === modelId && candidate.metadataSource === 'runtime');
  return runtimeModel?.contextWindow;
}

export function turnUsageFromStreamEnd(
  usage: StreamEndPayload['usage'],
  modelId: string | undefined,
): TurnUsage | undefined {
  if (!usage) return undefined;
  const turnUsage: TurnUsage = {
    inputTokens: tokenCount(usage.prompt_tokens),
    outputTokens: tokenCount(usage.completion_tokens),
    cacheReadTokens: tokenCount(usage.cache_read_input_tokens),
    cacheWriteTokens: tokenCount(usage.cache_creation_input_tokens),
  };
  if (turnUsage.inputTokens === undefined && turnUsage.outputTokens === undefined) {
    return undefined;
  }
  const contextWindow = turnContextWindow(modelId);
  return contextWindow === undefined ? turnUsage : { ...turnUsage, contextWindow };
}

interface AttachmentNoticePayload {
  conversation_id: string | number;
  notice: string;
}

interface ToolsWithheldPayload {
  conversation_id: string | number;
  notice: string;
}

/** The native `ChatSourcesEvent` (sys/commands/chat/sources.rs). */
interface ChatSourcesPayload {
  conversation_id: string | number;
  kind: 'web_search' | 'project_knowledge';
  tool_call_id?: string;
  query?: string;
  sources: AgentEventSource[];
}

const PROJECT_KNOWLEDGE_SOURCES_LABEL = 'Project knowledge';

type SearchResults = Extract<
  import('@agiworkforce/unified-chat').StreamEvent,
  { type: 'search_results' }
>['search'];

type LocalStreamChunk = StreamChunk | { type: 'search_results'; search: SearchResults };

function sourceDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

interface StreamErrorPayload {
  conversation_id: string | number;
  message_id: string | number;
  error: string;
}

interface QuestionAskPayload {
  id: string;
  question: string;
  choices: string[];
  multiSelect?: boolean;
}

interface BlockedByModePayload {
  tool_name: string;
  mode: string;
  hint: string;
}

interface MessageConsumedPayload {
  conversation_id: string | number;
  message_id: string | number;
  pending_message?: { id?: string };
}

/** The native `ToolEvent` (sys/commands/chat/tool_events.rs), tagged by `type`. */
interface ToolEventPayload {
  type: 'started' | 'progress' | 'completed';
  id: string;
  conversation_id?: number;
  message_id?: string | number;
  tool_name?: string;
  arguments?: unknown;
  success?: boolean;
  output?: string | null;
  error?: string | null;
  duration_ms?: number;
  stdout_chunk?: string | null;
}

function toolArguments(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

interface ThinkingEventPayload {
  event_type: 'start' | 'delta' | 'complete';
  content: string;
  message_id?: string | null;
  tokens?: number | null;
  timestamp: number;
}

interface AgentProgressPayload {
  conversation_id: string | number;
  iteration: number;
  max_iterations: number;
  status: string;
  tool_count?: number;
}

interface ArtifactEventPayload {
  conversation_id: string | number | null;
  message_id?: string | number | null;
  artifact: {
    id: string;
    type: string;
    title?: string;
    content: string;
    language?: string | null;
    metadata?: Record<string, unknown>;
    version?: number;
    created_at?: string;
    updated_at?: string;
  };
}

interface ArtifactProgressPayload {
  conversation_id: string | number;
  message_id: string | number;
  tool_call_index: number;
  seq: number;
  delta: string;
}

interface RawArtifactResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

interface RawArtifact {
  id: string;
  content: string;
}

interface RawArtifactVersion {
  version: number;
  content: string;
  created_at?: string;
}

interface RawConversationArtifact {
  id: string;
  artifact_type?: string;
  render_type: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
  conversation_id?: string | number | null;
  message_id?: string | number | null;
  current_version: number;
  created_at?: string;
  updated_at?: string;
}

const ARTIFACT_RENDER_TYPES = new Set<Artifact['type']>([
  'code',
  'react',
  'component',
  'chart',
  'diagram',
  'table',
  'mermaid',
  'spreadsheet',
  'presentation',
  'html',
  'image',
  'video',
  'audio',
  'music',
  'search',
  'document',
  'markdown',
  'json',
  'csv',
  'svg',
  'email',
  'research',
]);

function isArtifactRenderType(value: unknown): value is Artifact['type'] {
  return typeof value === 'string' && ARTIFACT_RENDER_TYPES.has(value as Artifact['type']);
}

export function resolveArtifactRenderType(
  renderType: unknown,
  nativeType?: unknown,
): Artifact['type'] {
  if (isArtifactRenderType(renderType)) return renderType;
  switch (nativeType) {
    case 'code':
    case 'document':
    case 'spreadsheet':
    case 'diagram':
    case 'chart':
    case 'presentation':
    case 'image':
      return nativeType;
    case 'web':
      return 'html';
    default:
      return 'document';
  }
}

function isRawConversationArtifact(value: unknown): value is RawConversationArtifact {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['id'] === 'string' &&
    candidate['id'].trim().length > 0 &&
    typeof candidate['render_type'] === 'string' &&
    typeof candidate['title'] === 'string' &&
    typeof candidate['content'] === 'string' &&
    typeof candidate['current_version'] === 'number' &&
    Number.isInteger(candidate['current_version']) &&
    candidate['current_version'] >= 0
  );
}

function inferAgentToolCategory(name: string): AgentEventToolCategory {
  const normalized = name.toLowerCase();
  if (normalized.includes('browser') || normalized.includes('computer')) return 'computer-use';
  if (normalized.includes('web_search') || normalized.includes('search_web')) return 'web-search';
  if (normalized.includes('web_fetch') || normalized.includes('fetch_url')) return 'web-fetch';
  if (normalized.includes('read') || normalized.includes('write') || normalized.includes('file')) {
    return 'filesystem';
  }
  if (
    normalized.includes('shell') ||
    normalized.includes('bash') ||
    normalized.includes('terminal')
  ) {
    return 'shell';
  }
  if (normalized.includes('code') || normalized.includes('python')) return 'code-execution';
  if (normalized.includes('artifact')) return 'artifact';
  if (normalized.includes('memory')) return 'memory';
  if (normalized.includes('skill')) return 'skill';
  if (normalized.startsWith('mcp__')) return 'mcp';
  if (normalized.includes('connector')) return 'connector';
  return 'other';
}

function toAgentJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(toAgentJsonValue);
  if (typeof value !== 'object') return null;

  const result: { [key: string]: JsonValue } = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (nestedValue !== undefined) result[key] = toAgentJsonValue(nestedValue);
  }
  return result;
}

interface RawConversation {
  id: string | number;
  title: string | null;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
  pinned?: boolean;
  project_id?: string;
  projectId?: string;
  model?: string;
  message_count?: number;
  messageCount?: number;
  last_message?: string;
  lastMessage?: string;
  tags?: string[];
  archived?: boolean;
  execution_mode?: ChatExecutionMode;
  executionMode?: ChatExecutionMode;
}

interface RawMessage extends RawMessageDetail {
  id: string | number;
  conversation_id?: string | number;
  conversationId?: string | number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: string;
  createdAt?: string;
  model?: string;
  provider?: string;
}

interface RawSendMessageResponse {
  user_message?: { id?: number };
}

interface LocalTurn {
  userMessageId?: string;
  assistantMessageId?: string;
  files?: File[];
  history?: SendMessageOptions['messageHistory'];
}

/** The conversation id the native runtime reports for a turn it does not store. */
const TEMPORARY_CONVERSATION_ID = -1;
// Mirrors PROMPT_REFUSAL_PREFIX in src-tauri/src/ui/hooks/mod.rs. A steer
// refused with it is dropped; any other failure is queued to send later.
const PROMPT_REFUSAL_PREFIX = 'A hook blocked this message: ';

interface RawInterruptedTurn {
  conversationId: number;
  content: string;
  startedAt: string;
}

interface RawPendingMessage {
  id: string;
  content: string;
}

function mapConversation(raw: RawConversation): Conversation {
  return {
    id: String(raw.id),
    title: raw.title ?? 'New Conversation',
    createdAt: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updated_at ?? raw.updatedAt ?? new Date().toISOString(),
    pinned: raw.pinned ?? false,
    projectId: raw.project_id ?? raw.projectId,
    model: raw.model,
    messageCount: raw.message_count ?? raw.messageCount ?? 0,
    lastMessage: raw.last_message ?? raw.lastMessage,
    tags: raw.tags,
    archived: raw.archived ?? false,
    executionMode: raw.execution_mode ?? raw.executionMode,
  };
}

function mapMessage(raw: RawMessage): ChatMessage {
  return {
    id: String(raw.id),
    conversationId: String(raw.conversation_id ?? raw.conversationId ?? ''),
    role: raw.role,
    content: raw.content,
    createdAt: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
    model: raw.model ?? undefined,
    provider: raw.provider as ChatMessage['provider'] | undefined,
    ...messageDetailFromRow(raw),
  };
}

function mapPersistedArtifact(raw: RawConversationArtifact): Artifact {
  const metadata = raw.metadata ?? {};
  const metadataLanguage = metadata['language'];
  return {
    id: raw.id,
    type: resolveArtifactRenderType(raw.render_type, raw.artifact_type),
    title: raw.title,
    content: raw.content,
    language: typeof metadataLanguage === 'string' ? metadataLanguage : undefined,
    version: raw.current_version,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    conversationId:
      raw.conversation_id === null || raw.conversation_id === undefined
        ? undefined
        : String(raw.conversation_id),
    messageId:
      raw.message_id === null || raw.message_id === undefined ? undefined : String(raw.message_id),
    metadata,
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read attachment "${file.name}"`));
    reader.readAsDataURL(file);
  });
}

function sanitizeAttachmentName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  return base.replace(/\.\./g, '_');
}

async function encodeAttachmentsForIpc(files: File[]): Promise<TauriAttachmentPayload[]> {
  return Promise.all(
    files.map(async (file) => {
      const dataUrl = await readFileAsDataUrl(file);
      return {
        id: crypto.randomUUID(),
        type: file.type.startsWith('image/') ? 'image' : 'file',
        name: sanitizeAttachmentName(file.name),
        mimeType: file.type || undefined,
        content: dataUrl,
      } satisfies TauriAttachmentPayload;
    }),
  );
}

function resolveModelCapabilities(modelId: string | undefined) {
  const capabilities = modelId ? getModelMetadataById(modelId)?.capabilities : undefined;
  const runtimeModel = modelId
    ? useChatModelStore.getState().models.find((candidate) => candidate.id === modelId)
    : undefined;
  if (!capabilities && runtimeModel?.metadataSource !== 'runtime') return undefined;

  return {
    tools: capabilities?.tools ?? runtimeModel?.supportsTools ?? false,
    vision: capabilities?.vision ?? runtimeModel?.supportsVision ?? false,
    computerUse: capabilities?.computerUse ?? false,
    search: capabilities?.search ?? false,
    codeExecution: capabilities?.codeExecution ?? false,
    imageGen: capabilities?.imageGen ?? false,
    agentic: capabilities?.agentic ?? false,
    thinking: capabilities?.thinking ?? runtimeModel?.supportsThinking ?? false,
  };
}

export class TauriRuntime implements ChatRuntime {
  readonly supportsExplicitLocalWebSearch = true;

  readonly supportsAgentControl = true;

  // Plan is enforced by the native chat tool loop (chat_set_plan_mode), which
  // refuses every tool that could write. Ask leaves tool approval to the
  // agent mode chosen in Settings. Auto and Bypass have no native enforcement
  // in this runtime, so they are not offered.
  readonly agentModes = ['ask', 'plan'] as const;

  readonly supportsReasoningEffort = true;

  readonly attachmentPolicy = LOCAL_CHAT_ATTACHMENT_POLICY;

  private readonly _stopFlags = new Map<string, boolean>();
  private readonly _stopSettlers = new Map<string, () => void>();

  private readonly _streamCallbacks = new Set<
    (event: import('@agiworkforce/unified-chat').StreamEvent) => void
  >();

  private getCurrentUserId(): string {
    return resolveDesktopChatOwnerId();
  }

  private getConversationExecutionMode(conversationId: string): ChatExecutionMode {
    const conversation = useDesktopChatStore
      .getState()
      .conversations.find((candidate) => candidate.id === conversationId);
    if (conversation?.executionMode === 'byok') return 'byok';
    return 'local_only';
  }

  private isTemporaryConversation(conversationId: string): boolean {
    return (
      useDesktopChatStore
        .getState()
        .conversations.find((candidate) => candidate.id === conversationId)?.incognito === true
    );
  }

  private async ensureBackendConversation(
    frontendConversationId: string,
    content: string,
    executionMode: ChatExecutionMode,
  ): Promise<number> {
    const existingId = uuidToDbId(frontendConversationId);
    if (typeof existingId === 'number' && existingId > 0) {
      return existingId;
    }

    const userId = this.getCurrentUserId();
    if (!userId) {
      throw new Error('Please sign in to send messages.');
    }

    const stored = useDesktopChatStore
      .getState()
      .conversations.find((c) => c.id === frontendConversationId);
    const storedTitle = stored?.title?.trim();

    const raw = await invoke<RawConversation>('chat_create_conversation', {
      request: {
        title:
          storedTitle && storedTitle !== 'New chat'
            ? storedTitle.slice(0, 500)
            : content.trim().slice(0, 50) || 'New Conversation',
        userId,
        projectId: stored?.projectId ?? null,
        executionMode,
      },
    });

    const dbId = Number(raw.id);
    if (!Number.isFinite(dbId) || dbId <= 0) {
      throw new Error('Failed to create a backend conversation.');
    }

    useDesktopChatStore.getState().linkConversationId(frontendConversationId, dbId);
    if (stored?.pinned) {
      void invoke('chat_pin_conversation', { conversationId: dbId, userId, pinned: true }).catch(
        (error: unknown) => {
          console.error('[TauriRuntime] Failed to save a pin made before the first send:', error);
          toast.error('This chat was saved, but its pin was not. Pin it again from the sidebar.');
        },
      );
    }
    if (import.meta.env.DEV) {
      const { desktopExecutionProfileFor, labelDesktopSession } = await import('./sessionLabeling');
      labelDesktopSession({
        id: String(dbId),
        ownerUserId: userId,
        chatExecutionMode: executionMode,
      });
      desktopExecutionProfileFor(executionMode);
    }
    return dbId;
  }

  async sendMessage(
    conversationId: string,
    content: string,
    options?: SendMessageOptions,
  ): Promise<void> {
    const attachments =
      options?.attachments && options.attachments.length > 0
        ? await encodeAttachmentsForIpc(options.attachments)
        : undefined;
    const localToolScope = options?.workMode === 'agiwork' ? 'agi_work' : options?.localToolScope;
    const params: SendMessageParams = {
      conversationId,
      content,
      model: options?.model,
      provider: options?.provider,
      attachments,
      signal: options?.signal,
      thinkingEnabled: options?.thinkingEnabled,
      webSearch: options?.webSearch,
      systemPrompt: await resolveSkillSystemPrompt(options),
      agentMode: options?.agentMode,
      effort: options?.effort,
      localToolScope,
      enableTools: localToolScope !== undefined,
    };
    const turn: LocalTurn = {
      userMessageId: options?.userMessageId,
      assistantMessageId: options?.assistantMessageId,
      files: options?.attachments,
      history: options?.messageHistory,
    };
    for await (const chunk of this._streamMessage(params, turn)) {
      if (this._streamCallbacks.size > 0) {
        let event: import('@agiworkforce/unified-chat').StreamEvent | null = null;
        if (chunk.type === 'text') event = { type: 'content', content: chunk.content };
        else if (chunk.type === 'thinking') {
          event = {
            type: 'thinking',
            content: chunk.content,
            durationMs: chunk.durationMs,
            completed: chunk.completed,
          };
        } else if (chunk.type === 'agent_event') {
          event = { type: 'agent_event', envelope: chunk.data };
        } else if (chunk.type === 'tool_call') {
          event = {
            type: 'tool_call',
            toolCall: {
              id: chunk.data.id,
              name: chunk.data.name,
              args: chunk.data.input ?? {},
            },
          };
        } else if (chunk.type === 'tool_result') {
          event = {
            type: 'tool_result',
            toolCallId: chunk.data.id,
            result: chunk.data.output,
            error: chunk.data.error,
            durationMs: chunk.data.durationMs,
          };
        } else if (chunk.type === 'artifact') {
          event = {
            type: 'artifact',
            artifact: chunk.data,
          };
        } else if (chunk.type === 'steer_consumed') {
          event = { type: 'steer_consumed', steerId: chunk.steerId };
        } else if (chunk.type === 'question') {
          event = { type: 'question', question: chunk.question };
        } else if (chunk.type === 'notice') {
          event = { type: 'notice', message: chunk.message };
        } else if (chunk.type === 'search_results') {
          event = { type: 'search_results', search: chunk.search };
        } else if (chunk.type === 'done') {
          event = chunk.usage ? { type: 'done', usage: chunk.usage } : { type: 'done' };
        } else if (chunk.type === 'error') event = { type: 'error', error: chunk.content };
        if (event) {
          for (const cb of this._streamCallbacks) {
            cb(event);
          }
        }
      }
    }
  }

  onStream(
    callback: (event: import('@agiworkforce/unified-chat').StreamEvent) => void,
  ): () => void {
    this._streamCallbacks.add(callback);
    return () => this._streamCallbacks.delete(callback);
  }

  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    return this.loadMessages(conversationId);
  }

  async listConversations(): Promise<{ id: string; title: string; updatedAt: string }[]> {
    const convs = await this.loadConversations();
    return convs.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt }));
  }

  private async *_streamMessage(
    params: SendMessageParams,
    turn: LocalTurn = {},
  ): AsyncIterable<LocalStreamChunk> {
    const {
      conversationId,
      content,
      model,
      provider,
      attachments,
      signal,
      thinkingEnabled,
      webSearch,
      systemPrompt,
      agentMode,
      effort,
      localToolScope,
      enableTools,
    } = params;
    const frontendMessageId = crypto.randomUUID();
    const userId = this.getCurrentUserId();
    const executionMode = this.getConversationExecutionMode(conversationId);
    const temporary = this.isTemporaryConversation(conversationId);
    const turnDetail = new TurnDetailRecorder();

    if (!userId) {
      yield { type: 'error', content: 'Please sign in to send messages.' };
      return;
    }

    const imageNotice = unreadableImageNotice(model, attachments);
    if (imageNotice) {
      yield { type: 'error', content: imageNotice };
      return;
    }

    let backendConversationId: number;
    try {
      // A temporary chat is never written to SQLite; the native runtime answers
      // it under the reserved id -1 and skips history, memory and indexing.
      backendConversationId = temporary
        ? TEMPORARY_CONVERSATION_ID
        : await this.ensureBackendConversation(conversationId, content, executionMode);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      yield { type: 'error', content: message };
      return;
    }

    this._stopFlags.set(conversationId, false);

    type Resolve = (value: LocalStreamChunk | null) => void;
    const queue: LocalStreamChunk[] = [];
    const toolExecutionIds: string[] = [];
    const waiting: Resolve[] = [];
    const streamedArtifactIds = new Set<string>();
    const artifactDraftAccumulators = new Map<string, PartialArtifactAccumulator>();
    let activeArtifactDraftKey: string | null = null;
    let done = false;
    let streamEndHandled = false;
    let agentEventSequence = 0;
    let thinkingStartedAtMs = Date.now();
    let streamedThinkingContent = '';
    let stopWatchdog: ReturnType<typeof setTimeout> | undefined;

    const push = (chunk: LocalStreamChunk | null) => {
      if (chunk === null) {
        done = true;
      } else {
        queue.push(chunk);
      }
      const resolve = waiting.shift();
      if (resolve) {
        resolve(queue.shift() ?? null);
      }
    };

    const nextChunk = (): Promise<LocalStreamChunk | null> => {
      if (queue.length > 0) {
        return Promise.resolve(queue.shift()!);
      }
      if (done) {
        return Promise.resolve(null);
      }
      return new Promise<LocalStreamChunk | null>((resolve) => {
        waiting.push(resolve);
      });
    };

    const beginStopWait = () => {
      if (stopWatchdog) return;
      stopWatchdog = setTimeout(() => {
        push({
          type: 'error',
          content:
            'Stopping generation timed out before the native runtime could finalize the response and its artifacts.',
        });
        push(null);
      }, 10_000);
    };
    this._stopSettlers.set(conversationId, beginStopWait);

    const unlisteners: Array<() => void> = [];

    const registerListener = async <T>(
      event: string,
      handler: (payload: T) => void,
    ): Promise<void> => {
      const unlisten = await listen<T>(event, ({ payload }) => handler(payload));
      unlisteners.push(unlisten);
    };

    const pushAgentEvent = (event: AgentEvent) => {
      const envelope: AgentEventEnvelope = {
        schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
        sessionId: String(backendConversationId),
        turnId: frontendMessageId,
        sequence: agentEventSequence++,
        emittedAtMs: Date.now(),
        event,
      };
      push({ type: 'agent_event', data: envelope });
    };

    await registerListener<ThinkingEventPayload>('thinking:event', (payload) => {
      if (payload.message_id && payload.message_id !== frontendMessageId) return;

      if (payload.event_type === 'start') {
        thinkingStartedAtMs = payload.timestamp;
        streamedThinkingContent = '';
        return;
      }

      const durationMs = Math.max(0, payload.timestamp - thinkingStartedAtMs);
      if (payload.event_type === 'delta') {
        streamedThinkingContent += payload.content;
        turnDetail.appendThinking(payload.content);
        push({
          type: 'thinking',
          content: payload.content,
          durationMs,
          completed: false,
        });
        return;
      }

      const unseenContent = payload.content.startsWith(streamedThinkingContent)
        ? payload.content.slice(streamedThinkingContent.length)
        : streamedThinkingContent.endsWith(payload.content)
          ? ''
          : payload.content;
      streamedThinkingContent =
        payload.content.length >= streamedThinkingContent.length
          ? payload.content
          : streamedThinkingContent;
      turnDetail.appendThinking(unseenContent);
      push({
        type: 'thinking',
        content: unseenContent,
        durationMs,
        completed: true,
      });
    });

    await registerListener<AgentProgressPayload>('chat:agent-progress', (payload) => {
      if (String(payload.conversation_id) !== String(backendConversationId)) return;
      const toolCount = payload.tool_count ?? 0;
      const limitReached = payload.status === 'limit_reached';
      pushAgentEvent({
        type: 'progress-update',
        progressId: 'local-agent-iteration',
        summary: limitReached
          ? `Agent reached iteration limit (${payload.max_iterations})`
          : `Agent iteration ${payload.iteration}/${payload.max_iterations}${
              toolCount > 0 ? `, ${toolCount} ${toolCount === 1 ? 'tool' : 'tools'}` : ''
            }`,
        ...(limitReached ? {} : { detail: 'Running local tools' }),
        status: limitReached ? 'failed' : 'running',
      });
    });

    await registerListener<StreamChunkPayload>('chat:stream-chunk', (payload) => {
      const convId = String(payload.conversation_id);
      if (
        convId !== String(backendConversationId) &&
        payload.conversation_id !== backendConversationId
      )
        return;
      push({ type: 'text', content: payload.delta });
    });

    await registerListener<StreamEndPayload>('chat:stream-end', (payload) => {
      const convId = String(payload.conversation_id);
      if (
        convId !== String(backendConversationId) &&
        payload.conversation_id !== backendConversationId
      )
        return;
      if (streamEndHandled) return;
      streamEndHandled = true;

      void (async () => {
        const backendMessageId = payload.backend_message_id;
        if (
          streamedArtifactIds.size > 0 &&
          typeof backendMessageId === 'number' &&
          backendMessageId > 0
        ) {
          const response = await invoke<RawArtifactResponse<number>>('artifact_link_to_message', {
            conversationId: backendConversationId,
            messageId: backendMessageId,
            artifactIds: [...streamedArtifactIds],
            userId,
          });
          if (!response.success) {
            push({
              type: 'error',
              content:
                response.error ??
                'The response completed, but its artifacts could not be saved to conversation history.',
            });
            push(null);
            return;
          }
        }

        if (!temporary && typeof backendMessageId === 'number' && backendMessageId > 0) {
          await this.saveMessageDetail(backendMessageId, userId, {
            clientId: turn.assistantMessageId ?? null,
            toolCalls: turnDetail.toolCalls(),
            thinking: turnDetail.thinking(),
            sources: turnDetail.sources(),
          });
        }

        const usage = turnUsageFromStreamEnd(payload.usage, payload.model ?? model);
        push(usage ? { type: 'done', usage } : { type: 'done' });
        push(null);
      })().catch((error: unknown) => {
        push({
          type: 'error',
          content:
            error instanceof Error
              ? error.message
              : 'The response completed, but its artifacts could not be saved to conversation history.',
        });
        push(null);
      });
    });

    await registerListener<QuestionAskPayload>('question:ask', (payload) => {
      if (typeof payload.id !== 'string' || !Array.isArray(payload.choices)) return;
      push({
        type: 'question',
        question: {
          id: payload.id,
          question: payload.question,
          choices: payload.choices,
          multiSelect: payload.multiSelect === true,
        },
      });
    });

    await registerListener<BlockedByModePayload>('tool:blocked_by_mode', (payload) => {
      push({
        type: 'notice',
        message: `${getToolDisplayLabel(payload.tool_name).displayName} was not run in ${payload.mode} mode. ${payload.hint}`,
      });
    });

    await registerListener<MessageConsumedPayload>('agentic:message-consumed', (payload) => {
      if (String(payload.conversation_id) !== String(backendConversationId)) return;
      const steerId = payload.pending_message?.id;
      if (typeof steerId === 'string') push({ type: 'steer_consumed', steerId });
    });

    await registerListener<AttachmentNoticePayload>('chat:attachment-notice', (payload) => {
      if (String(payload.conversation_id) !== String(backendConversationId)) return;
      toast.warning(payload.notice);
    });

    await registerListener<ToolsWithheldPayload>('chat:tools-withheld', (payload) => {
      if (String(payload.conversation_id) !== String(backendConversationId)) return;
      push({ type: 'notice', message: payload.notice });
    });

    await registerListener<StreamErrorPayload>('chat:stream-error', (payload) => {
      const convId = String(payload.conversation_id);
      if (
        convId !== String(backendConversationId) &&
        payload.conversation_id !== backendConversationId
      )
        return;
      push({ type: 'error', content: payload.error });
      push(null);
    });

    await registerListener<ToolEventPayload>('tool:event', (payload) => {
      if (
        payload.conversation_id !== undefined &&
        String(payload.conversation_id) !== String(backendConversationId)
      )
        return;
      const name = payload.tool_name ?? '';
      if (payload.type === 'started') {
        toolExecutionIds.push(payload.id);
        const args = toolArguments(payload.arguments);
        const display = getToolDisplayLabel(name);
        pushAgentEvent({
          type: 'tool-execution-start',
          toolCallId: payload.id,
          name,
          category: inferAgentToolCategory(name),
          summary: display.activeForm,
          input: toAgentJsonValue(args),
        });
        turnDetail.recordCall(payload.id, name, args);
        push({
          type: 'tool_call',
          data: {
            id: payload.id,
            name,
            status: 'running',
            input: args,
          },
        });
      } else if (payload.type === 'progress') {
        const summary = payload.stdout_chunk?.trim();
        if (!summary) return;
        pushAgentEvent({
          type: 'progress-update',
          progressId: `tool-${payload.id}`,
          summary,
          status: 'running',
        });
      } else {
        const failed = payload.success === false || Boolean(payload.error);
        const output = payload.output ?? undefined;
        const error = failed ? (payload.error ?? output ?? 'The tool failed.') : undefined;
        pushAgentEvent({
          type: 'tool-execution-end',
          toolCallId: payload.id,
          name,
          output: toAgentJsonValue(error ?? output ?? null),
          isError: failed,
          ...(payload.duration_ms !== undefined ? { elapsedMs: payload.duration_ms } : {}),
        });
        turnDetail.recordResult(payload.id, name, failed ? undefined : output, error);
        push({
          type: 'tool_result',
          data: {
            id: payload.id,
            name,
            status: failed ? 'failed' : 'completed',
            output: failed ? undefined : output,
            error,
            durationMs: payload.duration_ms,
          },
        });
      }
    });

    await registerListener<ChatSourcesPayload>('chat:sources', (payload) => {
      if (String(payload.conversation_id) !== String(backendConversationId)) return;
      const sources = (Array.isArray(payload.sources) ? payload.sources : []).filter(
        (source) => typeof source.title === 'string' && typeof source.url === 'string',
      );
      if (sources.length === 0) return;

      const modelCallId = payload.tool_call_id;
      const toolCallId = modelCallId
        ? [...toolExecutionIds]
            .reverse()
            .find((id) => id === modelCallId || id.startsWith(`${modelCallId}_`))
        : undefined;
      const query =
        payload.kind === 'project_knowledge' ? PROJECT_KNOWLEDGE_SOURCES_LABEL : payload.query;
      pushAgentEvent({
        type: 'source-list',
        ...(toolCallId ? { toolCallId } : {}),
        ...(query ? { query } : {}),
        sources: sources.map((source) => ({
          url: source.url,
          title: source.title,
          ...(source.snippet ? { snippet: source.snippet } : {}),
        })),
      });

      if (payload.kind !== 'web_search') return;
      const search: SearchResults = {
        id: toolCallId ?? modelCallId ?? `sources-${agentEventSequence}`,
        query: payload.query?.trim() || 'Web search',
        results: sources.map((source) => {
          const domain = sourceDomain(source.url);
          return {
            url: source.url,
            title: source.title,
            ...(source.snippet ? { snippet: source.snippet } : {}),
            ...(domain ? { domain } : {}),
          };
        }),
        resultCount: sources.length,
        status: 'completed',
      };
      turnDetail.recordSearch(search);
      push({ type: 'search_results', search });
    });

    await registerListener<ArtifactProgressPayload>('chat:artifact-progress', (payload) => {
      const convId = String(payload.conversation_id);
      if (
        convId !== String(backendConversationId) &&
        payload.conversation_id !== backendConversationId
      )
        return;
      if (typeof payload.delta !== 'string' || typeof payload.seq !== 'number') return;

      const key = `${String(payload.message_id)}:${String(payload.tool_call_index)}`;
      let accumulator = artifactDraftAccumulators.get(key);
      if (!accumulator) {
        accumulator = new PartialArtifactAccumulator();
        artifactDraftAccumulators.set(key, accumulator);
      }
      const fields = accumulator.push(payload.delta, payload.seq);
      if (!fields) return;
      if (fields.title === undefined && fields.artifactType === undefined) return;

      activeArtifactDraftKey = key;
      useArtifactStore.getState().updateArtifactDraft({
        key,
        title: fields.title ?? null,
        artifactType: fields.artifactType ?? null,
        content: fields.content ?? '',
        language: fields.language ?? null,
        complete: fields.complete,
      });
    });

    await registerListener<ArtifactEventPayload>('chat:artifact', (payload) => {
      const convId = payload.conversation_id === null ? null : String(payload.conversation_id);
      if (convId !== null && convId !== String(backendConversationId)) return;
      if (
        !payload.artifact ||
        typeof payload.artifact.id !== 'string' ||
        typeof payload.artifact.type !== 'string' ||
        typeof payload.artifact.content !== 'string'
      ) {
        push({
          type: 'error',
          content: 'Received an invalid artifact payload from native runtime.',
        });
        return;
      }
      streamedArtifactIds.add(payload.artifact.id);
      const finalArtifact: Artifact = {
        id: payload.artifact.id,
        type: resolveArtifactRenderType(payload.artifact.type),
        title: payload.artifact.title,
        content: payload.artifact.content,
        language: payload.artifact.language ?? undefined,
        version: payload.artifact.version ?? 1,
        createdAt: payload.artifact.created_at,
        updatedAt: payload.artifact.updated_at,
        conversationId: String(backendConversationId),
        metadata: payload.artifact.metadata,
      };
      if (activeArtifactDraftKey !== null) {
        // The draft overlay was showing this artifact as it streamed; hand it
        // to the chat's artifact panel now that it is complete.
        activeArtifactDraftKey = null;
        useArtifactStore.getState().finalizeArtifactDraft();
        useChatArtifactStore.getState().openArtifact(finalArtifact);
        useChatUIStore.getState().openArtifactPanel();
      }
      push({ type: 'artifact', data: finalArtifact });
    });

    const cleanup = () => {
      for (const unlisten of unlisteners) {
        unlisten();
      }
      unlisteners.length = 0;
      artifactDraftAccumulators.clear();
      if (activeArtifactDraftKey !== null) {
        const key = activeArtifactDraftKey;
        activeArtifactDraftKey = null;
        useArtifactStore.getState().discardArtifactDraft(key);
      }
    };

    if (signal) {
      signal.addEventListener('abort', () => this.stopGeneration(conversationId), { once: true });
    }

    const personalizationBlock = personalizationToPrompt(
      useSettingsStore.getState().personalization,
    );
    const mergedCustomInstructions =
      orderLocalPromptBlocks([
        { entry: ACCOUNT_INSTRUCTION, text: personalizationBlock ?? '' },
        { entry: 'agent_instruction', text: systemPrompt ?? '' },
      ])
        .map((block) => block.text)
        .filter((text) => text.trim())
        .join('\n\n') || undefined;

    try {
      await invoke('chat_set_plan_mode', {
        conversationId: backendConversationId,
        enabled: agentMode === 'plan',
      });
      const resolvedModelCapabilities = resolveModelCapabilities(model);
      const response = await invoke<RawSendMessageResponse | null>('chat_send_message', {
        request: {
          content,
          userId,
          provider,
          modelOverride: model,
          modelCapabilities: resolvedModelCapabilities,
          toolScope: localToolScope,
          enableTools,
          conversationId: temporary ? undefined : backendConversationId,
          ...(temporary
            ? {
                incognito: true,
                temporaryHistory: temporaryHistoryTurns(turn.history, content),
              }
            : {}),
          attachments: attachments ?? [],
          stream: true,
          frontendMessageId,
          activeMode: 'local',
          executionMode,
          preferCloudCredits: false,
          thinkingMode: resolvedModelCapabilities?.thinking ? thinkingEnabled : undefined,
          reasoningEffort: effort,
          customInstructions: mergedCustomInstructions,
          projectFolder: useProjectStore.getState().currentFolder ?? undefined,
          focusMode: webSearch ? 'web' : undefined,
        },
      });
      const userRowId = response?.user_message?.id;
      if (!temporary && typeof userRowId === 'number' && userRowId > 0) {
        void this.saveMessageDetail(userRowId, userId, {
          clientId: turn.userMessageId ?? null,
          attachments: storedAttachmentList(turn.files),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      cleanup();
      yield { type: 'error', content: message };
      return;
    }

    try {
      while (true) {
        const chunk = await nextChunk();
        if (chunk === null) break;
        yield chunk;
      }
    } finally {
      if (stopWatchdog) clearTimeout(stopWatchdog);
      cleanup();
      this._stopFlags.delete(conversationId);
      this._stopSettlers.delete(conversationId);
    }
  }

  async steer(conversationId: string, content: string): Promise<SteeredMessage> {
    const backendConversationId = uuidToDbId(conversationId);
    if (backendConversationId === undefined) {
      throw new Error('This conversation has no running reply to steer.');
    }
    let pending: RawPendingMessage;
    try {
      pending = await invoke<RawPendingMessage>('chat_add_pending_message', {
        request: { content, conversationId: backendConversationId },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith(PROMPT_REFUSAL_PREFIX)) throw new SteerRefusedError(message);
      throw err;
    }
    return { id: pending.id, content: pending.content };
  }

  async withdrawSteer(conversationId: string, steerId: string): Promise<boolean> {
    const backendConversationId = uuidToDbId(conversationId);
    if (backendConversationId === undefined) return false;
    const popped = await invoke<RawPendingMessage | null>('chat_pop_pending_message', {
      request: { conversationId: backendConversationId, pendingMessageId: steerId },
    });
    return popped !== null;
  }

  async answerQuestion(questionId: string, answer: string | string[]): Promise<void> {
    await invoke('question_answer', { id: questionId, answer });
  }

  async listInterruptedTurns(): Promise<InterruptedTurn[]> {
    const turns = await invoke<RawInterruptedTurn[]>('chat_list_interrupted_turns');
    return turns.map((turn) => ({
      conversationId: dbIdToUuid(turn.conversationId),
      content: turn.content,
      startedAt: turn.startedAt,
    }));
  }

  async dismissInterruptedTurn(conversationId: string): Promise<void> {
    const backendConversationId = uuidToDbId(conversationId);
    if (backendConversationId === undefined) return;
    await invoke('chat_dismiss_interrupted_turn', { conversationId: backendConversationId });
  }

  stopGeneration(conversationId: string): void {
    if (this._stopFlags.get(conversationId)) return;
    this._stopFlags.set(conversationId, true);
    this._stopSettlers.get(conversationId)?.();
    const backendConversationId = uuidToDbId(conversationId);
    if (backendConversationId === undefined) return;
    void invoke('chat_stop_generation', { conversationId: backendConversationId }).catch(() => {
      // Ignore errors, the stop flag already prevents further yields
    });
  }

  async createConversation(title?: string, projectId?: string): Promise<Conversation> {
    const userId = this.getCurrentUserId();
    const executionMode: ChatExecutionMode = 'local_only';
    const raw = await invoke<RawConversation>('chat_create_conversation', {
      request: {
        title: title ?? 'New Conversation',
        userId,
        projectId: projectId ?? null,
        executionMode,
      },
    });
    return mapConversation(raw);
  }

  async loadConversations(): Promise<Conversation[]> {
    const raw = await invoke<RawConversation[]>('chat_get_conversations', {
      userId: this.getCurrentUserId(),
      appMode: 'local',
    });
    return Array.isArray(raw) ? raw.map(mapConversation) : [];
  }

  async loadMessages(conversationId: string): Promise<ChatMessage[]> {
    const backendConversationId = uuidToDbId(conversationId);
    if (typeof backendConversationId !== 'number' || backendConversationId <= 0) {
      return [];
    }
    const raw = await invoke<RawMessage[]>('chat_get_messages', {
      conversationId: backendConversationId,
      userId: this.getCurrentUserId(),
    });
    const messages = Array.isArray(raw) ? raw.map(mapMessage) : [];
    if (
      typeof backendConversationId !== 'number' ||
      backendConversationId <= 0 ||
      messages.length === 0
    ) {
      return messages;
    }

    let response: unknown;
    try {
      response = await invoke<unknown>('artifact_get_conversation_snapshot', {
        conversationId: backendConversationId,
        userId: this.getCurrentUserId(),
      });
    } catch {
      return messages;
    }
    if (!response || typeof response !== 'object') return messages;
    const snapshotResponse = response as Record<string, unknown>;
    if (snapshotResponse['success'] !== true || !Array.isArray(snapshotResponse['data'])) {
      return messages;
    }

    const messagesById = new Map(messages.map((message) => [message.id, message]));
    for (const rawArtifact of snapshotResponse['data']) {
      if (!isRawConversationArtifact(rawArtifact)) continue;
      const artifact = mapPersistedArtifact(rawArtifact);
      if (!artifact.messageId || artifact.conversationId !== String(backendConversationId)) {
        continue;
      }
      const owner = messagesById.get(artifact.messageId);
      if (!owner) continue;
      owner.artifacts = [...(owner.artifacts ?? []), artifact];
    }

    return messages;
  }

  async deleteConversation(id: string): Promise<void> {
    await invoke('chat_delete_conversation', {
      id: uuidToDbId(id),
      userId: this.getCurrentUserId(),
    });
  }

  async archiveConversation(id: string, userId?: string, archived?: boolean): Promise<void> {
    await invoke('chat_archive_conversation', {
      conversationId: uuidToDbId(id),
      userId: userId ?? this.getCurrentUserId(),
      archived: archived ?? true,
    });
  }

  async renameConversation(id: string, title: string, userId?: string): Promise<void> {
    await invoke('chat_update_conversation_title', {
      conversationId: uuidToDbId(id),
      title,
      userId: userId ?? this.getCurrentUserId(),
    });
  }

  /**
   * Removes the rows an edit or regenerate replaced. A message loaded from
   * SQLite carries its row id; one sent in this window carries the id the
   * renderer gave it, which the row stores as `client_id`.
   */
  async supersedeMessages(conversationId: string, messageIds: string[]): Promise<string> {
    const backendConversationId = uuidToDbId(conversationId);
    if (backendConversationId === undefined || this.isTemporaryConversation(conversationId)) {
      return '';
    }
    const ids = messageIds.filter((id) => /^\d+$/.test(id)).map(Number);
    const clientIds = messageIds.filter((id) => !/^\d+$/.test(id));
    return invoke<string>('chat_supersede_messages', {
      conversationId: backendConversationId,
      userId: this.getCurrentUserId(),
      ids,
      clientIds,
    });
  }

  async restoreSupersededMessages(key: string): Promise<void> {
    if (!key) return;
    await invoke('chat_restore_superseded_messages', { key });
  }

  async releaseSupersededMessages(key: string): Promise<void> {
    if (!key) return;
    await invoke('chat_release_superseded_messages', { key });
  }

  async deleteMessages(conversationId: string, messageIds: string[]): Promise<void> {
    const backendConversationId = uuidToDbId(conversationId);
    if (backendConversationId === undefined || this.isTemporaryConversation(conversationId)) {
      return;
    }
    const userId = this.getCurrentUserId();
    const failures: string[] = [];
    for (const messageId of messageIds) {
      const rowId = /^\d+$/.test(messageId) ? Number(messageId) : null;
      try {
        await invoke('chat_delete_message', {
          conversationId: backendConversationId,
          userId,
          id: rowId,
          clientId: rowId === null ? messageId : null,
        });
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (failures.length > 0) {
      toast.error(
        'The replaced messages could not all be removed from this chat. They may reappear when you reopen it.',
        { description: failures[0] },
      );
      throw new Error(failures[0]);
    }
  }

  private async saveMessageDetail(
    messageId: number,
    userId: string,
    detail: {
      clientId: string | null;
      toolCalls?: unknown[] | null;
      thinking?: string | null;
      attachments?: unknown[] | null;
      sources?: unknown[] | null;
    },
  ): Promise<void> {
    try {
      await invoke('chat_save_message_detail', {
        messageId,
        userId,
        clientId: detail.clientId,
        toolCalls: detail.toolCalls ?? null,
        thinking: detail.thinking ?? null,
        attachments: detail.attachments ?? null,
        sources: detail.sources ?? null,
      });
    } catch (error) {
      console.error('[TauriRuntime] Failed to save turn detail:', error);
      toast.error(
        'This reply was saved without its tool steps, reasoning, sources or attachment list. They will be missing when you reopen the chat.',
      );
    }
  }

  getPlatform(): 'desktop' | 'web' | 'mobile' {
    return 'desktop';
  }

  async updateArtifact(
    artifactId: string,
    content: string,
  ): Promise<{ id: string; content: string }> {
    const realId = artifactId.split('::v')[0] ?? artifactId;
    const response = await invoke<RawArtifactResponse<RawArtifact>>('artifact_update', {
      id: realId,
      content,
      changeDescription: 'Edited from chat',
      title: null,
      metadata: null,
      tags: null,
    });
    if (!response.success || !response.data) {
      throw new Error(response.error ?? 'Failed to save artifact edit');
    }
    return { id: response.data.id, content: response.data.content };
  }

  async restoreArtifactVersion(
    artifactId: string,
    version: number,
  ): Promise<{ id: string; content: string }> {
    const realId = artifactId.split('::v')[0] ?? artifactId;
    const response = await invoke<RawArtifactResponse<RawArtifact>>('artifact_rollback', {
      id: realId,
      version,
    });
    if (!response.success || !response.data) {
      throw new Error(response.error ?? `Could not restore version ${version}`);
    }
    return { id: response.data.id, content: response.data.content };
  }

  async getArtifactVersions(current: Artifact): Promise<Artifact[]> {
    const realId = current.id.split('::v')[0] ?? current.id;
    const response = await invoke<RawArtifactResponse<RawArtifactVersion[]>>(
      'artifact_get_versions',
      { id: realId },
    );
    if (!response.success || !response.data) {
      return [];
    }
    const versions = [...response.data].sort((a, b) => a.version - b.version);
    const latest = versions.length > 0 ? versions[versions.length - 1] : undefined;
    return versions.map((version) => ({
      ...current,
      id: latest && version.version === latest.version ? realId : `${realId}::v${version.version}`,
      content: version.content,
      version: version.version,
      updatedAt: version.created_at ?? current.updatedAt,
    }));
  }
}

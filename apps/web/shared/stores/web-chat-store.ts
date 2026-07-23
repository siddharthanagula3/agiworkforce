'use client';

/**
 * Canonical web chat store for the main chat page flow.
 *
 * Used by: WebChatPage, useChatStream, useConversations, UnifiedChatPage,
 * ChatSettings, CommandPalette, and localByokHandoff.
 *
 * Persist key: 'agiworkforce-web-chat' (persists model selection + sidebar state only).
 *
 * Related stores (distinct purposes, different shapes -- do NOT merge):
 *   - shared/stores/chat-store.ts         (MGX-style conversation store; persist key 'agi-chat-store')
 *   - packages/ui/unified-chat/src/stores/chatStore.ts  (shared package, persist key 'agi-web-chat')
 */

import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import type { ArtifactManifest, ComputeSession, GeneratedFile } from '@agiworkforce/types';
import type { AgentActivityState } from '@agiworkforce/client-runtime';
import type {
  CloudToolApprovalProjection,
  ManagedCloudAgentRunReference,
} from '@agiworkforce/cloud-contracts';
import type { SendReplayMetadata, WebSearchResults } from '@/features/chat/types/message-metadata';

/**
 * Deep Research run state persisted on the assistant message. Populated from
 * `x_research_status` SSE events while streaming and saved with the message so
 * a research report survives reload with its activity summary intact.
 */
export interface MessageResearchState {
  phase: 'planning' | 'searching' | 'synthesizing' | 'complete' | 'error' | 'interrupted';
  /** Human-readable phase label (e.g. "Searching the web (round 2)"). */
  label?: string;
  iteration?: number;
  maxIterations?: number;
  /** Total web searches observed across the run. */
  searches?: number;
  /** Deduped source count. */
  sources?: number;
  elapsedMs?: number;
  startedAt?: string;
  /** Honest error summary when the run failed mid-way. */
  error?: string;
}

// Types
/**
 * A single reasoning segment within one assistant turn. Multiple segments occur
 * when the model interleaves thinking with tool calls. Rendered by ThinkingBlock.
 */
export interface ThinkingSegment {
  id: string;
  content: string;
  isStreaming: boolean;
  startedAt: string;
  completedAt: string | null;
  durationSeconds?: number;
}

/**
 * One tool/provider-generated file announced by the `x_generated_files` SSE
 * delta. `uri` is the authenticated SAME-ORIGIN `/api/files/{id}` route (the
 * only url shape the PDF/image renderer gates accept), except in the
 * pre-migration fallback where it is the raw storage URL (download only).
 */
export interface GeneratedFileMetadataEntry {
  id: string;
  fileName: string;
  mimeType: string;
  uri: string;
  byteCount: number;
  /** Coarse icon kind: pdf | docx | xlsx | pptx | csv | json | markdown | html | image | archive | other */
  kind: string;
  /** SHA-256 of the stored bytes (integrity verification across surfaces). */
  checksumSha256?: string;
  /** Server-owned UI classification: editable/renderable source vs byte deliverable. */
  surface?: 'artifact' | 'file';
  /** Whether the owning surface can offer an inline preview for this descriptor. */
  previewable?: boolean;
}

export interface MessageMetadata {
  /** User-pinned message flag; persisted to messages.metadata and synced cross-device. */
  isPinned?: boolean;
  /** Explicit trust-boundary labels for cross-mode handoff and persisted evidence. */
  privacyMode?: 'local' | 'byok' | 'managed';
  providerMode?: 'Local' | 'DirectByok' | 'ManagedGateway' | 'ManagedNative';
  /** Provider model label when persisted with metadata rather than the top-level message. */
  model?: string;
  /** Local -> BYOK handoff evidence persisted on the fork system message. */
  handoffDraftId?: string;
  handoffPreviewHashSha256?: string;
  handoffSourceConversationId?: string;
  /** Raw extended thinking text rendered by ThinkingBlock */
  thinkingContent?: string;
  /** Collapsible thinking summary steps rendered by assistant messages. */
  thinkingSteps?: string[];
  /** True while thinking content is still streaming */
  isThinkingStreaming?: boolean;
  /** ISO timestamp when thinking started */
  thinkingStartedAt?: string;
  /** ISO timestamp when thinking completed */
  thinkingCompletedAt?: string;
  /** Stable thinking duration in seconds (persisted so reload shows "Thought for Ns"). */
  thinkingDurationSeconds?: number;
  /**
   * Ordered reasoning segments for a single turn. Populated only when the model
   * emits MORE THAN ONE `<thinking>` block (e.g. interleaved thinking around tool
   * calls) so the transcript renders each block as a flow instead of one blob.
   * Single-block turns leave this undefined and use `thinkingContent`.
   */
  thinkingSegments?: ThinkingSegment[];
  /** True while a server-managed web search is in progress */
  isSearching?: boolean;
  /** Web search results from server-managed tools */
  searchResults?: WebSearchResults;
  /** Safe replay metadata used to regenerate a turn without storing raw skill bodies. */
  sendReplay?: SendReplayMetadata;
  /** Durable owner-scoped attachment descriptors; raw bytes stay in object storage. */
  attachments?: Attachment[];
  /** True while server-managed code execution is running */
  isExecutingCode?: boolean;
  /** Tool activity timeline rendered below assistant messages. */
  tools?: MessageToolEntry[];
  /**
   * Canonical Cloud agent-run activity projected from validated
   * `delta.x_agent_event` envelopes. New clients render this one inline spine;
   * `tools` remains only as a compatibility fallback while old emitters drain.
   */
  agentActivity?: AgentActivityState;
  /** Durable server run + replay cursor for reconnecting this Cloud turn. */
  cloudAgentRun?: ManagedCloudAgentRunReference;
  /**
   * Safe cross-surface projection of a suspended approval checkpoint. The
   * server-owned run remains authoritative; null explicitly clears stale
   * approval cards after the run advances.
   */
  cloudApproval?: CloudToolApprovalProjection | null;
  /** Deep Research run state (activity header + persistence). */
  research?: MessageResearchState;
  /** Code execution result from server-managed code_execution_20260120 tool */
  codeExecutionResult?: {
    stdout: string;
    stderr: string;
    returnCode: number;
    images?: Array<{ mediaType: string; data: string }>;
  };
  /** Generated-file provenance for artifact workbench rendering. */
  computeSession?: ComputeSession;
  generatedFile?: GeneratedFile;
  artifactManifest?: ArtifactManifest;
  /**
   * Files produced by tool/provider runs this turn (`x_generated_files` SSE
   * delta). Images render inline (thumbnail + lightbox), source artifacts feed
   * the artifact workbench, PDFs feed the PDF viewer, CSVs the spreadsheet
   * renderer, and non-previewable binaries remain honest download chips.
   * Persisted in messages.metadata so a reload re-renders them.
   */
  generatedFiles?: GeneratedFileMetadataEntry[];
  documentData?: { title?: string; content?: string; [key: string]: unknown };
  /** Persisted user reaction (stored in cloud messages.metadata) */
  reaction?: 'thumbsUp' | 'thumbsDown' | null;
  /** Inline paywall rendered in place of an assistant message when a gated feature is requested. */
  paywall?: {
    feature: string;
    requiredTier: string;
    reason?: string;
  };
  /**
   * How the assistant turn ended, for the Continue Generation affordance.
   * Values: OpenAI-wire finish reasons ('stop' | 'length' | 'tool_calls' | ...),
   * the legacy Anthropic passthrough 'max_tokens', or the client-only marker
   * 'stopped' (user aborted mid-stream with partial content). Persisted with
   * the message so a truncated turn still offers Continue after reload.
   * See features/chat/lib/continue-generation.ts for the continuable predicate.
   */
  finishReason?: string;
  /**
   * Classified payload from an additive `x_stream_error` SSE delta: the
   * provider failed mid-stream (after the response had already committed a
   * 200), so the turn ends with only partial content and no other visible
   * signal (the server still sends a clean `[DONE]`; `finish_reason` cannot
   * reliably say 'error' — see packages/ui/unified-chat's `hasStreamError` doc
   * comment). `code`/`retryable` are surfaced when the provider adapter
   * supplied them, so the failure stays diagnosable later and the retry
   * affordance has something to condition on. Drives a "response may be
   * incomplete" notice + regenerate affordance instead of silently
   * rendering the partial as a normal completion. Persisted so the notice
   * survives reload.
   */
  streamError?: { message: string; code?: string; retryable?: boolean };
  /** Media tool type for inline rendering (e.g. 'image-generation'). */
  toolType?: string;
  /** Generated image URL; displayed inline when toolType === 'image-generation'. */
  imageUrl?: string;
  /** Original prompt used to generate the image (persisted for edit/re-generate). */
  imageGenPrompt?: string;
  /** Aspect ratio requested when the image was generated. */
  imageGenAspect?: string;
  /** Model id used for image generation. */
  imageGenModel?: string;
}

export interface MessageToolEntry {
  id?: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'awaiting_approval';
  durationMs?: number;
  args?: string;
  parameters?: Record<string, unknown>;
  parallelGroup?: string;
  error?: string;
  /** When true, this tool call is blocked on user approval before execution. */
  requiresApproval?: boolean;
  /** Approval decision recorded by the user (true = approved, false = rejected). */
  approved?: boolean;
  /** Raw tool_call_id from the model, used for the approval round-trip. */
  toolCallId?: string;
  /** JSON-serialized args from the model, for display in the approval card. */
  rawArgs?: Record<string, unknown>;
  /** Tool result content after execution. */
  result?: string;
  /** Playful action phrase shown in the timeline running-state header (e.g. "Running code"). */
  statusPhrase?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  model?: string;
  isStreaming?: boolean;
  attachments?: Attachment[];
  reactions?: { type: 'thumbsUp' | 'thumbsDown'; userId: string }[];
  error?: boolean;
  metadata?: MessageMetadata;
}

export interface Attachment {
  id: string;
  /** Owner-scoped media_assets id used by the server to hydrate provider input. */
  assetId?: string;
  type: 'image' | 'file';
  name: string;
  size?: number;
  mimeType?: string;
  content?: string; // Base64 data URL
  url?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  arguments: Record<string, unknown>;
  startedAt?: string;
  completedAt?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model?: string | null;
  projectId?: string | null;
  messageCount?: number;
  isTemporary?: boolean;
  /** Pinned to top of sidebar. Persisted in web_conversations.pinned. */
  isPinned?: boolean;
  /** Starred by the user. Client-side only (no DB column in v1). */
  isStarred?: boolean;
  /** Archived (hidden from default list). Client-side only (no DB column in v1). */
  isArchived?: boolean;
}

export type ModelTier = 'economy' | 'balanced' | 'premium';

export interface SelectedModel {
  id: string;
  name: string;
  provider: string;
  tier: ModelTier;
}

// Single self-routing Auto. Profile/tier are chosen per message by the
// resolver, not by the user picking economy/balanced/premium.
export const AUTO_MODELS = {
  auto: {
    id: 'auto',
    name: 'Auto',
    description: 'Routes each message to the best model for the task and your plan',
    tier: 'balanced' as ModelTier,
  },
} as const;

// State interface
interface ChatState {
  // Conversations
  conversations: Conversation[];
  activeConversationId: string | null;

  // Messages
  messages: Message[];

  // UI State
  isStreaming: boolean;
  /**
   * Conversation ids with a live stream. `isStreaming` above is the OR of
   * this (kept for callers that only care whether anything anywhere is
   * generating); a component that renders one conversation must key its own
   * "is this conversation generating" UI off `streamingConversationIds`
   * instead, or switching conversations mid-stream shows a stale Stop
   * button / false "generating" state for a conversation that isn't
   * actually streaming (mirrors mobile's chatExecutionStore fix).
   */
  streamingConversationIds: string[];
  isLoading: boolean;
  error: string | null;

  // Model selection
  selectedModel: string;
  selectedModelTier: ModelTier;

  // Draft content for input persistence
  draftContent: string;

  // Sidebar state
  sidebarCollapsed: boolean;

  // Actions - Conversations
  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  deleteConversation: (id: string) => void;
  setActiveConversation: (id: string | null) => void;
  setActiveConversationWithMessages: (id: string, messages: Message[]) => void;

  // Actions - Messages
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  appendToMessage: (id: string, content: string) => void;
  appendToThinking: (id: string, thinking: string) => void;
  setSearching: (id: string, isSearching: boolean) => void;
  setSearchResults: (
    id: string,
    results: Array<{ url: string; title: string; snippet: string }>,
  ) => void;
  setExecutingCode: (id: string, isExecuting: boolean) => void;
  setToolTimeline: (id: string, tools: MessageToolEntry[]) => void;
  /** Merge Deep Research run state into the message metadata. */
  setResearchState: (id: string, research: MessageResearchState) => void;
  /** Update a single tool entry by toolCallId within the message's tool timeline. */
  updateToolEntry: (
    messageId: string,
    toolCallId: string,
    updates: Partial<MessageToolEntry>,
  ) => void;
  setCodeExecutionResult: (
    id: string,
    result: NonNullable<MessageMetadata['codeExecutionResult']>,
  ) => void;
  deleteMessage: (id: string) => void;
  clearMessages: () => void;

  // Actions - Streaming
  startStreaming: (messageId: string, conversationId: string) => void;
  /**
   * `conversationId` omitted = the user-initiated Stop path, which always
   * targets whatever conversation is currently active. Callers tearing down
   * a specific stream's completion (natural finish, error, abort) MUST pass
   * the conversation that stream belongs to, so an orphaned background
   * stream's teardown can't clear a different, genuinely-active stream.
   */
  stopStreaming: (conversationId?: string) => void;
  /**
   * `conversationId` scopes a `false` write: a background conversation's
   * stream completing must not clear `isLoading` out from under a
   * conversation the user has since switched to and is genuinely sending
   * in. Omit it (e.g. `loadConversation`'s fetch-loading use, or the
   * user-initiated Stop path) to write unconditionally.
   */
  setLoading: (loading: boolean, conversationId?: string) => void;
  /**
   * Set the visible banner error for one conversation. When `conversationId`
   * is supplied, a late completion from a background conversation is ignored
   * instead of leaking into the conversation currently on screen.
   */
  setError: (error: string | null, conversationId?: string) => void;

  // Actions - Model
  setSelectedModel: (modelId: string, tier: ModelTier) => void;

  // Actions - Draft
  setDraftContent: (content: string) => void;

  // Actions - Sidebar
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Utility
  reset: () => void;
}

const initialState = {
  conversations: [],
  activeConversationId: null,
  messages: [],
  isStreaming: false,
  streamingConversationIds: [] as string[],
  isLoading: false,
  error: null,
  selectedModel: 'auto',
  selectedModelTier: 'balanced' as ModelTier,
  draftContent: '',
  sidebarCollapsed: false,
};

export const useChatStore = create<ChatState>()(
  devtools(
    persist(
      (set) => ({
        ...initialState,

        // Conversations
        setConversations: (conversations) =>
          set({ conversations }, undefined, 'chat/setConversations'),

        addConversation: (conversation) =>
          set(
            (state) => ({
              conversations: [conversation, ...state.conversations],
            }),
            undefined,
            'chat/addConversation',
          ),

        updateConversation: (id, updates) =>
          set(
            (state) => ({
              conversations: state.conversations.map((c) =>
                c.id === id ? { ...c, ...updates } : c,
              ),
            }),
            undefined,
            'chat/updateConversation',
          ),

        deleteConversation: (id) =>
          set(
            (state) => ({
              conversations: state.conversations.filter((c) => c.id !== id),
              activeConversationId:
                state.activeConversationId === id ? null : state.activeConversationId,
              messages: state.activeConversationId === id ? [] : state.messages,
            }),
            undefined,
            'chat/deleteConversation',
          ),

        setActiveConversation: (id) =>
          set(
            (state) => ({
              activeConversationId: id,
              messages: [], // Clear messages when switching conversations
              error: null,
              // A background stream for a DIFFERENT conversation must not
              // leave the newly-active conversation showing stale
              // isLoading:true; if `id` itself has a genuinely live stream
              // (switching back to one whose send is still in flight), this
              // correctly keeps isLoading true instead of clearing it.
              isLoading: id !== null && state.streamingConversationIds.includes(id),
            }),
            undefined,
            'chat/setActiveConversation',
          ),

        setActiveConversationWithMessages: (id, messages) =>
          set(
            (state) => ({
              activeConversationId: id,
              messages,
              error: null,
              isLoading: state.streamingConversationIds.includes(id),
            }),
            undefined,
            'chat/setActiveConversationWithMessages',
          ),

        // Messages
        setMessages: (messages) => set({ messages }, undefined, 'chat/setMessages'),

        addMessage: (message) =>
          set(
            (state) => ({
              messages: [...state.messages, message],
            }),
            undefined,
            'chat/addMessage',
          ),

        updateMessage: (id, updates) =>
          set(
            (state) => ({
              messages: state.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
            }),
            undefined,
            'chat/updateMessage',
          ),

        appendToMessage: (id, content) =>
          set(
            (state) => ({
              messages: state.messages.map((m) =>
                m.id === id ? { ...m, content: m.content + content } : m,
              ),
            }),
            undefined,
            'chat/appendToMessage',
          ),

        appendToThinking: (id, thinking) =>
          set(
            (state) => ({
              messages: state.messages.map((m) =>
                m.id === id
                  ? {
                      ...m,
                      metadata: {
                        ...m.metadata,
                        thinkingContent: (m.metadata?.thinkingContent ?? '') + thinking,
                      },
                    }
                  : m,
              ),
            }),
            undefined,
            'chat/appendToThinking',
          ),

        setSearching: (id, isSearching) =>
          set(
            (state) => ({
              messages: state.messages.map((m) =>
                m.id === id ? { ...m, metadata: { ...m.metadata, isSearching } } : m,
              ),
            }),
            undefined,
            'chat/setSearching',
          ),

        setSearchResults: (id, results) =>
          set(
            (state) => ({
              messages: state.messages.map((m) =>
                m.id === id
                  ? {
                      ...m,
                      metadata: { ...m.metadata, searchResults: results, isSearching: false },
                    }
                  : m,
              ),
            }),
            undefined,
            'chat/setSearchResults',
          ),

        setExecutingCode: (id, isExecuting) =>
          set(
            (state) => ({
              messages: state.messages.map((m) =>
                m.id === id
                  ? { ...m, metadata: { ...m.metadata, isExecutingCode: isExecuting } }
                  : m,
              ),
            }),
            undefined,
            'chat/setExecutingCode',
          ),

        setToolTimeline: (id, tools) =>
          set(
            (state) => ({
              messages: state.messages.map((m) =>
                m.id === id ? { ...m, metadata: { ...m.metadata, tools } } : m,
              ),
            }),
            undefined,
            'chat/setToolTimeline',
          ),

        setResearchState: (id, research) =>
          set(
            (state) => ({
              messages: state.messages.map((m) =>
                m.id === id ? { ...m, metadata: { ...m.metadata, research } } : m,
              ),
            }),
            undefined,
            'chat/setResearchState',
          ),

        updateToolEntry: (messageId, toolCallId, updates) =>
          set(
            (state) => ({
              messages: state.messages.map((m) => {
                if (m.id !== messageId) return m;
                const tools = m.metadata?.tools ?? [];
                const updatedTools = tools.map((t) =>
                  t.toolCallId === toolCallId ? { ...t, ...updates } : t,
                );
                return { ...m, metadata: { ...m.metadata, tools: updatedTools } };
              }),
            }),
            undefined,
            'chat/updateToolEntry',
          ),

        setCodeExecutionResult: (id, result) =>
          set(
            (state) => ({
              messages: state.messages.map((m) =>
                m.id === id
                  ? {
                      ...m,
                      metadata: {
                        ...m.metadata,
                        codeExecutionResult: result,
                        isExecutingCode: false,
                      },
                    }
                  : m,
              ),
            }),
            undefined,
            'chat/setCodeExecutionResult',
          ),

        deleteMessage: (id) =>
          set(
            (state) => ({
              messages: state.messages.filter((m) => m.id !== id),
            }),
            undefined,
            'chat/deleteMessage',
          ),

        clearMessages: () => set({ messages: [] }, undefined, 'chat/clearMessages'),

        // Streaming
        startStreaming: (messageId, conversationId) =>
          set(
            (state) => {
              const streamingConversationIds = state.streamingConversationIds.includes(
                conversationId,
              )
                ? state.streamingConversationIds
                : [...state.streamingConversationIds, conversationId];
              return {
                streamingConversationIds,
                isStreaming: true,
                messages: state.messages.map((m) =>
                  m.id === messageId ? { ...m, isStreaming: true } : m,
                ),
              };
            },
            undefined,
            'chat/startStreaming',
          ),

        stopStreaming: (conversationId) =>
          set(
            (state) => {
              const targetId = conversationId ?? state.activeConversationId ?? undefined;
              const streamingConversationIds = targetId
                ? state.streamingConversationIds.filter((id) => id !== targetId)
                : state.streamingConversationIds;
              // Only sweep the visible messages' isStreaming flag when the
              // stream ending belongs to the conversation currently loaded
              // in `messages` (or no id was given -- the user-initiated Stop
              // path, which always targets whatever's on screen). An
              // orphaned background conversation's completion must not touch
              // a genuinely-active different conversation's message bubbles.
              const affectsVisible = !targetId || targetId === state.activeConversationId;
              return {
                streamingConversationIds,
                isStreaming: streamingConversationIds.length > 0,
                messages: affectsVisible
                  ? state.messages.map((m) => ({ ...m, isStreaming: false }))
                  : state.messages,
              };
            },
            undefined,
            'chat/stopStreaming',
          ),

        setLoading: (loading, conversationId) =>
          set(
            (state) => {
              if (
                loading === false &&
                conversationId &&
                conversationId !== state.activeConversationId
              ) {
                return state;
              }
              return { isLoading: loading };
            },
            undefined,
            'chat/setLoading',
          ),

        setError: (error, conversationId) =>
          set(
            (state) =>
              conversationId && conversationId !== state.activeConversationId ? state : { error },
            undefined,
            'chat/setError',
          ),

        // Model
        setSelectedModel: (modelId, tier) =>
          set(
            { selectedModel: modelId, selectedModelTier: tier },
            undefined,
            'chat/setSelectedModel',
          ),

        // Draft
        setDraftContent: (content) =>
          set({ draftContent: content }, undefined, 'chat/setDraftContent'),

        // Sidebar
        toggleSidebar: () =>
          set(
            (state) => ({ sidebarCollapsed: !state.sidebarCollapsed }),
            undefined,
            'chat/toggleSidebar',
          ),

        setSidebarCollapsed: (collapsed) =>
          set({ sidebarCollapsed: collapsed }, undefined, 'chat/setSidebarCollapsed'),

        // Reset
        reset: () => set(initialState, undefined, 'chat/reset'),
      }),
      {
        name: 'agiworkforce-web-chat',
        storage: createJSONStorage(() => localStorage),
        version: 1,
        partialize: (state) => ({
          // Only persist model selection and sidebar state
          selectedModel: state.selectedModel,
          selectedModelTier: state.selectedModelTier,
          sidebarCollapsed: state.sidebarCollapsed,
        }),
      },
    ),
    { name: 'ChatStore', enabled: process.env.NODE_ENV === 'development' },
  ),
);

// Selectors for performance
export const selectMessages = (state: ChatState) => state.messages;
export const selectConversations = (state: ChatState) => state.conversations;
export const selectActiveConversationId = (state: ChatState) => state.activeConversationId;
export const selectIsStreaming = (state: ChatState) => state.isStreaming;
export const selectIsLoading = (state: ChatState) => state.isLoading;
/** Whether the ACTIVE conversation specifically has a live stream -- what
 *  per-conversation UI (composer, Stop button) should key off instead of
 *  the global `isStreaming`, which stays true while any background
 *  conversation is still generating. */
export const selectIsActiveConversationStreaming = (state: ChatState) =>
  state.activeConversationId !== null &&
  state.streamingConversationIds.includes(state.activeConversationId);
export const selectSelectedModel = (state: ChatState) => state.selectedModel;
export const selectSelectedModelTier = (state: ChatState) => state.selectedModelTier;
export const selectError = (state: ChatState) => state.error;
export const selectSidebarCollapsed = (state: ChatState) => state.sidebarCollapsed;

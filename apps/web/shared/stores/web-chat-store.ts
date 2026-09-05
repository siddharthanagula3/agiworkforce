'use client';

/**
 * Canonical web chat store for the main chat page flow.
 *
 * Used by: WebChatPage, useChatStream, useConversations, ChatSettings,
 * CommandPalette, and localByokHandoff.
 *
 * Persist key: 'agiworkforce-web-chat' (persists model selection + sidebar state only).
 *
 * Related stores (distinct purposes, different shapes -- do NOT merge):
 *   - shared/stores/chat-store.ts         (MGX-style conversation store; persist key 'agi-chat-store')
 *   - packages/ui/unified-chat/src/stores/chatStore.ts  (shared package, persist key 'agi-web-chat')
 */

import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import {
  getModelMetadataById,
  isAutoModeModelId,
  normalizeModelId,
  type ArtifactManifest,
  type ComputeSession,
  type GeneratedFile,
} from '@agiworkforce/types';
import type { AgentActivityState } from '@agiworkforce/client-runtime';
import type {
  CloudAgentWorkMode,
  CloudToolApprovalProjection,
  ManagedCloudAgentRunReference,
} from '@agiworkforce/cloud-contracts';
import type { InteractiveCard, ResearchStep } from '@agiworkforce/types';
import type { CloudWorkMode } from '@agiworkforce/types';
import type {
  PaywallSlot,
  SendReplayMetadata,
  WebSearchResults,
} from '@/features/chat/types/message-metadata';
import type { AgiWorkPlanStep } from '@/features/chat/utils/agiwork-plan';
import {
  resolveLeafForSibling,
  resolveVisibleThread,
  stampLinearParents,
  subtreeIds,
} from '@/features/chat/lib/messageThread';

/**
 * AUDIT-FIX CMP-1/CMP-2/CMP-5: the composer's send options, isolated PER
 * CONVERSATION.
 *
 * These eight values used to live in `useState` inside `ChatComposerNew`, and
 * `WebChatPage` renders that composer in the two opposite branches of an
 * `isEmptyChat ? ... : ...` ternary. Sending the first message therefore
 * UNMOUNTED the empty-state instance and MOUNTED the in-conversation one, so
 * every toggle silently reset to its default from message 2 onward -- a
 * conversation started in AGI Work continued as plain chat with nothing said.
 * `clearComposerState()` deliberately does not reset them ("PERSISTENT toggles
 * (claude.ai parity)"); the host layout was defeating that intent.
 *
 * Hoisting them here (next to `draftsByConversation`, the other piece of
 * per-conversation composer state) makes them survive the branch swap AND scopes
 * them to one conversation, so turning Deep Research on in chat A no longer
 * leaks into chat B.
 */
export interface ComposerToggleState {
  /** Chat | AGI Work. Stamped into send meta and enforced server-side. */
  workMode: CloudWorkMode;
  webSearchEnabled: boolean;
  researchEnabled: boolean;
  codeExecutionEnabled: boolean;
  officeCreationEnabled: boolean;
  /** Image-generation composer mode (routes to the media harness, not chat). */
  imageMode: boolean;
  /** Video-generation composer mode. Mutually exclusive with `imageMode`. */
  videoMode: boolean;
  /**
   * Exact server-catalog skill name selected for this conversation, or null.
   * Only the name is stored: it is the sole field the send path reads, and the
   * catalog owns the body.
   */
  selectedSkillName: string | null;
}

/**
 * Baseline for a conversation that has no stored composer state yet.
 *
 * Managed Web search is an ambient capability: when the selected model and
 * deployment can search, the composer keeps it enabled automatically. The
 * capability effect in ChatComposerNew turns this off only when there is no
 * honest search path for the selected model/deployment.
 */
export const DEFAULT_COMPOSER_TOGGLES: ComposerToggleState = Object.freeze({
  workMode: 'chat',
  webSearchEnabled: true,
  researchEnabled: false,
  codeExecutionEnabled: false,
  officeCreationEnabled: false,
  imageMode: false,
  videoMode: false,
  selectedSkillName: null,
});

/**
 * Deep Research run state persisted on the assistant message. Populated from
 * `x_research_status` SSE events while streaming and saved with the message so
 * a research report survives reload with its activity summary intact.
 */
export interface MessageResearchState {
  phase:
    | 'planning'
    | 'awaiting_approval'
    | 'searching'
    | 'synthesizing'
    | 'complete'
    | 'error'
    | 'interrupted';
  /** Human-readable phase label (e.g. "Searching the web (round 2)"). */
  label?: string;
  iteration?: number;
  maxIterations?: number;
  /** Total web searches observed across the run. */
  searches?: number;
  /** The search cap this run is bounded by, so the count can be shown as progress. */
  maxSearches?: number;
  /** Deduped source count. */
  sources?: number;
  elapsedMs?: number;
  startedAt?: string;
  /** Honest error summary when the run failed mid-way. */
  error?: string;
  /**
   * The run's research plan (additive `x_research_plan` SSE event, CAP-045
   * slice 2): the queries the planning turn committed to, plus the follow-up
   * and synthesis steps the loop really executed, each with live status.
   * Absent for a run that predates the event or whose plan could not be parsed.
   */
  steps?: ResearchStep[];
  /**
   * Sources this run gathered, carried forward when the user retries an
   * errored/interrupted run so the retry does not re-search what already
   * succeeded (CAP-045 slice 4).
   */
  sourcesForRetry?: Array<{ url: string; title?: string; snippet?: string }>;
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
  /**
   * D-2026-09-05-06. The model Auto left, and why, when this turn escalated off
   * the conversation's pinned model. Persisted, so the receipt survives a
   * reload; absent on every turn that did not move.
   */
  movedFromModel?: string;
  movedReason?: string;
  /** User-pinned message flag; persisted to messages.metadata and synced cross-device. */
  isPinned?: boolean;
  /** Explicit trust-boundary labels for cross-mode handoff and persisted evidence. */
  privacyMode?: 'local' | 'byok' | 'managed';
  providerMode?: 'Local' | 'DirectByok' | 'ManagedGateway' | 'ManagedNative';
  /** Provider model label when persisted with metadata rather than the top-level message. */
  model?: string;
  /** Provider that served the turn, written into metadata by turn persistence. */
  provider?: string;
  /**
   * Per-turn usage, lifted from the PERSISTED `web_messages.input_tokens` /
   * `output_tokens` columns by `toChatMessage` on conversation load. There is
   * no terminal `x_usage` stream frame, one was built and reverted for
   * breaking response-builder byte parity (docs/decisions/wire-or-cut.md,
   * "Per-message token/cost"), so these arrive with the persisted row, not
   * mid-stream, and stay absent for temporary chats.
   */
  tokensUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
  /** No producer today: no wire field carries either count to the client. */
  reasoningTokens?: number;
  cachedInputTokens?: number;
  /**
   * Estimated cost of this turn, in cents. No producer: managed cost stays
   * server-side (`parseManagedUsageSummaryResponse` projects `/api/usage*` to
   * percentages; the completion response omits `cost_cents`).
   */
  cost?: number;
  /** Wall-clock time from request start to stream completion, in ms. No producer yet. */
  totalDurationMs?: number;
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
  citations?: Array<{ type?: string; cited_text?: string; title?: string; url?: string }>;
  /** True when this turn's request had web search on, stamped at send time. */
  webSearchRequested?: boolean;
  /**
   * True when the user's own words asked for a search, stamped at send time.
   * A toggle left on is a standing preference, not an instruction for this
   * turn, so only this distinguishes a search that failed the user from one
   * they never asked for.
   */
  webSearchAskedInText?: boolean;
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
   * Structured, answerable transcript cards produced by a server tool call.
   *
   * Typed as the parsed union, so an entry is either `recognized: true` with a
   * validated body or `recognized: false` carrying only its envelope and the
   * server-authored `fallback`. A card this build cannot render still persists
   * and still renders its fallback text, a validation gap costs the user the
   * widget, never the answer.
   */
  interactiveCards?: InteractiveCard[];
  interactiveCardsResumed?: boolean;
  interactiveCardSubmissionErrors?: Record<string, string>;
  /**
   * Safe cross-surface projection of a suspended approval checkpoint. The
   * server-owned run remains authoritative; null explicitly clears stale
   * approval cards after the run advances.
   */
  cloudApproval?: CloudToolApprovalProjection | null;
  /** Deep Research run state (activity header + persistence). */
  research?: MessageResearchState;
  /**
   * AGI Work plan queue (additive `x_agiwork_plan` SSE event, CAP-048): the
   * steps the planning turn committed to, with live status as execution
   * proceeds. Whole-plan, last-write-wins. Absent for a run that predates the
   * event or whose plan could not be parsed.
   */
  agiWorkPlan?: AgiWorkPlanStep[];
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
  /**
   * Inline paywall rendered in place of an assistant message when a gated
   * feature is requested. The shape is owned by `PaywallSlot`, which is what
   * `resolveQuotaPaywallSlot` builds and what the card consumes; the store had
   * an inline copy of it that silently dropped every field added since.
   */
  paywall?: PaywallSlot;
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
   * reliably say 'error', see packages/ui/unified-chat's `hasStreamError` doc
   * comment). `code`/`retryable` are surfaced when the provider adapter
   * supplied them, so the failure stays diagnosable later and the retry
   * affordance has something to condition on. Drives a "response may be
   * incomplete" notice + regenerate affordance instead of silently
   * rendering the partial as a normal completion. Persisted so the notice
   * survives reload.
   */
  streamError?: { message: string; code?: string; retryable?: boolean };
  errorCode?: string;
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
  /** Bounded ISO instant before which provider-directed image retry should stay disabled. */
  imageRetryAt?: string;
  /**
   * Generated video URL. Displayed inline when toolType === 'video-generation';
   * its ABSENCE while the tool is running is what drives MessageBubble's
   * shimmering placeholder, so it must stay unset until the task completes.
   */
  videoUrl?: string;
  /** Poster frame for the generated video, when the provider returned one. */
  thumbnailUrl?: string;
  /** Opaque owner-scoped AGI job id; safe to poll after a page reload. */
  videoTaskId?: string;
  /** Durable public job state projected by Workflow/status reconciliation. */
  videoStatus?: 'queued' | 'processing' | 'completed' | 'failed';
  /** Canonical provider identity selected by the server. */
  videoProvider?: 'google' | 'runway' | 'openrouter';
  /** Canonical catalog model identity selected by the server. */
  videoModel?: string;
  /** Aspect ratio requested when the video was generated; sizes the shimmer placeholder. */
  videoAspect?: string;
  /** Latest provider progress reported by the durable reconciler. */
  videoProgress?: number;
  /** Durable terminal error projected by the server. */
  videoError?: string;
  /** True only when the prior video attempt is terminal and safe to start again. */
  videoRetryable?: boolean;
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
  /**
   * The message this one replies to, from `web_messages.parent_id`. Null or
   * absent on a conversation that has never branched, which is every
   * conversation until its first regenerate or edit.
   */
  parentId?: string | null;
  model?: string;
  provider?: string;
  /**
   * Stable substitution code from `X-AGI-Fallback-Reason` when the server served
   * this turn on a model other than the one the user picked. Per-turn and not
   * persisted: it explains this delivery, not the stored message.
   */
  fallbackReason?: string;
  /**
   * Which lane served this turn, from `X-AGI-Route-Lane`. Per-turn and not
   * persisted, on the same terms as `fallbackReason`: the header is absent on
   * every response that never consulted the free lane, so absent means "no claim
   * to make" rather than "managed".
   */
  routeLane?: string;
  secretRedactionCount?: number;
  /**
   * Per-turn usage as PERSISTED on the messages row (`input_tokens` /
   * `output_tokens`), written by the server's assistant-turn persistence and
   * returned by the conversation load path.
   */
  inputTokens?: number;
  outputTokens?: number;
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
  /**
   * The mode this conversation was started in, derived server-side from its
   * earliest agent run. Absent until that run exists, so the live composer
   * override in `workModeByConversation` is the other half of the answer.
   */
  workMode?: CloudAgentWorkMode;
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
  /**
   * AUDIT-FIX ROOT-CAUSE (per-conversation transcripts): the canonical store of
   * record. Previously the ONE flat `messages` array below WAS the source of
   * truth, implicitly scoped to `activeConversationId`, so every stream writer
   * (`addMessage`, `appendToMessage`, `appendToThinking`, `setToolTimeline`, ...)
   * was a `.map()` over that single array matched by message id -- meaning any
   * stream whose conversation was not currently displayed wrote into the wrong
   * buffer or silently no-opped. Mirrors the proven shape in
   * packages/ui/unified-chat/src/stores/chatStore.ts.
   */
  messagesByConversation: Record<string, Message[]>;
  /**
   * Derived mirror of `messagesByConversation[activeConversationId]`, resolved
   * to the ACTIVE PATH once that conversation has variants. Kept as a real state
   * field (rather than a computed selector) so every existing consumer of
   * `state.messages` / `useChatStore((s) => s.messages)` keeps working and keeps
   * re-rendering on identity change. Never assign it directly: write through the
   * message actions below, which target an explicit conversation and refresh
   * this mirror when that conversation is the active one.
   *
   * The bucket above holds every row; this holds the ones the reader is looking
   * at. That split is what keeps an abandoned variant out of the LLM prompt, the
   * share payload and the export, all of which read the mirror, while reaction
   * writes, artifact indexing and the pager's own counts still see the tree.
   * A conversation with no leaf resolves to the bucket BY IDENTITY, so nothing
   * downstream can tell the difference.
   */
  messages: Message[];
  /**
   * The row each conversation's visible path ends at, from
   * `web_conversations.active_leaf_message_id`. Null (or absent) means the
   * conversation has never branched and its transcript is every row in order.
   */
  activeLeafByConversation: Record<string, string | null>;

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
  /**
   * AUDIT-FIX STR-7/BUG-12: conversation ids with a TURN in flight. `isLoading`
   * below is derived from this (plus `streamingConversationIds`) for the ACTIVE
   * conversation only. Previously `isLoading` was one global boolean written
   * UNSCOPED on `true` but scoped on `false`, and the reducer DISCARDED a
   * `false` whose id was not the active one -- so a background stream left it
   * stuck `true` forever and the composer (`isTurnActive`) stayed disabled in
   * every other conversation.
   */
  loadingConversationIds: string[];
  /** Derived: does the ACTIVE conversation have a turn in flight (see above). */
  isLoading: boolean;
  error: string | null;

  // Model selection
  selectedModel: string;
  selectedModelTier: ModelTier;

  // Draft content for input persistence
  /**
   * AUDIT-FIX STR-23: unsent composer text, isolated PER CONVERSATION (plus the
   * new-chat composer under `PENDING_CONVERSATION_KEY`). The composer used to
   * hold its input in plain component state that was never keyed by
   * conversation, so a half-typed private message followed the user into
   * whatever chat they opened next. Mirrors `draftsByConversation` in
   * packages/ui/unified-chat/src/stores/chatStore.ts.
   */
  draftsByConversation: Record<string, string>;
  /** Live draft for the ACTIVE conversation (derived from the map above). */
  draftContent: string;

  /**
   * Messages the send guard refused, keyed by their send fingerprint rather
   * than by any conversation id. A send blocked because an earlier one is
   * still starting has no id it can safely be filed under: the conversation it
   * was aimed at is a client-side placeholder that is about to be renamed to a
   * server id, and every composer-side draft slot is keyed by that id. Keying
   * on what the user was sending instead makes the slot outlive both the
   * rename and the composer remount it triggers.
   */
  parkedSendsByFingerprint: Record<string, string>;

  /**
   * AUDIT-FIX CMP-1/CMP-2/CMP-5: composer send options per conversation. See
   * `ComposerToggleState`. Not persisted -- these describe one live
   * conversation's next turn, not a user preference.
   */
  composerTogglesByConversation: Record<string, ComposerToggleState>;

  /**
   * Per-conversation connector opt-outs: connector ids the user has switched
   * OFF for this one chat, sent with the completion request so their tools
   * are not offered to the model. Absent from the map (or an empty array)
   * means every connected connector is enabled -- the default -- so a newly
   * connected connector never has to be explicitly turned on.
   *
   * Unlike `composerTogglesByConversation`, THIS IS PERSISTED (see the
   * `partialize` below): a connector disabled for a conversation must still
   * be disabled after a reload, not just for the live tab.
   */
  disabledConnectorIdsByConversation: Record<string, string[]>;

  /**
   * Per-conversation Memory opt-out: conversation ids present with `true` have
   * Memory switched off for that chat only, overriding the settings-level
   * default. PERSISTED like `disabledConnectorIdsByConversation` (see
   * `partialize` below) so the override survives a reload.
   */
  memoryDisabledByConversation: Record<string, boolean>;

  /**
   * Per-conversation Chat/AGI Work override, mirrored out of
   * `composerTogglesByConversation.workMode` for the one field of that bucket
   * that is NOT next-turn ephemeral. PERSISTED like
   * `disabledConnectorIdsByConversation` (see `partialize` below): which axis
   * a conversation runs on is a standing fact about that conversation, the
   * way claude.ai's Cowork and ChatGPT's Work stay on across a reload, not a
   * default that should reset the instant the tab reloads.
   */
  workModeByConversation: Record<string, CloudWorkMode>;

  // Sidebar state
  sidebarCollapsed: boolean;

  /**
   * The composer's "Temporary chat" toggle is armed before any conversation
   * exists to attach `isTemporary` to. This carries that intent from the
   * plus menu to `createConversation`'s POST body; `setActiveConversation`
   * clears it the moment a real conversation (new or existing) takes over.
   */
  pendingTemporaryChat: boolean;

  // Actions - Conversations
  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  upsertConversation: (conversation: Conversation) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  deleteConversation: (id: string) => void;
  setActiveConversation: (id: string | null) => void;
  setPendingTemporaryChat: (value: boolean) => void;
  setActiveConversationWithMessages: (
    id: string,
    messages: Message[],
    activeLeafMessageId?: string | null,
  ) => void;
  /**
   * Repoints every per-conversation bucket from a client-generated id to the
   * server id that turned out to name the same conversation -- the fresh-chat
   * send path paints its optimistic turn under a local id before the create
   * call resolves, and this is the reconciliation once it does.
   */
  renameConversationId: (fromId: string, toId: string) => void;

  // Actions - Message thread (in-thread response variants)
  /**
   * Move one conversation's visible path to end at `leafId`, recomputing the
   * derived mirror. Null returns the conversation to its linear reading.
   */
  setActiveLeaf: (conversationId: string | null | undefined, leafId: string | null) => void;
  /**
   * Give a conversation that has only ever been linear the parent pointers its
   * history implies, ahead of the first write that branches it. The client
   * mirror of the server's conversion; server rows win on the next load.
   */
  ensureLocalThreadParents: (conversationId?: string) => void;
  /**
   * Put `messageId` back on the visible path, moving the leaf to the end of its
   * own tail when it sits on an abandoned variant. A no-op for a message that is
   * already visible, so a search jump into a linear conversation costs nothing.
   */
  revealMessage: (messageId: string, conversationId?: string) => void;

  // Actions - Messages
  /**
   * AUDIT-FIX ROOT-CAUSE: every message writer now takes an OPTIONAL trailing
   * `conversationId` naming the transcript it targets. A stream writer MUST
   * pass the conversation its stream belongs to -- otherwise a turn that
   * outlives the user's navigation writes into whatever chat happens to be on
   * screen. Omitting it targets the active conversation, which is the correct
   * default for user-driven UI edits (message actions, artifact panel, ...)
   * that can only act on what is currently rendered.
   */
  setMessages: (messages: Message[], conversationId?: string) => void;
  addMessage: (message: Message, conversationId?: string) => void;
  updateMessage: (id: string, updates: Partial<Message>, conversationId?: string) => void;
  appendToMessage: (id: string, content: string, conversationId?: string) => void;
  appendToThinking: (id: string, thinking: string, conversationId?: string) => void;
  setSearching: (id: string, isSearching: boolean, conversationId?: string) => void;
  setSearchResults: (
    id: string,
    results: Array<{ url: string; title: string; snippet: string }>,
    conversationId?: string,
  ) => void;
  setExecutingCode: (id: string, isExecuting: boolean, conversationId?: string) => void;
  setToolTimeline: (id: string, tools: MessageToolEntry[], conversationId?: string) => void;
  /** Merge Deep Research run state into the message metadata. */
  setResearchState: (id: string, research: MessageResearchState, conversationId?: string) => void;
  /** Replace the AGI Work plan queue on the message metadata (last-write-wins). */
  setAgiWorkPlan: (id: string, agiWorkPlan: AgiWorkPlanStep[], conversationId?: string) => void;
  /** Update a single tool entry by toolCallId within the message's tool timeline. */
  updateToolEntry: (
    messageId: string,
    toolCallId: string,
    updates: Partial<MessageToolEntry>,
    conversationId?: string,
  ) => void;
  setCodeExecutionResult: (
    id: string,
    result: NonNullable<MessageMetadata['codeExecutionResult']>,
    conversationId?: string,
  ) => void;
  /**
   * Mirror of the delete route's default mode: the message's children are handed
   * to its own parent so the turns around it close up, and a reader standing on
   * it moves up to that parent. A linear conversation has neither, so it sees
   * only the row leave, exactly as it always has.
   */
  deleteMessage: (id: string, conversationId?: string) => void;
  /**
   * Mirror of the delete route's `?subtree=true` mode: the message goes with
   * everything that continued from it, and the reader moves to `leafId`.
   *
   * That leaf is the route's own answer rather than a locally derived one. A
   * client holding one page of a long conversation cannot see the sibling the
   * server landed on, and guessing would leave the reader somewhere the next
   * load moves them away from.
   */
  deleteMessageSubtree: (id: string, leafId: string | null, conversationId?: string) => void;
  clearMessages: (conversationId?: string) => void;

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
   * AUDIT-FIX STR-7/BUG-12: records/clears "a turn is in flight" for ONE
   * conversation. `conversationId` defaults to the active conversation; a
   * caller driving a turn that can outlive the user's navigation MUST pass its
   * own conversation id for BOTH the `true` and the `false` write. A write
   * that resolves to no conversation at all (new-chat surface with nothing
   * active) is a no-op rather than a global flag flip -- there is no turn to
   * attribute it to, and this store's loading flag means "turn in flight",
   * never "some fetch is happening" (see useConversations, which keeps its own
   * local fetch-loading state).
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
  /**
   * AUDIT-FIX STR-23: write one conversation's draft. `conversationId`
   * defaults to the active conversation; pass it explicitly to park the text
   * of a conversation the user is leaving.
   */
  setDraftContent: (content: string, conversationId?: string | null) => void;
  /** Read one conversation's parked draft ('' when there is none). */
  getDraftContent: (conversationId?: string | null) => string;
  /** Discard one conversation's parked draft. */
  clearDraftContent: (conversationId?: string | null) => void;

  // Actions - Blocked sends
  /**
   * Hold a message the send guard refused so a composer can hand it back. Re-
   * parking the same fingerprint is a no-op, so a repeated block never
   * multiplies the slot.
   */
  parkBlockedSend: (fingerprint: string, content: string) => void;
  /**
   * Drop one parked send. Matching on the fingerprint is what makes this
   * exactly-once: a composer clearing the message it restored can never
   * discard a different one parked behind it.
   */
  clearParkedSend: (fingerprint: string) => void;

  // Actions - Composer toggles (AUDIT-FIX CMP-1/CMP-2/CMP-5)
  /**
   * Read one conversation's composer send options, seeded from the durable
   * defaults when that conversation has none yet. Never returns undefined, so
   * the composer has no "first render has no toggles" hole.
   */
  getComposerToggles: (conversationId?: string | null) => ComposerToggleState;
  /**
   * Merge a partial update into one conversation's composer send options.
   * `conversationId` defaults to the active conversation.
   */
  setComposerToggles: (
    updates: Partial<ComposerToggleState>,
    conversationId?: string | null,
  ) => void;
  /** Move the new-chat toggles onto the conversation the first send created. */
  adoptPendingComposerToggles: (conversationId: string | null | undefined) => void;

  // Actions - Per-conversation connector opt-outs
  /** Connector ids disabled for one conversation ([] when none are). */
  getDisabledConnectorIds: (conversationId?: string | null) => string[];
  /** Enable or disable one connector's tools for one conversation. */
  setConnectorEnabled: (
    connectorId: string,
    enabled: boolean,
    conversationId?: string | null,
  ) => void;

  // Actions - Per-conversation Memory opt-out
  /** True unless this conversation has an explicit Memory opt-out recorded. */
  getMemoryEnabled: (conversationId?: string | null) => boolean;
  /** Switch Memory on or off for one conversation only. */
  setMemoryEnabled: (enabled: boolean, conversationId?: string | null) => void;

  // Actions - Sidebar
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Utility
  reset: () => void;
}

const initialState = {
  conversations: [],
  activeConversationId: null,
  messagesByConversation: {} as Record<string, Message[]>,
  messages: [],
  activeLeafByConversation: {} as Record<string, string | null>,
  isStreaming: false,
  streamingConversationIds: [] as string[],
  loadingConversationIds: [] as string[],
  isLoading: false,
  error: null,
  selectedModel: 'auto',
  selectedModelTier: 'balanced' as ModelTier,
  draftsByConversation: {} as Record<string, string>,
  draftContent: '',
  parkedSendsByFingerprint: {} as Record<string, string>,
  composerTogglesByConversation: {} as Record<string, ComposerToggleState>,
  disabledConnectorIdsByConversation: {} as Record<string, string[]>,
  memoryDisabledByConversation: {} as Record<string, boolean>,
  workModeByConversation: {} as Record<string, CloudWorkMode>,
  sidebarCollapsed: false,
  pendingTemporaryChat: false,
};

/**
 * AUDIT-FIX ROOT-CAUSE: bucket key for a transcript composed before its
 * conversation row exists (the empty /chat surface). Mirrors
 * `NEW_CONVERSATION_DRAFT_KEY` in packages/ui/unified-chat's chatStore. Using a
 * real key instead of "whatever `messages` happens to hold" means a pre-create
 * write is still attributable and cannot be confused with a real conversation.
 */
export const PENDING_CONVERSATION_KEY = '__new_conversation__';

function conversationKey(conversationId: string | null | undefined): string {
  return conversationId ?? PENDING_CONVERSATION_KEY;
}

type MessageStateSlice = Pick<
  ChatState,
  'messages' | 'messagesByConversation' | 'activeConversationId' | 'activeLeafByConversation'
>;

/**
 * Current transcript for `key`. When the bucket is missing but `key` IS the
 * active conversation, fall back to the derived `messages` mirror: that mirror
 * is by definition the active conversation's transcript, so this makes a direct
 * `useChatStore.setState({ messages, activeConversationId })` seed (used by
 * tests and by any consumer predating the per-conversation model) behave
 * exactly as if it had gone through `setMessages`.
 */
function readConversationMessages(state: MessageStateSlice, key: string): Message[] {
  const bucket = state.messagesByConversation[key];
  if (bucket) return bucket;
  return key === conversationKey(state.activeConversationId) ? state.messages : [];
}

/**
 * Write `next` into `key`'s bucket, refreshing the derived mirror when visible.
 *
 * The single place the active path is recomputed. Every writer already funnels
 * through here, so a variant added by any of them lands in the bucket and shows
 * up in the mirror only if it is on the path the reader has selected.
 */
function writeConversationMessages(
  state: MessageStateSlice,
  key: string,
  next: Message[],
): Pick<ChatState, 'messagesByConversation'> & Partial<Pick<ChatState, 'messages'>> {
  return {
    messagesByConversation: { ...state.messagesByConversation, [key]: next },
    ...(key === conversationKey(state.activeConversationId)
      ? { messages: resolveVisibleThread(next, state.activeLeafByConversation[key] ?? null) }
      : {}),
  };
}

/**
 * Write one conversation's rows and the leaf they are read through in a single
 * store write. `writeConversationMessages` reads the leaf from state, which is
 * exactly what a delete cannot do, its rows and its reader position change
 * together, and taking them in two writes renders the frame between them.
 */
function writeThread(
  state: MessageStateSlice,
  key: string,
  next: Message[],
  leafId: string | null,
): Pick<ChatState, 'messagesByConversation'> &
  Partial<Pick<ChatState, 'messages' | 'activeLeafByConversation'>> {
  return {
    messagesByConversation: { ...state.messagesByConversation, [key]: next },
    ...((state.activeLeafByConversation[key] ?? null) === leafId
      ? {}
      : { activeLeafByConversation: { ...state.activeLeafByConversation, [key]: leafId } }),
    ...(key === conversationKey(state.activeConversationId)
      ? { messages: resolveVisibleThread(next, leafId) }
      : {}),
  };
}

/** Apply `mapper` to one conversation's transcript (active one when unscoped). */
function updateConversationMessages(
  state: MessageStateSlice,
  conversationId: string | undefined,
  mapper: (messages: Message[]) => Message[],
) {
  const key = conversationKey(conversationId ?? state.activeConversationId);
  return writeConversationMessages(state, key, mapper(readConversationMessages(state, key)));
}

/** Merge a metadata patch onto one message inside one conversation. */
function patchMessageMetadata(
  state: MessageStateSlice,
  conversationId: string | undefined,
  messageId: string,
  patch: Partial<MessageMetadata>,
) {
  return updateConversationMessages(state, conversationId, (messages) =>
    messages.map((m) => (m.id === messageId ? { ...m, metadata: { ...m.metadata, ...patch } } : m)),
  );
}

/**
 * AUDIT-FIX STR-7/BUG-12: `isLoading` is the ACTIVE conversation's busy flag,
 * derived from the two per-conversation ledgers so it can never be left stuck
 * true by a background conversation's turn.
 */
function deriveIsLoading(state: {
  activeConversationId: string | null;
  loadingConversationIds: string[];
  streamingConversationIds: string[];
}): boolean {
  const active = state.activeConversationId;
  if (!active) return false;
  return (
    state.loadingConversationIds.includes(active) || state.streamingConversationIds.includes(active)
  );
}

export const useChatStore = create<ChatState>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        // Conversations
        setConversations: (conversations) =>
          set(
            (state) => {
              // A conversation opened by a direct URL can be older than the
              // first paginated sidebar response. Keep that fully-loaded active
              // row when the list request resolves later, otherwise its saved
              // model/project metadata disappears until another reload.
              const activeConversation = state.activeConversationId
                ? state.conversations.find(({ id }) => id === state.activeConversationId)
                : undefined;
              if (
                !activeConversation ||
                conversations.some(({ id }) => id === activeConversation.id)
              ) {
                return { conversations };
              }
              return { conversations: [activeConversation, ...conversations] };
            },
            undefined,
            'chat/setConversations',
          ),

        addConversation: (conversation) =>
          set(
            (state) => ({
              conversations: [conversation, ...state.conversations],
            }),
            undefined,
            'chat/addConversation',
          ),

        upsertConversation: (conversation) =>
          set(
            (state) => {
              const existingIndex = state.conversations.findIndex(
                ({ id }) => id === conversation.id,
              );
              if (existingIndex === -1) {
                return { conversations: [conversation, ...state.conversations] };
              }
              const conversations = [...state.conversations];
              conversations[existingIndex] = conversation;
              return { conversations };
            },
            undefined,
            'chat/upsertConversation',
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
            (state) => {
              // AUDIT-FIX ROOT-CAUSE: drop the deleted conversation's transcript
              // bucket too, otherwise it leaks for the lifetime of the tab and a
              // recreated id would resurrect a dead transcript.
              const { [id]: _removed, ...messagesByConversation } = state.messagesByConversation;
              // AUDIT-FIX STR-23: a deleted conversation's parked draft dies with it.
              const { [id]: _removedDraft, ...draftsByConversation } = state.draftsByConversation;
              // AUDIT-FIX CMP-5: and so do its composer send options -- a
              // recreated id must never resurrect a dead conversation's tools.
              const { [id]: _removedToggles, ...composerTogglesByConversation } =
                state.composerTogglesByConversation;
              // A recreated id must not resurrect a dead conversation's connector opt-outs.
              const { [id]: _removedDisabledConnectors, ...disabledConnectorIdsByConversation } =
                state.disabledConnectorIdsByConversation;
              // Nor its Memory opt-out.
              const { [id]: _removedMemoryDisabled, ...memoryDisabledByConversation } =
                state.memoryDisabledByConversation;
              // Nor its persisted Chat/AGI Work mode.
              const { [id]: _removedWorkMode, ...workModeByConversation } =
                state.workModeByConversation;
              // A deleted conversation's leaf dies with its transcript, or a
              // recreated id would resolve its path against a dead pointer.
              const { [id]: _removedLeaf, ...activeLeafByConversation } =
                state.activeLeafByConversation;
              const activeConversationId =
                state.activeConversationId === id ? null : state.activeConversationId;
              const nextKey = conversationKey(activeConversationId);
              return {
                conversations: state.conversations.filter((c) => c.id !== id),
                draftsByConversation,
                composerTogglesByConversation,
                disabledConnectorIdsByConversation,
                memoryDisabledByConversation,
                workModeByConversation,
                activeLeafByConversation,
                draftContent: draftsByConversation[nextKey] ?? '',
                activeConversationId,
                messagesByConversation,
                messages:
                  state.activeConversationId === id
                    ? []
                    : resolveVisibleThread(
                        readConversationMessages({ ...state, messagesByConversation }, nextKey),
                        activeLeafByConversation[nextKey] ?? null,
                      ),
                isLoading: deriveIsLoading({ ...state, activeConversationId }),
              };
            },
            undefined,
            'chat/deleteConversation',
          ),

        setActiveConversation: (id) =>
          set(
            (state) => {
              // AUDIT-FIX ROOT-CAUSE: switching conversations no longer DESTROYS
              // the transcript (the old `messages: []`); it re-points the derived
              // mirror at the target conversation's own bucket. That is what lets
              // an in-flight background turn keep writing into its own
              // conversation, and what lets `loadConversation` short-circuit on a
              // cached transcript instead of refetching and clobbering it.
              const messagesByConversation =
                id === null
                  ? (({ [PENDING_CONVERSATION_KEY]: _pending, ...rest }) => rest)(
                      state.messagesByConversation,
                    )
                  : state.messagesByConversation;
              const activeConversationId = id;
              return {
                activeConversationId,
                messagesByConversation,
                // Returning to the new-chat surface still starts from an empty
                // composer transcript (previous behaviour), so the pending
                // bucket is discarded rather than resurrected.
                messages:
                  id === null
                    ? []
                    : resolveVisibleThread(
                        readConversationMessages(state, conversationKey(id)),
                        state.activeLeafByConversation[conversationKey(id)] ?? null,
                      ),
                // AUDIT-FIX STR-23: the visible draft follows the conversation.
                draftContent: state.draftsByConversation[conversationKey(id)] ?? '',
                error: null,
                isLoading: deriveIsLoading({ ...state, activeConversationId }),
                ...(id !== null ? { pendingTemporaryChat: false } : {}),
              };
            },
            undefined,
            'chat/setActiveConversation',
          ),

        setActiveConversationWithMessages: (id, messages, activeLeafMessageId) =>
          set(
            (state) => {
              // The loader hands the server's leaf in with the rows it belongs
              // to. Taking them in one write is what stops the transcript
              // rendering its whole tree for the frame between them.
              const leafId =
                activeLeafMessageId === undefined
                  ? (state.activeLeafByConversation[id] ?? null)
                  : activeLeafMessageId;
              return {
                activeConversationId: id,
                messagesByConversation: { ...state.messagesByConversation, [id]: messages },
                activeLeafByConversation: { ...state.activeLeafByConversation, [id]: leafId },
                messages: resolveVisibleThread(messages, leafId),
                // AUDIT-FIX STR-23: the visible draft follows the conversation.
                draftContent: state.draftsByConversation[conversationKey(id)] ?? '',
                error: null,
                isLoading: deriveIsLoading({ ...state, activeConversationId: id }),
              };
            },
            undefined,
            'chat/setActiveConversationWithMessages',
          ),

        renameConversationId: (fromId, toId) =>
          set(
            (state) => {
              if (fromId === toId) return state;
              const messagesByConversation = { ...state.messagesByConversation };
              if (fromId in messagesByConversation) {
                messagesByConversation[toId] = messagesByConversation[fromId] ?? [];
                delete messagesByConversation[fromId];
              }
              const activeLeafByConversation = { ...state.activeLeafByConversation };
              if (fromId in activeLeafByConversation) {
                activeLeafByConversation[toId] = activeLeafByConversation[fromId] ?? null;
                delete activeLeafByConversation[fromId];
              }
              // The draft follows its conversation. Left behind under the
              // placeholder key it is unreachable: every composer reads the
              // slot for the id it is rendering, which from here on is `toId`.
              const draftsByConversation = { ...state.draftsByConversation };
              if (fromId in draftsByConversation) {
                draftsByConversation[toId] = draftsByConversation[fromId] ?? '';
                delete draftsByConversation[fromId];
              }
              const streamingConversationIds = state.streamingConversationIds.map((id) =>
                id === fromId ? toId : id,
              );
              const loadingConversationIds = state.loadingConversationIds.map((id) =>
                id === fromId ? toId : id,
              );
              const activeConversationId =
                state.activeConversationId === fromId ? toId : state.activeConversationId;
              return {
                messagesByConversation,
                activeLeafByConversation,
                draftsByConversation,
                streamingConversationIds,
                loadingConversationIds,
                activeConversationId,
                messages:
                  activeConversationId === toId
                    ? resolveVisibleThread(
                        messagesByConversation[toId] ?? [],
                        activeLeafByConversation[toId] ?? null,
                      )
                    : state.messages,
                isLoading: deriveIsLoading({
                  ...state,
                  activeConversationId,
                  loadingConversationIds,
                  streamingConversationIds,
                }),
              };
            },
            undefined,
            'chat/renameConversationId',
          ),

        // Messages
        setMessages: (messages, conversationId) =>
          set(
            (state) =>
              writeConversationMessages(
                state,
                conversationKey(conversationId ?? state.activeConversationId),
                messages,
              ),
            undefined,
            'chat/setMessages',
          ),

        addMessage: (message, conversationId) =>
          set(
            (state) =>
              updateConversationMessages(state, conversationId, (messages) => [
                ...messages,
                message,
              ]),
            undefined,
            'chat/addMessage',
          ),

        updateMessage: (id, updates, conversationId) =>
          set(
            (state) =>
              updateConversationMessages(state, conversationId, (messages) =>
                messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
              ),
            undefined,
            'chat/updateMessage',
          ),

        appendToMessage: (id, content, conversationId) =>
          set(
            (state) =>
              updateConversationMessages(state, conversationId, (messages) =>
                messages.map((m) => (m.id === id ? { ...m, content: m.content + content } : m)),
              ),
            undefined,
            'chat/appendToMessage',
          ),

        appendToThinking: (id, thinking, conversationId) =>
          set(
            (state) =>
              updateConversationMessages(state, conversationId, (messages) =>
                messages.map((m) =>
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
              ),
            undefined,
            'chat/appendToThinking',
          ),

        setSearching: (id, isSearching, conversationId) =>
          set(
            (state) => patchMessageMetadata(state, conversationId, id, { isSearching }),
            undefined,
            'chat/setSearching',
          ),

        setSearchResults: (id, results, conversationId) =>
          set(
            (state) =>
              patchMessageMetadata(state, conversationId, id, {
                searchResults: results,
                isSearching: false,
              }),
            undefined,
            'chat/setSearchResults',
          ),

        setExecutingCode: (id, isExecuting, conversationId) =>
          set(
            (state) =>
              patchMessageMetadata(state, conversationId, id, { isExecutingCode: isExecuting }),
            undefined,
            'chat/setExecutingCode',
          ),

        setToolTimeline: (id, tools, conversationId) =>
          set(
            (state) => patchMessageMetadata(state, conversationId, id, { tools }),
            undefined,
            'chat/setToolTimeline',
          ),

        setResearchState: (id, research, conversationId) =>
          set(
            (state) => patchMessageMetadata(state, conversationId, id, { research }),
            undefined,
            'chat/setResearchState',
          ),

        setAgiWorkPlan: (id, agiWorkPlan, conversationId) =>
          set(
            (state) => patchMessageMetadata(state, conversationId, id, { agiWorkPlan }),
            undefined,
            'chat/setAgiWorkPlan',
          ),

        updateToolEntry: (messageId, toolCallId, updates, conversationId) =>
          set(
            (state) =>
              updateConversationMessages(state, conversationId, (messages) =>
                messages.map((m) => {
                  if (m.id !== messageId) return m;
                  const tools = m.metadata?.tools ?? [];
                  const updatedTools = tools.map((t) =>
                    t.toolCallId === toolCallId ? { ...t, ...updates } : t,
                  );
                  return { ...m, metadata: { ...m.metadata, tools: updatedTools } };
                }),
              ),
            undefined,
            'chat/updateToolEntry',
          ),

        setCodeExecutionResult: (id, result, conversationId) =>
          set(
            (state) =>
              patchMessageMetadata(state, conversationId, id, {
                codeExecutionResult: result,
                isExecutingCode: false,
              }),
            undefined,
            'chat/setCodeExecutionResult',
          ),

        deleteMessage: (id, conversationId) =>
          set(
            (state) => {
              const key = conversationKey(conversationId ?? state.activeConversationId);
              const rows = readConversationMessages(state, key);
              const target = rows.find((m) => m.id === id);
              if (!target) return {};
              const parentId = target.parentId ?? null;
              const next = rows
                .filter((m) => m.id !== id)
                .map((m) => ((m.parentId ?? null) === id ? { ...m, parentId } : m));
              const leafId = state.activeLeafByConversation[key] ?? null;
              return writeThread(state, key, next, leafId === id ? parentId : leafId);
            },
            undefined,
            'chat/deleteMessage',
          ),

        deleteMessageSubtree: (id, leafId, conversationId) =>
          set(
            (state) => {
              const key = conversationKey(conversationId ?? state.activeConversationId);
              const rows = readConversationMessages(state, key);
              const doomed = new Set(subtreeIds(rows, id));
              if (doomed.size === 0) return {};
              return writeThread(
                state,
                key,
                rows.filter((m) => !doomed.has(m.id)),
                leafId,
              );
            },
            undefined,
            'chat/deleteMessageSubtree',
          ),

        clearMessages: (conversationId) =>
          set(
            (state) => updateConversationMessages(state, conversationId, () => []),
            undefined,
            'chat/clearMessages',
          ),

        // Message thread (in-thread response variants)
        setActiveLeaf: (conversationId, leafId) =>
          set(
            (state) => {
              const key = conversationKey(conversationId ?? state.activeConversationId);
              if ((state.activeLeafByConversation[key] ?? null) === leafId) return {};
              const activeLeafByConversation = { ...state.activeLeafByConversation, [key]: leafId };
              return {
                activeLeafByConversation,
                ...(key === conversationKey(state.activeConversationId)
                  ? {
                      messages: resolveVisibleThread(readConversationMessages(state, key), leafId),
                    }
                  : {}),
              };
            },
            undefined,
            'chat/setActiveLeaf',
          ),

        ensureLocalThreadParents: (conversationId) =>
          set(
            (state) => {
              const key = conversationKey(conversationId ?? state.activeConversationId);
              const current = readConversationMessages(state, key);
              const stamped = stampLinearParents(current);
              if (stamped === current) return {};
              return writeConversationMessages(state, key, stamped);
            },
            undefined,
            'chat/ensureLocalThreadParents',
          ),

        revealMessage: (messageId, conversationId) =>
          set(
            (state) => {
              const key = conversationKey(conversationId ?? state.activeConversationId);
              const rows = readConversationMessages(state, key);
              const leafId = state.activeLeafByConversation[key] ?? null;
              if (!leafId) return {};
              if (resolveVisibleThread(rows, leafId).some((m) => m.id === messageId)) return {};
              if (!rows.some((m) => m.id === messageId)) return {};
              const nextLeaf = resolveLeafForSibling(rows, messageId);
              const activeLeafByConversation = {
                ...state.activeLeafByConversation,
                [key]: nextLeaf,
              };
              return {
                activeLeafByConversation,
                ...(key === conversationKey(state.activeConversationId)
                  ? { messages: resolveVisibleThread(rows, nextLeaf) }
                  : {}),
              };
            },
            undefined,
            'chat/revealMessage',
          ),

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
                // AUDIT-FIX ROOT-CAUSE: flip the flag inside the OWNING
                // conversation's transcript, not "whatever is on screen".
                ...updateConversationMessages(state, conversationId, (messages) =>
                  messages.map((m) => (m.id === messageId ? { ...m, isStreaming: true } : m)),
                ),
                isLoading: deriveIsLoading({ ...state, streamingConversationIds }),
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
              // AUDIT-FIX ROOT-CAUSE: sweep the isStreaming flag on the ENDING
              // conversation's own transcript. Previously this could only touch
              // the visible array, so a background stream's teardown left its
              // bubbles stuck "streaming" forever once the user navigated away.
              return {
                streamingConversationIds,
                isStreaming: streamingConversationIds.length > 0,
                ...(targetId
                  ? updateConversationMessages(state, targetId, (messages) =>
                      messages.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)),
                    )
                  : {}),
                isLoading: deriveIsLoading({ ...state, streamingConversationIds }),
              };
            },
            undefined,
            'chat/stopStreaming',
          ),

        setLoading: (loading, conversationId) =>
          set(
            (state) => {
              // AUDIT-FIX STR-7/BUG-12: record the turn against ITS conversation
              // instead of flipping one global boolean. The old reducer accepted
              // every unscoped `true` and DISCARDED a scoped `false` whose id was
              // not active, which is exactly how a background stream left the
              // composer disabled in every other chat.
              const targetId = conversationId ?? state.activeConversationId;
              if (!targetId) return state;
              const alreadyLoading = state.loadingConversationIds.includes(targetId);
              if (loading === alreadyLoading) {
                // No ledger change, but the derived flag may still be stale
                // (e.g. a stream started/ended since the last write).
                return { isLoading: deriveIsLoading(state) };
              }
              const loadingConversationIds = loading
                ? [...state.loadingConversationIds, targetId]
                : state.loadingConversationIds.filter((id) => id !== targetId);
              return {
                loadingConversationIds,
                isLoading: deriveIsLoading({ ...state, loadingConversationIds }),
              };
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
        setDraftContent: (content, conversationId) =>
          set(
            (state) => {
              const targetId =
                conversationId === undefined ? state.activeConversationId : conversationId;
              const key = conversationKey(targetId);
              const draftsByConversation = { ...state.draftsByConversation };
              if (content) draftsByConversation[key] = content;
              else delete draftsByConversation[key];
              return {
                draftsByConversation,
                ...(key === conversationKey(state.activeConversationId)
                  ? { draftContent: content }
                  : {}),
              };
            },
            undefined,
            'chat/setDraftContent',
          ),

        getDraftContent: (conversationId) => {
          const state = get();
          const targetId =
            conversationId === undefined ? state.activeConversationId : conversationId;
          return state.draftsByConversation[conversationKey(targetId)] ?? '';
        },

        clearDraftContent: (conversationId) =>
          set(
            (state) => {
              const targetId =
                conversationId === undefined ? state.activeConversationId : conversationId;
              const key = conversationKey(targetId);
              const draftsByConversation = { ...state.draftsByConversation };
              delete draftsByConversation[key];
              return {
                draftsByConversation,
                ...(key === conversationKey(state.activeConversationId)
                  ? { draftContent: '' }
                  : {}),
              };
            },
            undefined,
            'chat/clearDraftContent',
          ),

        // Blocked sends
        parkBlockedSend: (fingerprint, content) =>
          set(
            (state) =>
              state.parkedSendsByFingerprint[fingerprint] === content
                ? state
                : {
                    parkedSendsByFingerprint: {
                      ...state.parkedSendsByFingerprint,
                      [fingerprint]: content,
                    },
                  },
            undefined,
            'chat/parkBlockedSend',
          ),

        clearParkedSend: (fingerprint) =>
          set(
            (state) => {
              if (!(fingerprint in state.parkedSendsByFingerprint)) return state;
              const { [fingerprint]: _cleared, ...parkedSendsByFingerprint } =
                state.parkedSendsByFingerprint;
              return { parkedSendsByFingerprint };
            },
            undefined,
            'chat/clearParkedSend',
          ),

        // Composer toggles (AUDIT-FIX CMP-1/CMP-2/CMP-5)
        getComposerToggles: (conversationId) => {
          const state = get();
          const targetId =
            conversationId === undefined ? state.activeConversationId : conversationId;
          const key = conversationKey(targetId);
          const stored = state.composerTogglesByConversation[key];
          if (stored) return stored;
          // A reload starts this bucket empty (composerTogglesByConversation is
          // not persisted); the persisted workMode is the one field of it that
          // must still come back.
          const persistedWorkMode = state.workModeByConversation[key];
          return persistedWorkMode
            ? { ...DEFAULT_COMPOSER_TOGGLES, workMode: persistedWorkMode }
            : { ...DEFAULT_COMPOSER_TOGGLES };
        },

        setComposerToggles: (updates, conversationId) =>
          set(
            (state) => {
              const targetId =
                conversationId === undefined ? state.activeConversationId : conversationId;
              const key = conversationKey(targetId);
              const current = state.composerTogglesByConversation[key] ?? {
                ...DEFAULT_COMPOSER_TOGGLES,
              };
              return {
                composerTogglesByConversation: {
                  ...state.composerTogglesByConversation,
                  [key]: { ...current, ...updates },
                },
                // The pending (not-yet-created) bucket is excluded: its mode is
                // a draft, not yet a standing fact about any real conversation,
                // and adoptPendingComposerToggles carries it over once one exists.
                ...(updates.workMode !== undefined && key !== PENDING_CONVERSATION_KEY
                  ? {
                      workModeByConversation: {
                        ...state.workModeByConversation,
                        [key]: updates.workMode,
                      },
                    }
                  : {}),
              };
            },
            undefined,
            'chat/setComposerToggles',
          ),

        /**
         * Carry the new-chat composer's toggles onto the conversation the first
         * send just created.
         *
         * Toggles are keyed by conversation so they cannot leak between chats,
         * and the new-chat surface writes into `PENDING_CONVERSATION_KEY`. But
         * the first send creates a real conversation and navigates to it, and
         * nothing moved the pending bucket across, so a chat started in Video
         * (or Image, or AGI Work) reverted to a plain text composer the instant
         * its own conversation existed, mid-generation (founder 2026-08-13).
         * Drafts were already migrated this way; toggles were simply forgotten.
         *
         * Deliberately keyed to conversation CREATION rather than to any
         * activation: doing this on every `setActiveConversation` would let the
         * pending toggles bleed onto an existing chat opened from the sidebar.
         * Existing toggles on the target win, and the pending bucket is cleared
         * so the next new chat starts clean.
         *
         * Also migrates the new-chat surface's disabled-connector set for the
         * same reason: a connector switched off before the first message is
         * sent must stay off once that message creates the real conversation.
         *
         * And migrates the pending work mode into `workModeByConversation`,
         * the persisted mirror `getComposerToggles` falls back to after a
         * reload: a chat's first send is the only point a real id's mode is
         * ever set through this path, so skipping the mirror here would leave
         * a conversation started in AGI Work reverting to Chat on reload even
         * though `setComposerToggles` handles every later mode switch fine.
         */
        adoptPendingComposerToggles: (conversationId) =>
          set(
            (state) => {
              const pending = state.composerTogglesByConversation[PENDING_CONVERSATION_KEY];
              const pendingDisabledConnectors =
                state.disabledConnectorIdsByConversation[PENDING_CONVERSATION_KEY];
              const pendingMemoryDisabled =
                state.memoryDisabledByConversation[PENDING_CONVERSATION_KEY];
              if (
                (!pending && !pendingDisabledConnectors && !pendingMemoryDisabled) ||
                !conversationId
              ) {
                return {};
              }
              const targetKey = conversationKey(conversationId);
              const update: Partial<ChatState> = {};
              if (pending) {
                const existingTargetToggles = state.composerTogglesByConversation[targetKey];
                const { [PENDING_CONVERSATION_KEY]: _pending, ...rest } =
                  state.composerTogglesByConversation;
                update.composerTogglesByConversation = {
                  ...rest,
                  [targetKey]: {
                    ...pending,
                    ...(existingTargetToggles ?? {}),
                  },
                };
                update.workModeByConversation = {
                  ...state.workModeByConversation,
                  [targetKey]: existingTargetToggles?.workMode ?? pending.workMode,
                };
              }
              if (pendingDisabledConnectors) {
                const { [PENDING_CONVERSATION_KEY]: _pendingIds, ...rest } =
                  state.disabledConnectorIdsByConversation;
                update.disabledConnectorIdsByConversation = {
                  ...rest,
                  [targetKey]: state.disabledConnectorIdsByConversation[targetKey] ?? [
                    ...pendingDisabledConnectors,
                  ],
                };
              }
              if (pendingMemoryDisabled !== undefined) {
                const { [PENDING_CONVERSATION_KEY]: _pendingMemory, ...rest } =
                  state.memoryDisabledByConversation;
                update.memoryDisabledByConversation = {
                  ...rest,
                  [targetKey]:
                    state.memoryDisabledByConversation[targetKey] ?? pendingMemoryDisabled,
                };
              }
              return update;
            },
            undefined,
            'chat/adoptPendingComposerToggles',
          ),

        getDisabledConnectorIds: (conversationId) => {
          const state = get();
          const targetId =
            conversationId === undefined ? state.activeConversationId : conversationId;
          return state.disabledConnectorIdsByConversation[conversationKey(targetId)] ?? [];
        },

        setConnectorEnabled: (connectorId, enabled, conversationId) =>
          set(
            (state) => {
              const targetId =
                conversationId === undefined ? state.activeConversationId : conversationId;
              const key = conversationKey(targetId);
              const current = state.disabledConnectorIdsByConversation[key] ?? [];
              const next = enabled
                ? current.filter((id) => id !== connectorId)
                : current.includes(connectorId)
                  ? current
                  : [...current, connectorId];
              return {
                disabledConnectorIdsByConversation: {
                  ...state.disabledConnectorIdsByConversation,
                  [key]: next,
                },
              };
            },
            undefined,
            'chat/setConnectorEnabled',
          ),

        getMemoryEnabled: (conversationId) => {
          const state = get();
          const targetId =
            conversationId === undefined ? state.activeConversationId : conversationId;
          return state.memoryDisabledByConversation[conversationKey(targetId)] !== true;
        },

        setMemoryEnabled: (enabled, conversationId) =>
          set(
            (state) => {
              const targetId =
                conversationId === undefined ? state.activeConversationId : conversationId;
              const key = conversationKey(targetId);
              return {
                memoryDisabledByConversation: {
                  ...state.memoryDisabledByConversation,
                  [key]: !enabled,
                },
              };
            },
            undefined,
            'chat/setMemoryEnabled',
          ),

        // Sidebar
        toggleSidebar: () =>
          set(
            (state) => ({ sidebarCollapsed: !state.sidebarCollapsed }),
            undefined,
            'chat/toggleSidebar',
          ),

        setSidebarCollapsed: (collapsed) =>
          set({ sidebarCollapsed: collapsed }, undefined, 'chat/setSidebarCollapsed'),

        setPendingTemporaryChat: (value) =>
          set({ pendingTemporaryChat: value }, undefined, 'chat/setPendingTemporaryChat'),

        // Reset
        reset: () => set(initialState, undefined, 'chat/reset'),
      }),
      {
        name: 'agiworkforce-web-chat',
        storage: createJSONStorage(() => localStorage),
        version: 4,
        partialize: (state) => ({
          // Per-conversation composer toggles are deliberately NOT persisted:
          // they describe one live conversation's next turn. Managed search is
          // ambient and therefore has no stale user preference to carry.
          selectedModel: state.selectedModel,
          selectedModelTier: state.selectedModelTier,
          sidebarCollapsed: state.sidebarCollapsed,
          // Unlike the composer toggles above, a per-conversation connector
          // opt-out is a standing decision about what a chat is allowed to
          // reach, not a next-turn default -- it must survive a reload.
          disabledConnectorIdsByConversation: state.disabledConnectorIdsByConversation,
          // Same reasoning: a per-chat Memory opt-out is a standing decision
          // about that conversation, not a next-turn default.
          memoryDisabledByConversation: state.memoryDisabledByConversation,
          // Same reasoning again: the Chat/AGI Work axis is a standing fact
          // about a conversation, not a next-turn default, so it is mirrored
          // out of composerTogglesByConversation and persisted on its own.
          workModeByConversation: state.workModeByConversation,
        }),
        // `getComposerToggles` falls back to `workModeByConversation` when the
        // ephemeral bucket has no entry, but every component reads the toggle
        // state directly off `composerTogglesByConversation` through a plain
        // selector for reactivity, not through that helper. Rehydration is
        // the one place that runs before any component mounts, so seeding the
        // ephemeral bucket for every conversation with a persisted mode here
        // is what makes both read paths agree, instead of duplicating the
        // fallback into each selector.
        merge: (persistedState, currentState) => {
          const persisted = (persistedState ?? {}) as Partial<ChatState>;
          const composerTogglesByConversation = { ...currentState.composerTogglesByConversation };
          for (const [key, workMode] of Object.entries(persisted.workModeByConversation ?? {})) {
            composerTogglesByConversation[key] ??= { ...DEFAULT_COMPOSER_TOGGLES, workMode };
          }
          return { ...currentState, ...persisted, composerTogglesByConversation };
        },
        migrate: (persisted: unknown) => {
          const next = { ...(persisted as Record<string, unknown>) };
          // v2 persisted a user-controlled search default. Search is automatic
          // in v3, so retaining that bit could silently disable it forever.
          delete next['webSearchByDefault'];
          const persistedModel =
            typeof next['selectedModel'] === 'string' ? next['selectedModel'] : 'auto';
          const canonicalModel = normalizeModelId(persistedModel) ?? persistedModel;
          if (!isAutoModeModelId(canonicalModel) && !getModelMetadataById(canonicalModel)) {
            next['selectedModel'] = 'auto';
            next['selectedModelTier'] = 'balanced';
          } else {
            next['selectedModel'] = canonicalModel;
          }
          return next;
        },
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
/**
 * AUDIT-FIX STR-7/BUG-12: whether ONE named conversation has a turn in flight.
 * Use this (not the derived active-only `isLoading`) anywhere a component must
 * reason about a conversation other than the one currently displayed.
 */
export const selectIsConversationLoading = (conversationId: string | null) => (state: ChatState) =>
  conversationId !== null &&
  (state.loadingConversationIds.includes(conversationId) ||
    state.streamingConversationIds.includes(conversationId));
/** Whether one route-owned conversation has a live stream. Unlike the
 * active-conversation selector below, this is safe during the short interval
 * between a URL change and the async transcript loader updating the store's
 * active id. */
export const selectIsConversationStreaming =
  (conversationId: string | null) => (state: ChatState) =>
    conversationId !== null && state.streamingConversationIds.includes(conversationId);
/**
 * One shared array for every "this conversation has no rows" answer. A selector
 * that returned a fresh `[]` would hand a subscriber a new snapshot on every
 * unrelated store write, which is a re-render per keystroke elsewhere in the app
 * and, through useSyncExternalStore, a loop.
 */
const EMPTY_MESSAGES: Message[] = [];

/**
 * AUDIT-FIX ROOT-CAUSE: one named conversation's transcript, resolved to its
 * ACTIVE PATH. This is the set an abandoned variant must never appear in, LLM
 * context, share, export, snapshots and the retry-banner scan all read it.
 * Anything that has to reason about the tree wants `selectConversationAllRows`.
 *
 * Resolving a branched conversation allocates, so read this imperatively
 * (`selectConversationMessages(id)(useChatStore.getState())`) rather than
 * subscribing with it; components already have the resolved path in `messages`.
 */
export const selectConversationMessages =
  (conversationId: string | null) =>
  (state: ChatState): Message[] =>
    conversationId === null
      ? EMPTY_MESSAGES
      : resolveVisibleThread(
          state.messagesByConversation[conversationId] ?? EMPTY_MESSAGES,
          state.activeLeafByConversation[conversationId] ?? null,
        );
/**
 * Every row one conversation has loaded, on the visible path or not. What the
 * pager counts siblings over; not what a prompt or an export is built from.
 * Safe to subscribe with: it returns the bucket itself, or the shared empty.
 */
export const selectConversationAllRows =
  (conversationId: string | null) =>
  (state: ChatState): Message[] =>
    conversationId === null
      ? EMPTY_MESSAGES
      : (state.messagesByConversation[conversationId] ?? EMPTY_MESSAGES);
/** The row one conversation's visible path ends at, or null when it is linear. */
export const selectActiveLeafId = (conversationId: string | null) => (state: ChatState) =>
  conversationId === null ? null : (state.activeLeafByConversation[conversationId] ?? null);
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
export const AGI_WORK_MODE: CloudWorkMode = 'agiwork';

/**
 * Whether a conversation is an AGI Work task, from either half of the answer:
 * the server's derived mode (durable, survives a new device) or the persisted
 * composer override (present from the first keystroke, before any run exists).
 * Returns a boolean so a subscriber re-renders only when the verdict changes.
 */
export const selectIsAgiWorkConversation =
  (conversationId: string | null | undefined) =>
  (state: ChatState): boolean => {
    if (!conversationId) return false;
    if (state.workModeByConversation[conversationKey(conversationId)] === AGI_WORK_MODE) {
      return true;
    }
    return state.conversations.some(
      (conversation) =>
        conversation.id === conversationId && conversation.workMode === AGI_WORK_MODE,
    );
  };

/** Subscribable form of `getDraftContent`, with the same key resolution. */
export const selectDraftContent =
  (conversationId?: string | null) =>
  (state: ChatState): string =>
    state.draftsByConversation[
      conversationKey(conversationId === undefined ? state.activeConversationId : conversationId)
    ] ?? '';

/**
 * The whole parked-send map, returned by reference so a subscriber does not
 * re-render on every unrelated store write.
 */
export const selectParkedSends = (state: ChatState): Record<string, string> =>
  state.parkedSendsByFingerprint;

/**
 * The oldest still-parked blocked send, or null. Insertion order is the order
 * the user pressed send in, so the first entry is the one owed back first.
 */
export function firstParkedSend(
  parkedSends: Record<string, string>,
): { fingerprint: string; content: string } | null {
  for (const [fingerprint, content] of Object.entries(parkedSends)) {
    return { fingerprint, content };
  }
  return null;
}

/**
 * Hand text back to the user after a send that never reached a model. An
 * existing draft wins: whatever they have typed since is newer than this.
 */
export function parkUnsentDraft(conversationId: string | null, content: string): void {
  if (!content.trim()) return;
  const state = useChatStore.getState();
  if (state.draftsByConversation[conversationKey(conversationId)]) return;
  state.setDraftContent(content, conversationId);
}

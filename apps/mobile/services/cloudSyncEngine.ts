/**
 * Mobile cloud sync engine (P2 Phase 1).
 *
 * Delta-syncs the CLOUD chat store (`chatCloudMessageStore`) with the managed-cloud
 * `/api/chat/sync` endpoint: push locally-changed rows, then pull everything with a
 * `server_version` greater than our cursor, advancing the cursor as we go.
 *
 * Also delta-syncs the CLOUD memory store (`cloudMemoryStore`) with the managed-cloud
 * `/api/memory/sync` endpoint using a SEPARATE memory cursor (independent from the
 * chat cursor). Memory sync runs inside the same `syncNow()` call, gated by the same
 * `isManagedSyncEnabled()` check.
 *
 * Also delta-syncs managed-cloud user settings with `/api/settings/sync` using a
 * SEPARATE settings cursor (independent from chat/memory/project cursors). Settings
 * sync runs last inside `syncNow()`. Only cloud-safe namespaces are ever pushed or
 * applied (see services/cloudSettingsMapping.ts).
 *
 * MANAGED-ONLY: every entry point is gated on `isManagedSyncEnabled()` and the `api`
 * client routes through `guardedFetch`, which independently refuses any network I/O
 * in Local mode. Local-mode conversations live in a separate store and are never
 * touched here. IDs are UUIDv7 (client-generated, collision-free, time-ordered).
 *
 * Wave 4: the PURE apply/cursor logic below (conversation/message delta apply,
 * memory delta apply, push-item mapping, cursor arithmetic, settings push/pull
 * gating) delegates to @agiworkforce/sync — the same
 * rules desktop's Rust cloud_sync.rs implements natively and keeps in sync
 * with via golden-fixture replay (packages/client/sync/src/__fixtures__).
 * What stays here is mobile-only glue: Zustand store access (the "port"
 * adapters below), scheduling, egress-guarded transport, and Zod validation.
 * Project apply and memory/project push mapping were intentionally NOT
 * extracted — see the inline scope notes at each call site.
 */
import { api } from './api';
import { managedCloudProjects } from './managedCloudProjects';
import { agiNativeColors } from '@agiworkforce/design-tokens';
import type { ProjectSyncPushItem } from '@agiworkforce/cloud-contracts';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useChatCloudMessageStore } from '@/stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore, type DirtyMessageRef } from '@/stores/chat/cloudSyncStateStore';
import { generatedImageToMobileArtifact, useArtifactStore } from '@/src/features/artifacts/store';
import { getDurableGeneratedImagePath } from '@/src/features/image/services/imagegen';
import { useCloudMemoryStore, type CloudMemoryEntry } from '@/stores/memory/cloudMemoryStore';
import { useMemorySyncStateStore } from '@/stores/memory/memorySyncStateStore';
import { useCloudProjectStore, type CloudProject } from '@/stores/projects/cloudProjectStore';
import { useProjectSyncStateStore } from '@/stores/projects/projectSyncStateStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';
import { useSettingsSyncStateStore } from '@/stores/settings/settingsSyncStateStore';
import { toCloudSettings, applyCloudSettings, type CloudSettings } from './cloudSettingsMapping';
import type { ChatMessage } from '@/types/chat';
import {
  assertCloudAccountEpochCurrent,
  captureCloudAccountEpoch,
  isStaleCloudAccountOperation,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
// Wire shapes + pure apply/cursor logic come from the shared cloud contracts
// and sync-apply modules (@agiworkforce/sync) — the same schemas the web
// routes' contract tests enforce server-side, and the same apply rules
// desktop's Rust engine replays via golden fixtures. Every pull/push response
// is still validated here, so a server-shape drift throws into syncNow()'s
// catch (status 'error') instead of silently mis-applying deltas.
import {
  ChatSyncPullResponseSchema,
  ChatSyncPushResponseSchema,
  MemorySyncPullResponseSchema,
  MemorySyncPushResponseSchema,
  MANAGED_CLOUD_SETTINGS_SYNC_PATH,
  SettingsSyncPullResponseSchema,
  SettingsSyncPushRequestSchema,
  SettingsSyncPushResponseSchema,
  type ConversationWireDelta,
  type MessageWireDelta,
  CloudToolApprovalProjectionSchema,
  ManagedCloudAgentRunReferenceSchema,
  readPersistedCloudToolApproval,
  CloudSafeSettingsSchema,
  type CloudSafeSettings,
} from '@agiworkforce/cloud-contracts';
import {
  applyConversationDeltas as applyConversationDeltasCore,
  applyMessageDeltas as applyMessageDeltasCore,
  toConversationPushItem,
  conversationSyncContentMatches,
  toMessagePushItem,
  messageSyncContentMatches,
  isSyncableMessageRole,
  mapMemoryWireDelta,
  applyMemoryDeltas,
  toMemoryPushItem,
  memorySyncContentMatches,
  mapProjectWireDelta,
  mergeCloudSafeSettings,
  rebaseCloudSafeSettings,
  shouldPushSettings,
  shouldApplyPulledSettings,
  selectNextCursor,
  type ConversationStorePort,
  type SyncConversationRecord,
  type MessageStorePort,
  type MessagePushItem,
  type SyncMessageRecord,
} from '@agiworkforce/sync';

const SYNC_PATH = '/api/chat/sync';
const MEMORY_SYNC_PATH = '/api/memory/sync';
/** Safety bound on the pull pagination loop (each page is up to 500 rows). */
const PULL_PAGE_GUARD = 50;

/**
 * Managed-only gate: the cloud-chat feature is on AND the app is in cloud mode.
 * The `api` client's guardedFetch is an independent fail-closed backstop that
 * refuses egress in Local mode regardless of this check.
 */
export function isManagedSyncEnabled(): boolean {
  try {
    return (
      FEATURES.cloudChat === true &&
      useChatAppModeStore.getState().appMode === 'cloud' &&
      captureCloudAccountEpoch() !== null
    );
  } catch {
    return false;
  }
}

// ── Port adapters over the Zustand cloud stores ─────────────────────────────
//
// The pure apply rules live in @agiworkforce/sync;
// these adapters are the mobile-specific glue that satisfies its port
// interfaces against chatCloudMessageStore. Each method does a live
// `.getState()` read/write (never a cached snapshot), so a mutation from an
// earlier delta in the same apply call is visible to a later one — matching
// the original single-pass implementation's behavior.

const conversationPort: ConversationStorePort = {
  get: (id) => {
    const c = useChatCloudMessageStore.getState().conversations.find((x) => x.id === id);
    if (!c) return undefined;
    return {
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount: c.messageCount,
      pinned: c.pinned,
      model: c.model,
      projectId: c.projectId,
      serverVersion: c.serverVersion,
    };
  },
  insert: (record) => {
    useChatCloudMessageStore.getState().addCloudConversation({
      id: record.id,
      title: record.title,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      messageCount: record.messageCount,
      pinned: record.pinned,
      model: record.model,
      projectId: record.projectId,
      serverVersion: record.serverVersion,
    });
  },
  patch: (id, patch) => {
    useChatCloudMessageStore.getState().patchCloudConversation(id, patch);
  },
  remove: (id) => {
    useChatCloudMessageStore.getState().removeCloudConversation(id);
  },
};

/**
 * Normalize a possibly-non-string ChatMessage content field to the wire's
 * `content: string` requirement. Used ONLY at the push (wire) boundary,
 * matching the original push()'s guard exactly — NOT in the port's
 * getMessages below, where `content` must pass through byte-for-byte
 * unchanged for any message not targeted by the current delta batch (see
 * that comment for why).
 */
function messageContentToString(content: unknown): string {
  return typeof content === 'string' ? content : JSON.stringify(content);
}

/**
 * Project pending approval cards into sync metadata. This is display state
 * only; the approval endpoint ignores it and loads executable arguments from
 * the tenant-owned server checkpoint.
 */
function messageMetadataForSync(message: ChatMessage): Record<string, unknown> | null {
  const base = message.metadata ? { ...message.metadata } : {};
  const candidateImageUrl =
    typeof message.imageUrl === 'string'
      ? message.imageUrl
      : typeof base['imageUrl'] === 'string'
        ? base['imageUrl']
        : undefined;
  const durableImagePath =
    message.imageGenPersisted === false
      ? null
      : getDurableGeneratedImagePath(
          candidateImageUrl === undefined ? undefined : { url: candidateImageUrl },
        );

  // Image metadata crosses the device boundary only as a validated,
  // owner-scoped `/api/files/<uuid>` identity. Remove any legacy provider URL
  // or inline payload before rebuilding the bounded projection below.
  delete base['imageUrl'];
  delete base['imageGenPrompt'];
  delete base['imageGenModel'];
  delete base['revisedPrompt'];
  if (base['toolType'] === 'image-generation') delete base['toolType'];

  if (durableImagePath) {
    base['toolType'] = 'image-generation';
    base['imageUrl'] = durableImagePath;
    const prompt =
      typeof message.imageGenPrompt === 'string'
        ? message.imageGenPrompt
        : typeof message.metadata?.['imageGenPrompt'] === 'string'
          ? message.metadata['imageGenPrompt']
          : undefined;
    const model =
      typeof message.model === 'string'
        ? message.model
        : typeof message.metadata?.['imageGenModel'] === 'string'
          ? message.metadata['imageGenModel']
          : undefined;
    const revisedPrompt =
      typeof message.revisedPrompt === 'string'
        ? message.revisedPrompt
        : typeof message.metadata?.['revisedPrompt'] === 'string'
          ? message.metadata['revisedPrompt']
          : undefined;
    if (prompt) base['imageGenPrompt'] = prompt.slice(0, 4_000);
    if (model) base['imageGenModel'] = model.slice(0, 200);
    if (revisedPrompt) base['revisedPrompt'] = revisedPrompt.slice(0, 4_000);
  }

  const runReference = ManagedCloudAgentRunReferenceSchema.safeParse(base.cloudAgentRun);
  const calls = (message.toolCalls ?? [])
    .filter(
      (call) =>
        call.requiresApproval === true &&
        typeof call.toolCallId === 'string' &&
        call.toolCallId.length > 0,
    )
    .map((call) => ({
      toolCallId: call.toolCallId as string,
      name: call.name,
      ...(call.input !== undefined ? { input: call.input } : {}),
      ...(call.approvalDecision ? { approvalDecision: call.approvalDecision } : {}),
    }));

  if (runReference.success && calls.length > 0) {
    base.cloudApproval = CloudToolApprovalProjectionSchema.parse({
      schemaVersion: 1,
      runId: runReference.data.runId,
      calls,
    });
  } else if (runReference.success || 'cloudApproval' in base) {
    // An explicit null clears approval cards on other devices after the run
    // resumes or terminates. Omitting the key would leave stale cards behind.
    base.cloudApproval = null;
  }

  return Object.keys(base).length > 0 ? base : null;
}

function hydrateGeneratedImageFields(
  metadata: Record<string, unknown> | null | undefined,
): Pick<
  ChatMessage,
  | 'type'
  | 'imageUrl'
  | 'imageGenPersisted'
  | 'imageGenPrompt'
  | 'revisedPrompt'
  | 'isGeneratingImage'
  | 'imageGenStatus'
  | 'imageGenProgress'
  | 'imageGenError'
> {
  const rawImageUrl = metadata?.['imageUrl'];
  const imageUrl =
    metadata?.['toolType'] === 'image-generation' && typeof rawImageUrl === 'string'
      ? getDurableGeneratedImagePath({ url: rawImageUrl })
      : null;
  if (!imageUrl) {
    return {
      type: undefined,
      imageUrl: undefined,
      imageGenPersisted: undefined,
      imageGenPrompt: undefined,
      revisedPrompt: undefined,
      isGeneratingImage: undefined,
      imageGenStatus: undefined,
      imageGenProgress: undefined,
      imageGenError: undefined,
    };
  }

  return {
    type: 'image',
    imageUrl,
    imageGenPersisted: true,
    imageGenPrompt:
      typeof metadata?.['imageGenPrompt'] === 'string'
        ? metadata['imageGenPrompt'].slice(0, 4_000)
        : undefined,
    revisedPrompt:
      typeof metadata?.['revisedPrompt'] === 'string'
        ? metadata['revisedPrompt'].slice(0, 4_000)
        : undefined,
    isGeneratingImage: false,
    imageGenStatus: 'completed',
    imageGenProgress: 100,
    imageGenError: undefined,
  };
}

function hydrateApprovalToolCalls(
  existing: ChatMessage | undefined,
  metadata: Record<string, unknown> | null | undefined,
): ChatMessage['toolCalls'] {
  const rawProjection = metadata?.cloudApproval;
  if (rawProjection === null) {
    return existing?.toolCalls?.map((call) =>
      call.requiresApproval
        ? {
            ...call,
            requiresApproval: false,
            status: call.approvalDecision === 'rejected' ? 'failed' : 'completed',
          }
        : call,
    );
  }

  const persisted = readPersistedCloudToolApproval(metadata);
  if (!persisted) {
    return existing?.toolCalls;
  }

  const existingById = new Map(
    (existing?.toolCalls ?? []).map((call) => [call.toolCallId ?? call.id, call]),
  );
  return persisted.projection.calls.map((call) => ({
    ...(existingById.get(call.toolCallId) ?? {}),
    id: call.toolCallId,
    toolCallId: call.toolCallId,
    name: call.name,
    ...(call.input !== undefined ? { input: call.input } : {}),
    status: 'running' as const,
    requiresApproval: true,
    ...(call.approvalDecision ? { approvalDecision: call.approvalDecision } : {}),
  }));
}

function getMessageRecord(
  conversationId: string,
  messageId: string,
): SyncMessageRecord | undefined {
  return messagePort.getMessages(conversationId).find((message) => message.id === messageId);
}

function patchMessageServerVersion(
  conversationId: string,
  messageId: string,
  serverVersion: string,
): void {
  const current = useChatCloudMessageStore.getState().messages[conversationId] ?? [];
  useChatCloudMessageStore.getState().setCloudMessages(
    conversationId,
    current.map((message) => (message.id === messageId ? { ...message, serverVersion } : message)),
  );
}

const messagePort: MessageStorePort = {
  getMessages: (conversationId) => {
    const msgs = useChatCloudMessageStore.getState().messages[conversationId] ?? [];
    // NOTE: `content` is passed through AS-IS (never stringified here), even
    // though ChatMessage.content is typed as string. applyMessageDeltas only
    // overwrites `content` for ids present in the delta batch (from the
    // wire, always a real string); every OTHER message in this list is a
    // pure pass-through — getMessages → (unmodified) → setMessages's
    // `{...existing}` overlay writes the exact original value back. The
    // original single-pass applyMessageDeltas never touched a non-delta'd
    // message's content at all, so this round-trip must be lossless,
    // regardless of what content actually holds at runtime.
    return msgs.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      model: (m as { model?: string }).model,
      provider: (m as { provider?: string }).provider,
      createdAt: (m as { createdAt?: string }).createdAt,
      metadata: messageMetadataForSync(m),
      serverVersion: m.serverVersion,
    }));
  },
  setMessages: (conversationId, records) => {
    // Re-attach each record onto its EXISTING full ChatMessage (if any) so
    // rich, sync-irrelevant fields (attachments, artifacts, toolCalls, steps,
    // image-gen state, ...) survive an apply — the shared apply function only
    // ever sees the minimal SyncMessageRecord projection above, never the
    // full local message shape.
    const existingById = new Map(
      (useChatCloudMessageStore.getState().messages[conversationId] ?? []).map((m) => [m.id, m]),
    );
    const chatMessages = records.map((record) => {
      const existing = existingById.get(record.id);
      const toolCalls = hydrateApprovalToolCalls(existing, record.metadata);
      const generatedImage = hydrateGeneratedImageFields(record.metadata);
      return {
        ...(existing ?? {}),
        id: record.id,
        role: record.role,
        content: record.content,
        ...(record.model ? { model: record.model } : {}),
        ...(record.provider ? { provider: record.provider } : {}),
        createdAt: record.createdAt,
        metadata: record.metadata ?? undefined,
        serverVersion: record.serverVersion,
        ...(toolCalls ? { toolCalls } : {}),
        ...generatedImage,
      } as ChatMessage;
    });
    useChatCloudMessageStore.getState().setCloudMessages(conversationId, chatMessages);
    const conversationTitle =
      useChatCloudMessageStore
        .getState()
        .conversations.find((conversation) => conversation.id === conversationId)?.title ??
      'AGI Cloud';
    const artifactOwner = captureCloudAccountEpoch();
    const generatedImages = artifactOwner
      ? chatMessages.flatMap((message) => {
          const imagePath =
            message.type === 'image' && message.imageGenPersisted === true && message.imageUrl
              ? getDurableGeneratedImagePath({ url: message.imageUrl })
              : null;
          return imagePath
            ? [
                generatedImageToMobileArtifact({
                  messageId: message.id,
                  imagePath,
                  prompt: message.imageGenPrompt ?? message.revisedPrompt,
                  createdAt: message.createdAt,
                  conversationTitle,
                  provenance: { scope: 'cloud', ownerId: artifactOwner.ownerId },
                  accentColor: agiNativeColors.dark.terraCotta,
                }),
              ]
            : [];
        })
      : [];
    if (generatedImages.length > 0) {
      useArtifactStore.getState().addArtifacts(generatedImages);
    }
  },
};

// ── Apply pulled deltas into the cloud store ────────────────────────────────────

/**
 * Applies pulled conversation deltas via the shared sync-apply rule (see
 * @agiworkforce/sync conversations.ts: tombstone-remove, server-revision
 * upsert, complete dirty-mutation preservation). Exported (not just used
 * internally) — kept as a named export with this exact one-argument signature because
 * apps/mobile/__tests__/cloud-delete-rename-durability.test.ts imports and
 * calls it directly.
 */
export function applyConversationDeltas(deltas: ConversationWireDelta[]): void {
  const dirtyIds = useCloudSyncStateStore.getState().dirtyConversationIds;
  applyConversationDeltasCore(conversationPort, deltas, dirtyIds);
}

function applyMessageDeltas(deltas: MessageWireDelta[]): void {
  applyMessageDeltasCore(messagePort, deltas);
}

// ── Pull ────────────────────────────────────────────────────────────────────────

async function pull(account: CloudAccountEpoch): Promise<void> {
  let cursor = useCloudSyncStateStore.getState().cursor;
  for (let page = 0; page < PULL_PAGE_GUARD; page += 1) {
    const raw = await api.get<unknown>(`${SYNC_PATH}?since=${encodeURIComponent(cursor)}`);
    assertCloudAccountEpochCurrent(account);
    const res = ChatSyncPullResponseSchema.parse(raw);
    applyConversationDeltas(res.conversations);
    applyMessageDeltas(res.messages);
    // Artifacts (0039): mobile is a PULLER — apply pulled cloud artifacts via the shared
    // state-sync logic. Kept in a separate store slice; the gallery merges on render.
    useArtifactStore.getState().applyCloudArtifactDeltas(res.artifacts, account.ownerId);
    // Trust the server's SAFE cursor. The two tables paginate independently and
    // share one version sequence, so taking the max of per-row server_versions
    // overshoots the lagging table's frontier and skips rows that fall in the gap
    // (the server now bounds the cursor to that frontier). Only ever move forward.
    cursor = selectNextCursor(cursor, res.cursor);
    useCloudSyncStateStore.getState().setCursor(cursor);
    if (!res.hasMore) break;
  }
}

// ── Push ────────────────────────────────────────────────────────────────────────

async function push(account: CloudAccountEpoch): Promise<void> {
  const { dirtyConversationIds, dirtyMessages } = useCloudSyncStateStore.getState();
  if (dirtyConversationIds.length === 0 && dirtyMessages.length === 0) return;

  // Conversations are sent first (the server upserts them before messages, so a
  // new conversation's messages pass the ownership EXISTS check in one round-trip).
  const conversationSnapshots = dirtyConversationIds
    .map((id) => conversationPort.get(id))
    .filter((c): c is SyncConversationRecord => Boolean(c));
  const conversations = conversationSnapshots.map((c) => toConversationPushItem(c));
  const sentConversationById = new Map(conversationSnapshots.map((c) => [c.id, c]));

  const cloud = useChatCloudMessageStore.getState();

  // Split message refs into buildable (a syncable local row exists) and dead (the
  // row vanished locally, or is a non-syncable 'tool' record). Dead refs are dropped
  // unconditionally; buildable refs are only cleared once the server ACKS them.
  const buildableRefs: DirtyMessageRef[] = [];
  const deadRefs: DirtyMessageRef[] = [];
  const messages: MessagePushItem[] = [];
  const sentMessageById = new Map<string, SyncMessageRecord>();
  for (const ref of dirtyMessages) {
    const msg = (cloud.messages[ref.conversationId] ?? []).find((m) => m.id === ref.messageId);
    const role = msg?.role;
    if (!msg || !role || !isSyncableMessageRole(role)) {
      deadRefs.push(ref);
      continue;
    }
    buildableRefs.push(ref);
    const snapshot: SyncMessageRecord & { role: typeof role } = {
      id: msg.id,
      role,
      content: messageContentToString(msg.content),
      model: (msg as { model?: string }).model,
      provider: (msg as { provider?: string }).provider,
      createdAt: (msg as { createdAt?: string }).createdAt,
      metadata: messageMetadataForSync(msg),
      serverVersion: msg.serverVersion,
    };
    sentMessageById.set(msg.id, snapshot);
    messages.push(toMessagePushItem(ref.conversationId, snapshot));
  }

  const resolvedConversationIds = new Set<string>();
  const resolvedMessageIds = new Set<string>();
  if (conversations.length > 0 || messages.length > 0) {
    const raw = await api.post<unknown>(SYNC_PATH, {
      protocolVersion: 2,
      conversations,
      messages,
    });
    assertCloudAccountEpochCurrent(account);
    const res = ChatSyncPushResponseSchema.parse(raw);
    for (const applied of res.applied.conversations) {
      const sent = sentConversationById.get(applied.id);
      const latest = conversationPort.get(applied.id);
      if (latest) conversationPort.patch(applied.id, { serverVersion: applied.server_version });
      if (!latest || (sent && conversationSyncContentMatches(sent, latest))) {
        resolvedConversationIds.add(applied.id);
      }
    }
    for (const applied of res.applied.messages) {
      const ref = buildableRefs.find((candidate) => candidate.messageId === applied.id);
      const sent = sentMessageById.get(applied.id);
      if (!ref || !sent) continue;
      const latest = getMessageRecord(ref.conversationId, applied.id);
      if (latest) {
        patchMessageServerVersion(ref.conversationId, applied.id, applied.server_version);
      }
      if (!latest || messageSyncContentMatches(sent, latest)) {
        resolvedMessageIds.add(applied.id);
      }
    }
    for (const conflict of res.conflicts.conversations) {
      const sent = sentConversationById.get(conflict.id);
      const latest = conversationPort.get(conflict.id);
      if (!conflict.current || conflict.current.deleted_at) {
        conversationPort.remove(conflict.id);
        resolvedConversationIds.add(conflict.id);
        continue;
      }
      const needsLegacyRebase = sent?.serverVersion === undefined;
      if (sent && latest && (needsLegacyRebase || !conversationSyncContentMatches(sent, latest))) {
        conversationPort.patch(conflict.id, {
          ...latest,
          serverVersion: conflict.current.server_version,
        });
      } else {
        applyConversationDeltasCore(conversationPort, [conflict.current], []);
        resolvedConversationIds.add(conflict.id);
      }
    }
    for (const conflict of res.conflicts.messages) {
      const ref = buildableRefs.find((candidate) => candidate.messageId === conflict.id);
      const sent = sentMessageById.get(conflict.id);
      if (!conflict.current || !ref) continue;
      const latest = getMessageRecord(ref.conversationId, conflict.id);
      if (sent && latest && !messageSyncContentMatches(sent, latest)) {
        patchMessageServerVersion(ref.conversationId, conflict.id, conflict.current.server_version);
        continue;
      }
      applyMessageDeltas([conflict.current]);
      resolvedMessageIds.add(conflict.id);
    }
  }

  // Clear a conversation only after an exact-snapshot ACK or deterministic server
  // winner. Edits made while either conversation or message requests are in
  // flight keep their dirty refs and are rebased onto the returned revision.
  // An unacked orphan stays dirty until its parent reaches the server.
  const clearedMessageRefs = [
    ...deadRefs,
    ...buildableRefs.filter((ref) => resolvedMessageIds.has(ref.messageId)),
  ];
  useCloudSyncStateStore.getState().clearDirty([...resolvedConversationIds], clearedMessageRefs);
}

// ── Memory pull ────────────────────────────────────────────────────────────────

async function pullMemory(account: CloudAccountEpoch): Promise<void> {
  let cursor = useMemorySyncStateStore.getState().memoryCursor;
  for (let page = 0; page < PULL_PAGE_GUARD; page += 1) {
    const raw = await api.get<unknown>(`${MEMORY_SYNC_PATH}?since=${encodeURIComponent(cursor)}`);
    assertCloudAccountEpochCurrent(account);
    const res = MemorySyncPullResponseSchema.parse(raw);
    const memories = res.memories;
    if (memories.length > 0) {
      // Map wire snake_case → client camelCase, then upsert/tombstone by id —
      // both steps are the shared sync-apply rule (memory.ts); the engine's
      // only job is to read the current entries and write the merged result.
      const current: CloudMemoryEntry[] = useCloudMemoryStore.getState().entries;
      const dirtyIds = useMemorySyncStateStore.getState().dirtyMemoryIds;
      const merged = applyMemoryDeltas(current, memories.map(mapMemoryWireDelta), dirtyIds);
      useCloudMemoryStore.setState({ entries: merged });
    }
    cursor = selectNextCursor(cursor, res.cursor);
    useMemorySyncStateStore.getState().setMemoryCursor(cursor);
    if (!res.hasMore) break;
  }
}

// ── Memory push ────────────────────────────────────────────────────────────────

async function pushMemory(account: CloudAccountEpoch): Promise<void> {
  const { dirtyMemoryIds } = useMemorySyncStateStore.getState();
  if (dirtyMemoryIds.length === 0) return;

  const allEntries = useCloudMemoryStore.getState().entries;
  const entryById = new Map(allEntries.map((e) => [e.id, e]));

  // Separate live entries from dead refs (entry vanished from store — skip, clear).
  const liveIds: string[] = [];
  const deadIds: string[] = [];
  const payload = [] as ReturnType<typeof toMemoryPushItem>[];

  for (const id of dirtyMemoryIds) {
    const entry = entryById.get(id);
    if (!entry) {
      deadIds.push(id);
      continue;
    }
    liveIds.push(id);
    // Deleted entries are sent as tombstones; the server applies the soft-delete.
    payload.push(toMemoryPushItem(entry));
  }

  // Dead refs: clear immediately (nothing to push).
  const ackedIds = new Set<string>();
  const resolvedIds = new Set<string>();
  if (payload.length > 0) {
    const raw = await api.post<unknown>(MEMORY_SYNC_PATH, {
      protocolVersion: 2,
      memories: payload,
    });
    assertCloudAccountEpochCurrent(account);
    const res = MemorySyncPushResponseSchema.parse(raw);
    for (const applied of res.applied) {
      ackedIds.add(applied.id);
      const sent = entryById.get(applied.id);
      const latest = useCloudMemoryStore
        .getState()
        .entries.find((entry) => entry.id === applied.id);
      if (latest) {
        useCloudMemoryStore
          .getState()
          .upsertCloudMemory({ ...latest, serverVersion: applied.server_version });
      }
      if (!latest || (sent && memorySyncContentMatches(sent, latest))) {
        resolvedIds.add(applied.id);
      }
    }
    for (const conflict of res.conflicts) {
      const sent = entryById.get(conflict.id);
      const latest = useCloudMemoryStore
        .getState()
        .entries.find((entry) => entry.id === conflict.id);
      if (!conflict.current || conflict.current.is_deleted) {
        useCloudMemoryStore.getState().hardDeleteCloudMemory(conflict.id);
        resolvedIds.add(conflict.id);
        continue;
      }
      const serverWinner = mapMemoryWireDelta(conflict.current);
      const needsLegacyRebase = sent?.serverVersion === undefined;
      if (sent && latest && (needsLegacyRebase || !memorySyncContentMatches(sent, latest))) {
        useCloudMemoryStore
          .getState()
          .upsertCloudMemory({ ...latest, serverVersion: serverWinner.serverVersion });
      } else {
        useCloudMemoryStore.getState().upsertCloudMemory(serverWinner);
        resolvedIds.add(conflict.id);
      }
    }
  }

  // Hard-delete tombstones that the server acked.
  for (const id of liveIds) {
    const entry = entryById.get(id);
    if (entry?.isDeleted && ackedIds.has(id) && resolvedIds.has(id)) {
      useCloudMemoryStore.getState().hardDeleteCloudMemory(id);
    }
  }

  // Clear dirty queue for: dead refs + server-acked live refs.
  const toClear = [...deadIds, ...resolvedIds];
  useMemorySyncStateStore.getState().clearMemoryDirty(toClear);
}

// ── Project pull ───────────────────────────────────────────────────────────────

async function pullProjects(account: CloudAccountEpoch): Promise<void> {
  let cursor = useProjectSyncStateStore.getState().projectCursor;
  for (let page = 0; page < PULL_PAGE_GUARD; page += 1) {
    const res = await managedCloudProjects.pullProjects(cursor);
    assertCloudAccountEpochCurrent(account);
    const items = res.projects;
    if (items.length > 0) {
      // Map wire snake_case → client camelCase via the shared mapping (projects.ts).
      // The upsert/tombstone REDUCER stays store-owned (cloudProjectStore also
      // clears activeProjectId on a tombstone — see projects.ts's scope note).
      const deltas: CloudProject[] = items.map(mapProjectWireDelta);
      const dirtyIds = new Set(useProjectSyncStateStore.getState().dirtyProjectIds);
      const preserved: CloudProject[] = [];
      const authoritative: CloudProject[] = [];
      for (const delta of deltas) {
        const local = useCloudProjectStore.getState().projects.find((p) => p.id === delta.id);
        if (dirtyIds.has(delta.id) && local && delta.deletedAt === null) {
          // A local edit happened after the snapshot sent by this sync. Preserve
          // that edit, but advance its CAS base to the latest server revision.
          preserved.push({ ...local, serverVersion: delta.serverVersion });
        } else {
          authoritative.push(delta);
        }
      }
      if (authoritative.length > 0) {
        useCloudProjectStore.getState().applyCloudProjectDeltas(authoritative);
      }
      for (const project of preserved) {
        useCloudProjectStore.getState().upsertCloudProject(project);
      }
    }
    cursor = selectNextCursor(cursor, res.cursor);
    useProjectSyncStateStore.getState().setProjectCursor(cursor);
    if (!res.hasMore) break;
  }
}

// ── Project push ───────────────────────────────────────────────────────────────

async function pushProjects(account: CloudAccountEpoch): Promise<void> {
  const { dirtyProjectIds } = useProjectSyncStateStore.getState();
  if (dirtyProjectIds.length === 0) return;

  const allProjects = useCloudProjectStore.getState().projects;
  const projectById = new Map(allProjects.map((p) => [p.id, p]));

  // Separate live projects from dead refs (project vanished from store — skip, clear).
  const liveIds: string[] = [];
  const deadIds: string[] = [];
  const payload: ProjectSyncPushItem[] = [];

  for (const id of dirtyProjectIds) {
    const project = projectById.get(id);
    if (!project) {
      deadIds.push(id);
      continue;
    }
    liveIds.push(id);
    // Tombstone projects are sent with deletedAt; the server applies the soft-delete.
    payload.push({
      id: project.id,
      name: project.name,
      description: project.description,
      instructions: project.instructions,
      color: project.color,
      isArchived: project.isArchived,
      metadata: project.metadata,
      baseVersion: project.serverVersion ?? '0',
      deletedAt: project.deletedAt,
    });
  }

  // Dead refs: clear immediately (nothing to push).
  const ackedIds = new Set<string>();
  const resolvedConflictIds = new Set<string>();
  if (payload.length > 0) {
    const res = await managedCloudProjects.pushProjects({ projects: payload });
    assertCloudAccountEpochCurrent(account);
    for (const applied of res.applied) {
      ackedIds.add(applied.id);
      const sent = projectById.get(applied.id);
      const latest = useCloudProjectStore.getState().projects.find((p) => p.id === applied.id);
      if (latest) {
        useCloudProjectStore
          .getState()
          .upsertCloudProject({ ...latest, serverVersion: applied.server_version });
      }
      if (sent && latest && projectSyncContentMatches(sent, latest)) {
        resolvedConflictIds.add(applied.id);
      }
    }
    for (const conflict of res.conflicts) {
      const sent = projectById.get(conflict.id);
      const latest = useCloudProjectStore.getState().projects.find((p) => p.id === conflict.id);
      if (!conflict.current) {
        useCloudProjectStore.getState().hardDeleteCloudProject(conflict.id);
        resolvedConflictIds.add(conflict.id);
        continue;
      }
      const serverWinner = mapProjectWireDelta(conflict.current);
      if (serverWinner.deletedAt !== null) {
        // Deletion is authoritative across every Managed Cloud surface. Never
        // resurrect a project merely because a local edit raced the tombstone.
        useCloudProjectStore.getState().applyCloudProjectDeltas([serverWinner]);
        resolvedConflictIds.add(conflict.id);
        continue;
      }
      const needsLegacyRebase = sent?.serverVersion === undefined;
      if (sent && latest && (needsLegacyRebase || !projectSyncContentMatches(sent, latest))) {
        useCloudProjectStore
          .getState()
          .upsertCloudProject({ ...latest, serverVersion: serverWinner.serverVersion });
      } else {
        useCloudProjectStore.getState().applyCloudProjectDeltas([serverWinner]);
        resolvedConflictIds.add(conflict.id);
      }
    }
  }

  // Hard-delete tombstones that the server acked.
  for (const id of liveIds) {
    const project = projectById.get(id);
    if (project?.deletedAt !== null && ackedIds.has(id) && resolvedConflictIds.has(id)) {
      useCloudProjectStore.getState().hardDeleteCloudProject(id);
    }
  }

  // Clear dirty queue for: dead refs + server-acked live refs.
  const toClear = [...deadIds, ...resolvedConflictIds];
  useProjectSyncStateStore.getState().clearProjectDirty(toClear);
}

/** Compare only fields carried by the project sync mutation, not local clocks/revisions. */
function projectSyncContentMatches(left: CloudProject, right: CloudProject): boolean {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.description === right.description &&
    left.instructions === right.instructions &&
    left.color === right.color &&
    left.isArchived === right.isArchived &&
    JSON.stringify(left.metadata) === JSON.stringify(right.metadata) &&
    left.deletedAt === right.deletedAt
  );
}

// ── Settings push ───────────────────────────────────────────────────────────────

/**
 * Push the cloud-safe settings projection if a real local edit has been made since
 * the last push. Gated by the shared `shouldPushSettings` rule (settings.ts):
 *
 * 1. `settingsUpdatedAt !== null` — null means this device has never changed any
 *    cloud-safe setting (factory defaults). A fresh device must NOT push defaults
 *    before pulling, because it has not observed a server revision. Only real
 *    edits (stamped by cloud-safe setters) are pushed.
 *
 * 2. Snapshot-diff: the current cloud projection serializes differently from
 *    `lastPushedSnapshot`. Skips the POST when nothing changed since last push
 *    (prevents redundant network I/O on background sync cycles).
 *
 * `settingsUpdatedAt` remains a local-only dirty marker. It never crosses the wire
 * and never participates in conflict resolution. The push uses the last observed
 * server revision as `baseVersion`.
 */
function parseSettingsSnapshot(serialized: string): CloudSafeSettings {
  if (!serialized) return {};
  try {
    const parsed = CloudSafeSettingsSchema.safeParse(JSON.parse(serialized));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

async function pushSettings(account: CloudAccountEpoch): Promise<CloudSettings> {
  const storeSnapshot = useCloudSettingsStore.getState();
  const { settingsUpdatedAt } = storeSnapshot;
  const current = toCloudSettings(storeSnapshot);
  const currentJson = JSON.stringify(current);
  const {
    lastPushedSnapshot,
    serverSnapshot,
    settingsCursor: baseVersion,
  } = useSettingsSyncStateStore.getState();

  if (!shouldPushSettings(settingsUpdatedAt, currentJson, lastPushedSnapshot)) return current;

  // Mobile owns only a subset of each namespace. Carry forward the complete
  // server document so a theme edit cannot erase Desktop/Web-only keys.
  const outgoing = mergeCloudSafeSettings(
    parseSettingsSnapshot(serverSnapshot),
    current as CloudSafeSettings,
  );

  const raw = await api.post<unknown>(
    MANAGED_CLOUD_SETTINGS_SYNC_PATH,
    SettingsSyncPushRequestSchema.parse({ settings: outgoing, baseVersion }),
  );
  assertCloudAccountEpochCurrent(account);
  const res = SettingsSyncPushResponseSchema.parse(raw);

  // Only an accepted compare-and-swap owns the returned revision. On conflict,
  // retain the old cursor so the following pull can retrieve the server winner.
  if (res.applied) {
    useSettingsSyncStateStore
      .getState()
      .setSettingsCursor(
        selectNextCursor(useSettingsSyncStateStore.getState().settingsCursor, res.cursor),
      );
    useSettingsSyncStateStore.getState().setServerSnapshot(JSON.stringify(outgoing));
  }
  // The attempted local projection is the three-way-merge base. On a conflict,
  // that attempt loses to the server winner; only edits made after it are replayed.
  useSettingsSyncStateStore.getState().setLastPushedSnapshot(currentJson);
  return current;
}

// ── Settings pull ───────────────────────────────────────────────────────────────

/**
 * Pull cloud settings. Settings is a single document (not a collection), so
 * there is no pagination loop — the server always returns hasMore:false.
 *
 * After applying the pulled namespaces into the live store, update the baseline
 * snapshot so the next pushSettings() call does not re-push what was just pulled
 * (which would create an infinite churn loop).
 */
async function pullSettings(
  localRequestBase: CloudSettings,
  account: CloudAccountEpoch,
): Promise<void> {
  const cursor = useSettingsSyncStateStore.getState().settingsCursor;
  const raw = await api.get<unknown>(
    `${MANAGED_CLOUD_SETTINGS_SYNC_PATH}?since=${encodeURIComponent(cursor)}`,
  );
  assertCloudAccountEpochCurrent(account);
  const res = SettingsSyncPullResponseSchema.parse(raw);

  const pulledSettings = res.settings;
  const advancedCursor = selectNextCursor(cursor, res.cursor);

  // Only apply if the server returned a new cursor (something changed).
  if (shouldApplyPulledSettings(advancedCursor, cursor, Object.keys(pulledSettings).length)) {
    const dirtyMarkerBeforeApply = useCloudSettingsStore.getState().settingsUpdatedAt;
    const localCurrent = toCloudSettings(useCloudSettingsStore.getState());
    const rebased = rebaseCloudSafeSettings(
      pulledSettings,
      localRequestBase as CloudSafeSettings,
      localCurrent as CloudSafeSettings,
    );

    // Apply the server winner first so we can record a local-surface baseline,
    // then replay only edits made while the request was in flight.
    applyCloudSettings(pulledSettings as CloudSettings);
    const serverLocalProjection = toCloudSettings(useCloudSettingsStore.getState());
    applyCloudSettings(rebased.localChanges as CloudSettings);

    const syncState = useSettingsSyncStateStore.getState();
    syncState.setLastPushedSnapshot(JSON.stringify(serverLocalProjection));
    syncState.setServerSnapshot(JSON.stringify(pulledSettings));
    useCloudSettingsStore
      .getState()
      ._setSettingsUpdatedAt(
        rebased.hasLocalChanges ? (dirtyMarkerBeforeApply ?? new Date().toISOString()) : null,
      );
  }

  useSettingsSyncStateStore.getState().setSettingsCursor(advancedCursor);
}

// ── Public API ──────────────────────────────────────────────────────────────────

let syncingAccountKey: string | null = null;

/**
 * Push local changes, then pull deltas. No-op (and zero network I/O) unless managed
 * mode is active. Single-flight: a concurrent call is dropped while one is in flight.
 */
export async function syncNow(): Promise<void> {
  // ── GATING ENFORCEMENT POINT ────────────────────────────────────────────
  // Both chat AND memory sync are gated here. isManagedSyncEnabled() requires
  // FEATURES.cloudChat === true AND appMode === 'cloud'. A Local-mode call exits
  // before any network I/O. The api client's guardedFetch is an independent
  // fail-closed backstop that refuses egress in Local mode regardless.
  if (!isManagedSyncEnabled()) return;
  const account = captureCloudAccountEpoch();
  if (!account) return;
  const accountKey = `${account.ownerId}:${account.epoch}`;
  if (syncingAccountKey === accountKey) return;
  syncingAccountKey = accountKey;
  useCloudSyncStateStore.getState().setStatus('syncing');
  try {
    // Chat sync: push dirty conversations/messages, then pull deltas.
    await push(account);
    await pull(account);
    // Memory sync: push dirty cloud memories, then pull deltas.
    // Runs after chat so the gating check above covers both. Uses its own
    // cursor (memorySyncStateStore) — independent from the chat cursor.
    await pushMemory(account);
    await pullMemory(account);
    // Project sync: push dirty cloud projects, then pull deltas.
    // Runs after memory so the single isManagedSyncEnabled() gate covers all
    // three. Uses its own cursor (projectSyncStateStore) — independent from
    // both the chat cursor and the memory cursor.
    await pushProjects(account);
    await pullProjects(account);
    // Settings sync: push cloud-safe preferences if changed, then pull.
    // Runs LAST (most sensitive — allowlist-gated). Uses its own cursor
    // (settingsSyncStateStore) — independent from all other cursors.
    // Push uses snapshot-diff dirty detection (no per-setter hooks needed).
    const settingsRequestBase = await pushSettings(account);
    await pullSettings(settingsRequestBase, account);
    assertCloudAccountEpochCurrent(account);
    useCloudSyncStateStore.getState().setStatus('idle');
    useCloudSyncStateStore.setState({ lastSyncAt: Date.now() });
  } catch (err) {
    if (isStaleCloudAccountOperation(err)) return;
    useCloudSyncStateStore
      .getState()
      .setStatus('error', err instanceof Error ? err.message : String(err));
  } finally {
    if (syncingAccountKey === accountKey) syncingAccountKey = null;
  }
}

let loopHandle: ReturnType<typeof setInterval> | null = null;

/** Start periodic background sync. Idempotent; runs one sync immediately. */
export function startCloudSyncLoop(intervalMs = 30_000): void {
  if (loopHandle) return;
  loopHandle = setInterval(() => {
    void syncNow();
  }, intervalMs);
  void syncNow();
}

export function stopCloudSyncLoop(): void {
  if (loopHandle) {
    clearInterval(loopHandle);
    loopHandle = null;
  }
}

/** Mark a locally-created/edited cloud conversation for the next push. */
export function markConversationForSync(id: string): void {
  useCloudSyncStateStore.getState().markConversationDirty(id);
}

/** Mark a locally-created/edited cloud message for the next push. */
export function markMessageForSync(conversationId: string, messageId: string): void {
  useCloudSyncStateStore.getState().markMessageDirty(conversationId, messageId);
}

/**
 * Mark a locally-created/edited/deleted cloud memory for the next push.
 * Only call this when appMode === 'cloud' (enforced by the memory store write
 * paths in src/features/memory/store.ts). An isManagedSyncEnabled() check at
 * the syncNow() entry point is the network-level gate; this function is the
 * write-side marker.
 */
export function markMemoryForSync(id: string): void {
  useMemorySyncStateStore.getState().markMemoryDirty(id);
}

/**
 * Mark a locally-created/edited/archived/deleted cloud project for the next push.
 * Only call this when appMode === 'cloud' (enforced by the project store write
 * paths in src/features/projects/store.ts). An isManagedSyncEnabled() check at
 * the syncNow() entry point is the network-level gate; this function is the
 * write-side marker.
 */
export function markProjectForSync(id: string): void {
  useProjectSyncStateStore.getState().markProjectDirty(id);
}

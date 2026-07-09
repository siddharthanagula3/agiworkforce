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
 * gating) delegates to @agiworkforce/services' sync-apply module — the same
 * rules desktop's Rust cloud_sync.rs implements natively and keeps in sync
 * with via golden-fixture replay (packages/services/src/sync-apply/__fixtures__).
 * What stays here is mobile-only glue: Zustand store access (the "port"
 * adapters below), scheduling, egress-guarded transport, and Zod validation.
 * Project apply and memory/project push mapping were intentionally NOT
 * extracted — see the inline scope notes at each call site.
 */
import { api } from './api';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useChatCloudMessageStore } from '@/stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore, type DirtyMessageRef } from '@/stores/chat/cloudSyncStateStore';
import { useArtifactStore } from '@/src/features/artifacts/store';
import { useCloudMemoryStore, type CloudMemoryEntry } from '@/stores/memory/cloudMemoryStore';
import { useMemorySyncStateStore } from '@/stores/memory/memorySyncStateStore';
import { useCloudProjectStore, type CloudProject } from '@/stores/projects/cloudProjectStore';
import { useProjectSyncStateStore } from '@/stores/projects/projectSyncStateStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';
import { useSettingsSyncStateStore } from '@/stores/settings/settingsSyncStateStore';
import { toCloudSettings, applyCloudSettings, type CloudSettings } from './cloudSettingsMapping';
import type { ChatMessage } from '@/types/chat';
// Wire shapes + pure apply/cursor logic come from the shared cloud contracts
// and sync-apply modules (packages/services) — the same schemas the web
// routes' contract tests enforce server-side, and the same apply rules
// desktop's Rust engine replays via golden fixtures. Every pull/push response
// is still validated here, so a server-shape drift throws into syncNow()'s
// catch (status 'error') instead of silently mis-applying deltas.
import {
  ChatSyncPullResponseSchema,
  ChatSyncPushResponseSchema,
  MemorySyncPullResponseSchema,
  MemorySyncPushResponseSchema,
  ProjectsSyncPullResponseSchema,
  ProjectsSyncPushResponseSchema,
  SettingsSyncPullResponseSchema,
  SettingsSyncPushResponseSchema,
  type ConversationWireDelta,
  type MessageWireDelta,
  applyConversationDeltas as applyConversationDeltasCore,
  applyMessageDeltas as applyMessageDeltasCore,
  toConversationPushItem,
  toMessagePushItem,
  isSyncableMessageRole,
  mapMemoryWireDelta,
  applyMemoryDeltas,
  mapProjectWireDelta,
  shouldPushSettings,
  shouldApplyPulledSettings,
  selectNextCursor,
  type ConversationStorePort,
  type SyncConversationRecord,
  type MessageStorePort,
  type MessagePushItem,
} from '@agiworkforce/services';

const SYNC_PATH = '/api/chat/sync';
const MEMORY_SYNC_PATH = '/api/memory/sync';
const PROJECTS_SYNC_PATH = '/api/projects/sync';
const SETTINGS_SYNC_PATH = '/api/settings/sync';
/** Safety bound on the pull pagination loop (each page is up to 500 rows). */
const PULL_PAGE_GUARD = 50;

/**
 * Managed-only gate: the cloud-chat feature is on AND the app is in cloud mode.
 * The `api` client's guardedFetch is an independent fail-closed backstop that
 * refuses egress in Local mode regardless of this check.
 */
export function isManagedSyncEnabled(): boolean {
  try {
    return FEATURES.cloudChat === true && useChatAppModeStore.getState().appMode === 'cloud';
  } catch {
    return false;
  }
}

// ── Port adapters over the Zustand cloud stores ─────────────────────────────
//
// The pure apply rules live in @agiworkforce/services' sync-apply module;
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
      return {
        ...(existing ?? {}),
        id: record.id,
        role: record.role,
        content: record.content,
        ...(record.model ? { model: record.model } : {}),
        ...(record.provider ? { provider: record.provider } : {}),
        createdAt: record.createdAt,
      } as ChatMessage;
    });
    useChatCloudMessageStore.getState().setCloudMessages(conversationId, chatMessages);
  },
};

// ── Apply pulled deltas into the cloud store ────────────────────────────────────

/**
 * Applies pulled conversation deltas via the shared sync-apply rule (see
 * @agiworkforce/services' conversations.ts: tombstone-remove, LWW upsert,
 * dirty-title preserve). Exported (not just used internally) — kept as a
 * named export with this exact one-argument signature because
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

async function pull(): Promise<void> {
  let cursor = useCloudSyncStateStore.getState().cursor;
  for (let page = 0; page < PULL_PAGE_GUARD; page += 1) {
    const res = ChatSyncPullResponseSchema.parse(
      await api.get<unknown>(`${SYNC_PATH}?since=${encodeURIComponent(cursor)}`),
    );
    applyConversationDeltas(res.conversations);
    applyMessageDeltas(res.messages);
    // Artifacts (0039): mobile is a PULLER — apply pulled cloud artifacts via the shared
    // state-sync logic. Kept in a separate store slice; the gallery merges on render.
    useArtifactStore.getState().applyCloudArtifactDeltas(res.artifacts);
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

async function push(): Promise<void> {
  const { dirtyConversationIds, dirtyMessages } = useCloudSyncStateStore.getState();
  if (dirtyConversationIds.length === 0 && dirtyMessages.length === 0) return;

  // Conversations are sent first (the server upserts them before messages, so a
  // new conversation's messages pass the ownership EXISTS check in one round-trip).
  const conversations = dirtyConversationIds
    .map((id) => conversationPort.get(id))
    .filter((c): c is SyncConversationRecord => Boolean(c))
    .map((c) => toConversationPushItem(c));

  const cloud = useChatCloudMessageStore.getState();

  // Split message refs into buildable (a syncable local row exists) and dead (the
  // row vanished locally, or is a non-syncable 'tool' record). Dead refs are dropped
  // unconditionally; buildable refs are only cleared once the server ACKS them.
  const buildableRefs: DirtyMessageRef[] = [];
  const deadRefs: DirtyMessageRef[] = [];
  const messages: MessagePushItem[] = [];
  for (const ref of dirtyMessages) {
    const msg = (cloud.messages[ref.conversationId] ?? []).find((m) => m.id === ref.messageId);
    const role = msg?.role;
    if (!msg || !role || !isSyncableMessageRole(role)) {
      deadRefs.push(ref);
      continue;
    }
    buildableRefs.push(ref);
    messages.push(
      toMessagePushItem(ref.conversationId, {
        id: msg.id,
        role,
        content: messageContentToString(msg.content),
        model: (msg as { model?: string }).model,
        provider: (msg as { provider?: string }).provider,
        createdAt: (msg as { createdAt?: string }).createdAt,
      }),
    );
  }

  let ackedMessageIds = new Set<string>();
  if (conversations.length > 0 || messages.length > 0) {
    const res = ChatSyncPushResponseSchema.parse(
      await api.post<unknown>(SYNC_PATH, { conversations, messages }),
    );
    ackedMessageIds = new Set(res.applied.messages.map((m) => m.id));
  }

  // Conversations are LWW and dependency-free: clearing every attempted ref is safe
  // (a no-op re-push achieves nothing; a stale local copy is repaired by the next
  // pull). Messages: clear only refs the server ACKED (persisted) plus dead refs. An
  // attempted-but-unacked message — its parent conversation isn't on the server yet —
  // stays dirty so a later push retries it once the conversation lands. Never drop it.
  const clearedMessageRefs = [
    ...deadRefs,
    ...buildableRefs.filter((ref) => ackedMessageIds.has(ref.messageId)),
  ];
  useCloudSyncStateStore.getState().clearDirty(dirtyConversationIds, clearedMessageRefs);
}

// ── Memory push body (camelCase to /api/memory/sync) ──────────────────────────

/** Shape for POST /api/memory/sync — server expects camelCase. */
interface MemoryPushItem {
  id: string;
  content: string;
  category?: string | null;
  source?: string;
  /** Server-side column/schema support is pending — sent best-effort. */
  pinned?: boolean;
  isDeleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// ── Memory pull ────────────────────────────────────────────────────────────────

async function pullMemory(): Promise<void> {
  let cursor = useMemorySyncStateStore.getState().memoryCursor;
  for (let page = 0; page < PULL_PAGE_GUARD; page += 1) {
    const res = MemorySyncPullResponseSchema.parse(
      await api.get<unknown>(`${MEMORY_SYNC_PATH}?since=${encodeURIComponent(cursor)}`),
    );
    const memories = res.memories;
    if (memories.length > 0) {
      // Map wire snake_case → client camelCase, then upsert/tombstone by id —
      // both steps are the shared sync-apply rule (memory.ts); the engine's
      // only job is to read the current entries and write the merged result.
      const current: CloudMemoryEntry[] = useCloudMemoryStore.getState().entries;
      const merged = applyMemoryDeltas(current, memories.map(mapMemoryWireDelta));
      useCloudMemoryStore.setState({ entries: merged });
    }
    cursor = selectNextCursor(cursor, res.cursor);
    useMemorySyncStateStore.getState().setMemoryCursor(cursor);
    if (!res.hasMore) break;
  }
}

// ── Memory push ────────────────────────────────────────────────────────────────

async function pushMemory(): Promise<void> {
  const { dirtyMemoryIds } = useMemorySyncStateStore.getState();
  if (dirtyMemoryIds.length === 0) return;

  const allEntries = useCloudMemoryStore.getState().entries;
  const entryById = new Map(allEntries.map((e) => [e.id, e]));

  // Separate live entries from dead refs (entry vanished from store — skip, clear).
  const liveIds: string[] = [];
  const deadIds: string[] = [];
  const payload: MemoryPushItem[] = [];

  for (const id of dirtyMemoryIds) {
    const entry = entryById.get(id);
    if (!entry) {
      deadIds.push(id);
      continue;
    }
    liveIds.push(id);
    // Deleted entries are sent as tombstones; the server applies the soft-delete.
    payload.push({
      id: entry.id,
      content: entry.content,
      category: entry.category,
      source: entry.source,
      pinned: entry.pinned,
      isDeleted: entry.isDeleted,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    });
  }

  // Dead refs: clear immediately (nothing to push).
  const ackedIds = new Set<string>();
  if (payload.length > 0) {
    const res = MemorySyncPushResponseSchema.parse(
      await api.post<unknown>(MEMORY_SYNC_PATH, { memories: payload }),
    );
    for (const applied of res.applied) {
      ackedIds.add(applied.id);
    }
  }

  // Hard-delete tombstones that the server acked.
  for (const id of liveIds) {
    const entry = entryById.get(id);
    if (entry?.isDeleted && ackedIds.has(id)) {
      useCloudMemoryStore.getState().hardDeleteCloudMemory(id);
    }
  }

  // Clear dirty queue for: dead refs + server-acked live refs.
  const toClear = [...deadIds, ...liveIds.filter((id) => ackedIds.has(id))];
  useMemorySyncStateStore.getState().clearMemoryDirty(toClear);
}

// ── Project push body (camelCase to /api/projects/sync) ───────────────────────

/** Shape for POST /api/projects/sync — server expects camelCase. */
interface ProjectPushItem {
  id: string;
  name: string;
  description?: string | null;
  instructions?: string | null;
  color?: string | null;
  isArchived?: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt: string;
  deletedAt?: string | null;
}

// ── Project pull ───────────────────────────────────────────────────────────────

async function pullProjects(): Promise<void> {
  let cursor = useProjectSyncStateStore.getState().projectCursor;
  for (let page = 0; page < PULL_PAGE_GUARD; page += 1) {
    const res = ProjectsSyncPullResponseSchema.parse(
      await api.get<unknown>(`${PROJECTS_SYNC_PATH}?since=${encodeURIComponent(cursor)}`),
    );
    const items = res.projects;
    if (items.length > 0) {
      // Map wire snake_case → client camelCase via the shared mapping (projects.ts).
      // The upsert/tombstone REDUCER stays store-owned (cloudProjectStore also
      // clears activeProjectId on a tombstone — see projects.ts's scope note).
      const deltas: CloudProject[] = items.map(mapProjectWireDelta);
      useCloudProjectStore.getState().applyCloudProjectDeltas(deltas);
    }
    cursor = selectNextCursor(cursor, res.cursor);
    useProjectSyncStateStore.getState().setProjectCursor(cursor);
    if (!res.hasMore) break;
  }
}

// ── Project push ───────────────────────────────────────────────────────────────

async function pushProjects(): Promise<void> {
  const { dirtyProjectIds } = useProjectSyncStateStore.getState();
  if (dirtyProjectIds.length === 0) return;

  const allProjects = useCloudProjectStore.getState().projects;
  const projectById = new Map(allProjects.map((p) => [p.id, p]));

  // Separate live projects from dead refs (project vanished from store — skip, clear).
  const liveIds: string[] = [];
  const deadIds: string[] = [];
  const payload: ProjectPushItem[] = [];

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
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      deletedAt: project.deletedAt,
    });
  }

  // Dead refs: clear immediately (nothing to push).
  const ackedIds = new Set<string>();
  if (payload.length > 0) {
    const res = ProjectsSyncPushResponseSchema.parse(
      await api.post<unknown>(PROJECTS_SYNC_PATH, { projects: payload }),
    );
    for (const applied of res.applied) {
      ackedIds.add(applied.id);
    }
  }

  // Hard-delete tombstones that the server acked.
  for (const id of liveIds) {
    const project = projectById.get(id);
    if (project?.deletedAt !== null && ackedIds.has(id)) {
      useCloudProjectStore.getState().hardDeleteCloudProject(id);
    }
  }

  // Clear dirty queue for: dead refs + server-acked live refs.
  const toClear = [...deadIds, ...liveIds.filter((id) => ackedIds.has(id))];
  useProjectSyncStateStore.getState().clearProjectDirty(toClear);
}

// ── Settings push ───────────────────────────────────────────────────────────────

/**
 * Push the cloud-safe settings projection if a real local edit has been made since
 * the last push. Gated by the shared `shouldPushSettings` rule (settings.ts):
 *
 * 1. `settingsUpdatedAt !== null` — null means this device has never changed any
 *    cloud-safe setting (factory defaults). A fresh device must NOT push defaults
 *    before pulling, as that would clobber the user's existing cloud settings via
 *    server-side LWW. Only real edits (stamped by cloud-safe setters) are pushed.
 *
 * 2. Snapshot-diff: the current cloud projection serializes differently from
 *    `lastPushedSnapshot`. Skips the POST when nothing changed since last push
 *    (prevents redundant network I/O on background sync cycles).
 *
 * The `updatedAt` in the push body is `settingsUpdatedAt` (the time the user last
 * changed a setting on this device), NOT `new Date()`. This is the LWW version
 * key: sending the real edit time lets the server correctly order concurrent edits
 * from multiple surfaces. Sending push-time would make "whichever synced last wins"
 * instead of "last writer wins."
 *
 * After a successful push (applied=true or applied=false for a stale LWW skip),
 * advances the settings cursor and updates the baseline snapshot so the pull path
 * can detect whether re-pushing after a pull would create churn.
 */
async function pushSettings(): Promise<void> {
  const storeSnapshot = useCloudSettingsStore.getState();
  const { settingsUpdatedAt } = storeSnapshot;
  const current = toCloudSettings(storeSnapshot);
  const currentJson = JSON.stringify(current);
  const { lastPushedSnapshot } = useSettingsSyncStateStore.getState();

  if (!shouldPushSettings(settingsUpdatedAt, currentJson, lastPushedSnapshot)) return;

  const res = SettingsSyncPushResponseSchema.parse(
    await api.post<unknown>(SETTINGS_SYNC_PATH, {
      settings: current,
      // Use the real local-edit time as the LWW key (not push time). This lets the
      // server correctly resolve concurrent edits from multiple surfaces.
      updatedAt: settingsUpdatedAt,
    }),
  );

  // Advance cursor regardless of applied (LWW skipped = server cursor still moves).
  const newCursor = res.cursor;
  useSettingsSyncStateStore
    .getState()
    .setSettingsCursor(
      selectNextCursor(useSettingsSyncStateStore.getState().settingsCursor, newCursor),
    );
  // Mark the snapshot as pushed so we don't re-push on the next cycle.
  useSettingsSyncStateStore.getState().setLastPushedSnapshot(currentJson);
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
async function pullSettings(): Promise<void> {
  const cursor = useSettingsSyncStateStore.getState().settingsCursor;
  const res = SettingsSyncPullResponseSchema.parse(
    await api.get<unknown>(`${SETTINGS_SYNC_PATH}?since=${encodeURIComponent(cursor)}`),
  );

  const pulledSettings = res.settings;
  const advancedCursor = selectNextCursor(cursor, res.cursor);

  // Only apply if the server returned a new cursor (something changed).
  if (shouldApplyPulledSettings(advancedCursor, cursor, Object.keys(pulledSettings).length)) {
    // Apply pulled cloud-safe namespaces into the live settings store (LWW).
    applyCloudSettings(pulledSettings as CloudSettings);

    // After applying, recompute the cloud projection from the now-updated store
    // and set it as the new baseline — prevents treating the pull as a local change
    // that triggers a redundant push on the next cycle.
    const freshSnapshot = toCloudSettings(useCloudSettingsStore.getState());
    useSettingsSyncStateStore.getState().setLastPushedSnapshot(JSON.stringify(freshSnapshot));
  }

  useSettingsSyncStateStore.getState().setSettingsCursor(advancedCursor);
}

// ── Public API ──────────────────────────────────────────────────────────────────

let syncing = false;

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
  if (syncing) return;
  syncing = true;
  useCloudSyncStateStore.getState().setStatus('syncing');
  try {
    // Chat sync: push dirty conversations/messages, then pull deltas.
    await push();
    await pull();
    // Memory sync: push dirty cloud memories, then pull deltas.
    // Runs after chat so the gating check above covers both. Uses its own
    // cursor (memorySyncStateStore) — independent from the chat cursor.
    await pushMemory();
    await pullMemory();
    // Project sync: push dirty cloud projects, then pull deltas.
    // Runs after memory so the single isManagedSyncEnabled() gate covers all
    // three. Uses its own cursor (projectSyncStateStore) — independent from
    // both the chat cursor and the memory cursor.
    await pushProjects();
    await pullProjects();
    // Settings sync: push cloud-safe preferences if changed, then pull.
    // Runs LAST (most sensitive — allowlist-gated). Uses its own cursor
    // (settingsSyncStateStore) — independent from all other cursors.
    // Push uses snapshot-diff dirty detection (no per-setter hooks needed).
    await pushSettings();
    await pullSettings();
    useCloudSyncStateStore.getState().setStatus('idle');
    useCloudSyncStateStore.setState({ lastSyncAt: Date.now() });
  } catch (err) {
    useCloudSyncStateStore
      .getState()
      .setStatus('error', err instanceof Error ? err.message : String(err));
  } finally {
    syncing = false;
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

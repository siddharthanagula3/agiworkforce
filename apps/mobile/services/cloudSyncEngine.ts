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
 * MANAGED-ONLY: every entry point is gated on `isManagedSyncEnabled()` and the `api`
 * client routes through `guardedFetch`, which independently refuses any network I/O
 * in Local mode. Local-mode conversations live in a separate store and are never
 * touched here. IDs are UUIDv7 (client-generated, collision-free, time-ordered).
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
import type { ChatMessage, ConversationSummary } from '@/types/chat';
import type { ArtifactWireDelta } from '@agiworkforce/services';

const SYNC_PATH = '/api/chat/sync';
const MEMORY_SYNC_PATH = '/api/memory/sync';
const PROJECTS_SYNC_PATH = '/api/projects/sync';
/** Safety bound on the pull pagination loop (each page is up to 500 rows). */
const PULL_PAGE_GUARD = 50;

// ── Delta wire shapes (snake_case from /api/chat/sync) ──────────────────────────

interface ConversationDelta {
  id: string;
  title: string;
  model: string | null;
  project_id: string | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_version: string;
}

interface MessageDelta {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model: string | null;
  provider: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_version: string;
}

interface PullResponse {
  conversations: ConversationDelta[];
  messages: MessageDelta[];
  artifacts: ArtifactWireDelta[];
  cursor: string;
  hasMore: boolean;
}

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

/** Compare two non-negative integer strings (bigint server_version) without precision loss. */
function bigintGreater(a: string, b: string): boolean {
  const na = a.replace(/^0+/, '') || '0';
  const nb = b.replace(/^0+/, '') || '0';
  if (na.length !== nb.length) return na.length > nb.length;
  return na > nb;
}

function maxCursor(base: string, ...versions: string[]): string {
  let max = base;
  for (const v of versions) if (v && bigintGreater(v, max)) max = v;
  return max;
}

// ── Apply pulled deltas into the cloud store ────────────────────────────────────

function applyConversationDeltas(deltas: ConversationDelta[]): void {
  const store = useChatCloudMessageStore.getState();
  const existing = new Map(store.conversations.map((c) => [c.id, c]));
  for (const d of deltas) {
    if (d.deleted_at) {
      store.removeCloudConversation(d.id);
      existing.delete(d.id);
      continue;
    }
    const summary: ConversationSummary = {
      id: d.id,
      title: d.title,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
      messageCount: existing.get(d.id)?.messageCount ?? 0,
      pinned: d.pinned,
      model: d.model ?? undefined,
      projectId: d.project_id ?? undefined,
      executionMode: 'cloud',
    };
    if (existing.has(d.id)) {
      store.patchCloudConversation(d.id, summary);
    } else {
      store.addCloudConversation(summary);
    }
    existing.set(d.id, summary);
  }
}

function applyMessageDeltas(deltas: MessageDelta[]): void {
  const store = useChatCloudMessageStore.getState();
  const byConv = new Map<string, MessageDelta[]>();
  for (const d of deltas) {
    const list = byConv.get(d.conversation_id) ?? [];
    list.push(d);
    byConv.set(d.conversation_id, list);
  }
  for (const [conversationId, convDeltas] of byConv) {
    const current = useChatCloudMessageStore.getState().messages[conversationId] ?? [];
    const merged = new Map(current.map((m) => [m.id, m]));
    for (const d of convDeltas) {
      if (d.deleted_at) {
        merged.delete(d.id);
        continue;
      }
      const existing = merged.get(d.id);
      merged.set(d.id, {
        ...(existing ?? {}),
        id: d.id,
        role: d.role,
        content: d.content,
        ...(d.model ? { model: d.model } : {}),
        ...(d.provider ? { provider: d.provider } : {}),
        createdAt: d.created_at,
      } as ChatMessage);
    }
    const ordered = Array.from(merged.values()).sort((a, b) => {
      const at = (a as { createdAt?: string }).createdAt ?? '';
      const bt = (b as { createdAt?: string }).createdAt ?? '';
      return at === bt ? a.id.localeCompare(b.id) : at.localeCompare(bt);
    });
    store.setCloudMessages(conversationId, ordered);
  }
}

// ── Pull ────────────────────────────────────────────────────────────────────────

async function pull(): Promise<void> {
  let cursor = useCloudSyncStateStore.getState().cursor;
  for (let page = 0; page < PULL_PAGE_GUARD; page += 1) {
    const res = await api.get<PullResponse>(`${SYNC_PATH}?since=${encodeURIComponent(cursor)}`);
    applyConversationDeltas(res.conversations ?? []);
    applyMessageDeltas(res.messages ?? []);
    // Artifacts (0039): mobile is a PULLER — apply pulled cloud artifacts via the shared
    // state-sync logic. Kept in a separate store slice; the gallery merges on render.
    useArtifactStore.getState().applyCloudArtifactDeltas(res.artifacts ?? []);
    // Trust the server's SAFE cursor. The two tables paginate independently and
    // share one version sequence, so taking the max of per-row server_versions
    // overshoots the lagging table's frontier and skips rows that fall in the gap
    // (the server now bounds the cursor to that frontier). Only ever move forward.
    cursor = maxCursor(cursor, res.cursor ?? '0');
    useCloudSyncStateStore.getState().setCursor(cursor);
    if (!res.hasMore) break;
  }
}

// ── Push ────────────────────────────────────────────────────────────────────────

interface PushMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model: string | null;
  provider: string | null;
  createdAt?: string;
}

interface PushResponse {
  applied: {
    conversations: Array<{ id: string; server_version: string }>;
    messages: Array<{ id: string; server_version: string }>;
  };
  cursor: string;
}

async function push(): Promise<void> {
  const { dirtyConversationIds, dirtyMessages } = useCloudSyncStateStore.getState();
  if (dirtyConversationIds.length === 0 && dirtyMessages.length === 0) return;

  const cloud = useChatCloudMessageStore.getState();
  const convById = new Map(cloud.conversations.map((c) => [c.id, c]));

  // Conversations are sent first (the server upserts them before messages, so a
  // new conversation's messages pass the ownership EXISTS check in one round-trip).
  const conversations = dirtyConversationIds
    .map((id) => convById.get(id))
    .filter((c): c is ConversationSummary => Boolean(c))
    .map((c) => ({
      id: c.id,
      title: c.title,
      model: c.model ?? null,
      projectId: c.projectId ?? null,
      pinned: c.pinned ?? false,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

  // Split message refs into buildable (a syncable local row exists) and dead (the
  // row vanished locally, or is a non-syncable 'tool' record). Dead refs are dropped
  // unconditionally; buildable refs are only cleared once the server ACKS them.
  const buildableRefs: DirtyMessageRef[] = [];
  const deadRefs: DirtyMessageRef[] = [];
  const messages: PushMessage[] = [];
  for (const ref of dirtyMessages) {
    const msg = (cloud.messages[ref.conversationId] ?? []).find((m) => m.id === ref.messageId);
    if (!msg || (msg.role !== 'user' && msg.role !== 'assistant' && msg.role !== 'system')) {
      deadRefs.push(ref);
      continue;
    }
    buildableRefs.push(ref);
    messages.push({
      id: msg.id,
      conversationId: ref.conversationId,
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      model: (msg as { model?: string }).model ?? null,
      provider: (msg as { provider?: string }).provider ?? null,
      createdAt: (msg as { createdAt?: string }).createdAt,
    });
  }

  let ackedMessageIds = new Set<string>();
  if (conversations.length > 0 || messages.length > 0) {
    const res = await api.post<PushResponse>(SYNC_PATH, { conversations, messages });
    ackedMessageIds = new Set((res?.applied?.messages ?? []).map((m) => m.id));
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

// ── Memory wire shapes (snake_case from /api/memory/sync) ─────────────────────

/** Shape returned by GET /api/memory/sync — server uses snake_case. */
interface MemoryPullItem {
  id: string;
  content: string;
  category: string | null;
  source: 'mobile' | 'desktop' | 'web' | 'auto';
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  server_version: string;
}

interface MemoryPullResponse {
  memories: MemoryPullItem[];
  cursor: string;
  hasMore: boolean;
}

/** Shape for POST /api/memory/sync — server expects camelCase. */
interface MemoryPushItem {
  id: string;
  content: string;
  category?: string | null;
  source?: string;
  isDeleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface MemoryPushResponse {
  applied: Array<{ id: string; server_version: string }>;
  cursor: string;
}

// ── Memory pull ────────────────────────────────────────────────────────────────

async function pullMemory(): Promise<void> {
  let cursor = useMemorySyncStateStore.getState().memoryCursor;
  for (let page = 0; page < PULL_PAGE_GUARD; page += 1) {
    const res = await api.get<MemoryPullResponse>(
      `${MEMORY_SYNC_PATH}?since=${encodeURIComponent(cursor)}`,
    );
    const memories = res.memories ?? [];
    if (memories.length > 0) {
      // Map wire snake_case → client camelCase, then apply to store.
      const deltas: CloudMemoryEntry[] = memories.map((m) => ({
        id: m.id,
        content: m.content,
        category: m.category,
        source: m.source,
        isDeleted: m.is_deleted,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
      }));
      useCloudMemoryStore.getState().applyCloudMemoryDeltas(deltas);
    }
    cursor = maxCursor(cursor, res.cursor ?? '0');
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
      isDeleted: entry.isDeleted,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    });
  }

  // Dead refs: clear immediately (nothing to push).
  const ackedIds = new Set<string>();
  if (payload.length > 0) {
    const res = await api.post<MemoryPushResponse>(MEMORY_SYNC_PATH, { memories: payload });
    for (const applied of res?.applied ?? []) {
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

// ── Project wire shapes (snake_case from /api/projects/sync) ──────────────────

/** Shape returned by GET /api/projects/sync — server uses snake_case. */
interface ProjectPullItem {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  color: string | null;
  is_archived: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  /** Non-null = tombstone row. */
  deleted_at: string | null;
  server_version: string;
}

interface ProjectPullResponse {
  projects: ProjectPullItem[];
  cursor: string;
  hasMore: boolean;
}

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

interface ProjectPushResponse {
  applied: Array<{ id: string; server_version: string }>;
  cursor: string;
}

// ── Project pull ───────────────────────────────────────────────────────────────

async function pullProjects(): Promise<void> {
  let cursor = useProjectSyncStateStore.getState().projectCursor;
  for (let page = 0; page < PULL_PAGE_GUARD; page += 1) {
    const res = await api.get<ProjectPullResponse>(
      `${PROJECTS_SYNC_PATH}?since=${encodeURIComponent(cursor)}`,
    );
    const items = res.projects ?? [];
    if (items.length > 0) {
      // Map wire snake_case → client camelCase, then apply to store.
      const deltas: CloudProject[] = items.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        instructions: p.instructions,
        color: p.color,
        isArchived: p.is_archived,
        metadata: p.metadata,
        // Pulled rows may come from any surface; use 'web' as the fallback source
        // since the wire format does not include a source field.
        source: 'web' as const,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        deletedAt: p.deleted_at,
      }));
      useCloudProjectStore.getState().applyCloudProjectDeltas(deltas);
    }
    cursor = maxCursor(cursor, res.cursor ?? '0');
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
    const res = await api.post<ProjectPushResponse>(PROJECTS_SYNC_PATH, { projects: payload });
    for (const applied of res?.applied ?? []) {
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

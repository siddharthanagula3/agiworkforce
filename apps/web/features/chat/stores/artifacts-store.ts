'use client';

import { useStore } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { create } from 'zustand';
import {
  applyArtifactDeltas as applySharedArtifactDeltas,
  createArtifactStore,
  mergeCloudArtifacts,
  type CloudArtifact,
} from '@agiworkforce/artifacts';
import type { ArtifactWireDelta } from '@agiworkforce/cloud-contracts';
import type { SharedArtifact } from '@agiworkforce/types';
import type { ArtifactData } from '../components/artifacts/ArtifactPreview';
import { logger } from '@shared/lib/logger';
import { useChatStore } from '@shared/stores/web-chat-store';

// ============================================================================
// Shared vanilla store engine (Step 1b)
//
// _sharedArtifactStore is the canonical engine for:
//   - artifacts collection (SharedArtifact[])
//   - versionsById (content-keyed auto-versioning)
//   - selectedArtifactId
//   - panelOpen
//
// Components read these from _sharedArtifactStore via useArtifactsStore()
// (which delegates to the shared store). This is the "backed by" requirement:
// the shared store IS the source, not a shadow copy.
//
// Web's side-map (_webSideMap) holds fields that don't live on SharedArtifact:
//   versions[], currentVersion, computeSession, generatedFile, artifactManifest,
//   shareId. These are web-only extras that accompany an artifact but have no
//   cross-surface representation.
//
// Persistence: web wraps the shared store with zustand-persist via a thin
// "web persistence store" that serializes the shared store's state to
// localStorage under 'agi-artifacts-store', preserving the v2 migration.
// ============================================================================

/**
 * AUDIT-FIX ART-20: hard cap on retained artifacts.
 *
 * `createArtifactStore` has always supported `maxArtifacts` (it is how mobile
 * caps its MMKV store) and web constructed it with NO options — so every
 * artifact ever derived, in every conversation, accumulated forever in
 * localStorage. The engine drops the OLDEST artifact (with its version history)
 * once the cap is passed, which bounds both memory and the persisted payload.
 */
const MAX_RETAINED_ARTIFACTS = 200;

/** @internal The shared vanilla store: the live engine for collection + UI state. */
export const _sharedArtifactStore = createArtifactStore({
  maxArtifacts: MAX_RETAINED_ARTIFACTS,
});

// ============================================================================
// ArtifactData ↔ SharedArtifact mapping
//
// LOSSINESS REPORT (named gaps, not silent data loss):
//
//   Web-side only (NOT in SharedArtifact — kept in side-map or derived):
//     - computeSession / generatedFile / artifactManifest — web generated-file
//       manifest types. Kept in side-map; NOT stashed in metadata to avoid
//       untyped round-trip risk. Web components access them from the side-map.
//     - createdAt: web uses Date object; SharedArtifact uses ISO string.
//       Derived on read via `new Date(shared.createdAt)`.
//     - messageId — SharedArtifact has an optional messageId; web Artifact has
//       a required messageId. Stored on SharedArtifact.messageId (optional);
//       defaults to '' on the web Artifact view when absent.
// ============================================================================

/**
 * Web-specific fields not on SharedArtifact, keyed by artifact id.
 *
 * AUDIT-FIX ART-21: `versions` / `currentVersion` / `shareId` were removed with
 * their only writers (`addVersion`, `setCurrentVersion`, `shareArtifact` — all
 * dead code with no non-test callers). Real edit history lives in the shared
 * engine's content-keyed `versionsById` and is read via `getArtifactVersions`.
 */
interface WebSideEntry {
  computeSession?: ArtifactData['computeSession'];
  generatedFile?: ArtifactData['generatedFile'];
  artifactManifest?: ArtifactData['artifactManifest'];
}

// ============================================================================
// Types
// ============================================================================

export interface Artifact extends ArtifactData {
  id: string;
  title: string;
  language: string;
  content: string;
  messageId: string;
  /**
   * The conversation that produced this artifact.
   * Used to scope the Artifacts panel to the active conversation so artifacts
   * do not leak across chats. Artifacts without a conversationId are treated
   * as orphaned and are hidden from every panel.
   */
  conversationId?: string;
  createdAt: Date;
}

type ArtifactInput = Omit<Artifact, 'createdAt'> & { createdAt?: Date };

// ============================================================================
// Side-map (module-level: survives re-renders, reset with clearAll)
// ============================================================================

let _sideMap: Record<string, WebSideEntry> = {};
let _cloudArtifacts: CloudArtifact[] = [];
let _cloudSyncStatus: 'idle' | 'syncing' | 'synced' | 'error' = 'idle';
let _cloudSyncError: string | null = null;

function getSideEntry(id: string): WebSideEntry {
  return _sideMap[id] ?? {};
}

function setSideEntry(id: string, patch: Partial<WebSideEntry>): void {
  _sideMap[id] = { ...getSideEntry(id), ...patch };
}

function deleteSideEntry(id: string): void {
  delete _sideMap[id];
}

function clearSideMap(): void {
  _sideMap = {};
}

function mergedArtifacts(): SharedArtifact[] {
  return mergeCloudArtifacts(_sharedArtifactStore.getState().artifacts, _cloudArtifacts);
}

function notifyArtifactSubscribers(): void {
  _sharedArtifactStore.setState((state) => ({ ...state }));
}

// ============================================================================
// Conversion helpers
// ============================================================================

/**
 * Convert a SharedArtifact + side-map entry into the web Artifact view type.
 * This is the read boundary: components see Artifact; the engine stores SharedArtifact.
 */
function toArtifact(shared: SharedArtifact): Artifact {
  const side = getSideEntry(shared.id);
  return {
    id: shared.id,
    type: shared.type as ArtifactData['type'],
    title: shared.title || 'Untitled',
    language: shared.language ?? (shared.type as string),
    content: shared.content,
    messageId: shared.messageId ?? '',
    conversationId: shared.conversationId,
    createdAt: typeof shared.createdAt === 'string' ? new Date(shared.createdAt) : new Date(),
    // Side-map fields
    computeSession: side.computeSession,
    generatedFile: side.generatedFile,
    artifactManifest: side.artifactManifest,
  };
}

/**
 * Convert a web ArtifactInput into a SharedArtifact for the engine.
 * This is the write boundary.
 */
function toSharedArtifact(
  artifact: ArtifactInput & { createdAt?: Date },
  existingVersion = 1,
): SharedArtifact {
  return {
    id: artifact.id,
    type: artifact.type,
    title: artifact.title || 'Untitled',
    content: artifact.content,
    language: artifact.language || undefined,
    version: existingVersion,
    createdAt: artifact.createdAt ? artifact.createdAt.toISOString() : new Date().toISOString(),
    conversationId: artifact.conversationId,
    messageId: artifact.messageId || undefined,
  };
}

// ============================================================================
// Helpers
//
// AUDIT-FIX ART-21: the forked `parseCodeBlocks` / `languageLabel` /
// `extractFilename` / `artifactTypeForLanguage` quartet lived here and directly
// contradicted this module's own contract ("do NOT reimplement derivation
// here"). It was a second, drifting implementation of the canonical derivation
// in @agiworkforce/artifacts (`deriveArtifactsFromMessage` and friends) — same
// job, different fence handling, different type mapping, different titles — and
// its only entry point, `extractArtifactsFromContent`, had no non-test callers.
// Deleted rather than re-synced: one derivation, in the package that owns it.
// ============================================================================

function normalizeInput(
  artifact: Omit<Artifact, 'createdAt'> & { createdAt?: Date },
): ArtifactInput & { createdAt: Date } {
  return {
    ...artifact,
    title: artifact.title || 'Untitled',
    language: artifact.language || artifact.type,
    createdAt: artifact.createdAt ?? new Date(),
  };
}

/** Check if two artifacts differ in content/rendering fields (ignores conversationId). */
function artifactsContentEqual(a: ArtifactInput, b: ArtifactInput): boolean {
  return (
    a.title === b.title &&
    a.language === b.language &&
    a.type === b.type &&
    a.content === b.content &&
    a.messageId === b.messageId &&
    a.computeSession === b.computeSession &&
    a.generatedFile === b.generatedFile &&
    a.artifactManifest === b.artifactManifest
  );
}

// ============================================================================
// Persistence store
//
// A thin zustand store whose ONLY purpose is to serialize the shared store's
// collection to localStorage under 'agi-artifacts-store' v2, and rehydrate it
// on page load. No React bindings here — just a persist shell.
//
// Persisted shape: { artifacts, versionsById, selectedArtifactId }
// (panel open stays session-scoped and is deliberately not persisted)
// ============================================================================

interface PersistedShape {
  artifacts: SharedArtifact[];
  /**
   * AUDIT-FIX ART-19: full edit history per artifact id.
   *
   * `partialize` used to drop this, and `rehydrateSharedStore` re-`upsert`ed
   * each artifact one at a time — which seeds `versionsById[id] = [artifact]`.
   * So every reload silently rewrote an artifact's history to exactly one
   * version: the version chip disappeared, `getArtifactVersions` returned a
   * single entry, and every earlier draft the user could previously step back
   * to was gone. The history is real state and is now persisted with it.
   */
  versionsById: Record<string, SharedArtifact[]>;
  selectedArtifactId: string | null;
}

/**
 * Seed the shared store from a persisted shape (called on rehydration).
 *
 * AUDIT-FIX ART-19: writes the collection AND its version history in one
 * `setState` instead of replaying `upsertArtifact` per artifact, because that
 * replay is exactly what destroyed the history.
 */
function rehydrateSharedStore(shape: PersistedShape): void {
  _sharedArtifactStore.getState().clearAll();
  clearSideMap();
  const artifacts = Array.isArray(shape.artifacts) ? shape.artifacts : [];
  const versionsById: Record<string, SharedArtifact[]> = {};
  for (const artifact of artifacts) {
    const persistedVersions = shape.versionsById?.[artifact.id];
    versionsById[artifact.id] =
      Array.isArray(persistedVersions) && persistedVersions.length > 0
        ? persistedVersions
        : [artifact];
  }
  _sharedArtifactStore.setState({ artifacts, versionsById });
  if (shape.selectedArtifactId && artifacts.some((a) => a.id === shape.selectedArtifactId)) {
    _sharedArtifactStore.getState().selectArtifact(shape.selectedArtifactId);
  }
}

/** Build the persist payload from the current shared store state. */
function buildPersistedShape(): PersistedShape {
  const { artifacts, versionsById, selectedArtifactId } = _sharedArtifactStore.getState();
  return { artifacts, versionsById, selectedArtifactId };
}

/**
 * AUDIT-FIX ART-20: quota-aware localStorage adapter.
 *
 * Artifacts are the single largest thing this app writes to localStorage, and
 * the write had no error handling at all: one `QuotaExceededError` (5-10MB, and
 * this store shared it with the chat transcript store) made zustand-persist
 * throw inside its subscriber, and from then on NOTHING was persisted — no
 * artifacts, no history, no warning, for the rest of the session and every
 * session after. Reloading looked like "my artifacts vanished".
 *
 * On failure we drop the oldest half of the payload (oldest artifacts are the
 * least likely to be wanted, and they are what the `maxArtifacts` cap evicts
 * too) and retry, up to a few rounds. If even a minimal payload will not fit,
 * we record it so the UI can say persistence is degraded rather than lie.
 */
let _persistDegraded = false;

/** True when the last persist write could not be completed. */
export function isArtifactPersistenceDegraded(): boolean {
  return _persistDegraded;
}

/** Drop the oldest half of a serialized payload's artifacts. Returns null when nothing is left to drop. */
function shrinkPersistedPayload(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as { state?: Partial<PersistedShape> };
    const artifacts = parsed.state?.artifacts;
    if (!Array.isArray(artifacts) || artifacts.length === 0) return null;
    const keep = artifacts.slice(Math.ceil(artifacts.length / 2));
    if (keep.length === artifacts.length) return null;
    const keptIds = new Set(keep.map((a) => a.id));
    const versionsById: Record<string, SharedArtifact[]> = {};
    for (const [id, versions] of Object.entries(parsed.state?.versionsById ?? {})) {
      if (keptIds.has(id)) versionsById[id] = versions;
    }
    const selectedArtifactId = parsed.state?.selectedArtifactId ?? null;
    return JSON.stringify({
      ...parsed,
      state: {
        ...parsed.state,
        artifacts: keep,
        versionsById,
        selectedArtifactId: keptIds.has(selectedArtifactId ?? '') ? selectedArtifactId : null,
      },
    });
  } catch {
    return null;
  }
}

const quotaAwareArtifactStorage = {
  getItem: (name: string): string | null => localStorage.getItem(name),
  removeItem: (name: string): void => localStorage.removeItem(name),
  setItem: (name: string, value: string): void => {
    let payload: string | null = value;
    for (let attempt = 0; attempt < 4 && payload !== null; attempt++) {
      try {
        localStorage.setItem(name, payload);
        if (_persistDegraded) {
          _persistDegraded = false;
          notifyArtifactSubscribers();
        }
        return;
      } catch (error) {
        if (attempt === 0) {
          logger.warn('Artifact persistence write failed; shrinking payload', error);
        }
        payload = shrinkPersistedPayload(payload);
      }
    }
    // Every retry failed — surface it instead of silently losing persistence.
    if (!_persistDegraded) {
      _persistDegraded = true;
      logger.error('Artifact persistence disabled: browser storage quota exhausted');
      notifyArtifactSubscribers();
    }
  },
};

// The persist store: never rendered directly. Its state is always kept in sync
// with the shared store so persist can serialize it.
const _persistStore = create<PersistedShape>()(
  persist(() => buildPersistedShape(), {
    name: 'agi-artifacts-store',
    // AUDIT-FIX ART-19: v3 adds `versionsById` to the persisted payload.
    version: 3,
    storage: createJSONStorage(() => quotaAwareArtifactStorage),
    migrate: (persisted, fromVersion) => {
      if (fromVersion < 2) {
        const s = persisted as Partial<PersistedShape>;
        return { ...s, artifacts: [], versionsById: {}, selectedArtifactId: null };
      }
      if (fromVersion < 3) {
        // v2 payloads carry artifacts but no history. Seed each artifact's
        // history with the version we have rather than inventing one.
        const s = persisted as Partial<PersistedShape>;
        const artifacts = Array.isArray(s.artifacts) ? s.artifacts : [];
        const versionsById: Record<string, SharedArtifact[]> = {};
        for (const artifact of artifacts) versionsById[artifact.id] = [artifact];
        return { ...s, artifacts, versionsById, selectedArtifactId: s.selectedArtifactId ?? null };
      }
      return persisted as PersistedShape;
    },
    // Only persist collection + history + selection; panel open is session-scoped
    partialize: (state) => ({
      artifacts: state.artifacts,
      versionsById: state.versionsById,
      selectedArtifactId: state.selectedArtifactId,
    }),
    onRehydrateStorage: () => (state) => {
      if (!state) return;
      // Coerce ISO strings to Date objects in createdAt for any legacy entries
      // (shared store uses strings, so nothing to coerce here, but keep the
      // guard for forward compatibility).
      rehydrateSharedStore(state);
    },
  }),
);

/** Flush the current shared store state into the persist store so it can be serialized. */
function flushToPersist(): void {
  _persistStore.setState(buildPersistedShape());
}

// Subscribe the persist store to the shared store so every mutation is saved.
_sharedArtifactStore.subscribe(() => {
  flushToPersist();
});

// ============================================================================
// Public store interface
//
// useArtifactsStore is the public API. It reads from _sharedArtifactStore for
// the canonical state (artifacts, selectedArtifactId, panelOpen) and exposes
// the full web Artifact view type to components. Mutations write into the
// shared store; web-only overlays (auto-select, conversationId backfill,
// removeArtifact fallback, clearArtifacts panel-close) execute at this layer.
// ============================================================================

type ArtifactsStoreReturn = {
  // State (derived from _sharedArtifactStore + side-map)
  artifacts: Artifact[];
  selectedArtifactId: string | null;
  panelOpen: boolean;
  cloudSyncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  cloudSyncError: string | null;
  /**
   * AUDIT-FIX ART-20: true when the last localStorage write could not be
   * completed (quota exhausted even after pruning). Surfaced in the panel so
   * "my artifacts disappeared after a reload" is an explained state, not a
   * mystery.
   */
  persistenceDegraded: boolean;

  // Actions
  addArtifact: (artifact: Omit<Artifact, 'createdAt'> & { createdAt?: Date }) => string;
  addArtifactForMessage: (
    messageId: string,
    artifact: ArtifactData,
    conversationId?: string,
  ) => void;
  upsertArtifact: (artifact: ArtifactInput) => void;
  removeArtifact: (id: string) => void;
  selectArtifact: (id: string | null) => void;
  togglePanel: () => void;
  setPanelOpen: (open: boolean) => void;
  clearArtifacts: () => void;
  clearArtifactsForMessage: (messageId: string) => void;
  /** AUDIT-FIX ART-20: drop every artifact belonging to a deleted conversation. */
  clearArtifactsForConversation: (conversationId: string) => void;
  getMessageArtifacts: (messageId: string) => Artifact[];
  getConversationArtifacts: (conversationId: string) => Artifact[];
  /**
   * Real edit history for an artifact, sourced from the shared store's
   * content-keyed auto-versioning (`versionsById`). Each content-changing
   * re-upsert of the same artifact id appends a version. Returns [] for
   * single-version artifacts. Ordered oldest → newest.
   */
  getArtifactVersions: (id: string) => SharedArtifact[];
  /**
   * Restore an earlier version by re-upserting its content.
   *
   * Version browsing shipped read-only on web: a user could page back through
   * history and then had no way to act on what they found. Desktop already had
   * rollback (`ArtifactVersionHistory`).
   *
   * Restoring APPENDS rather than rewinds, because versions here are
   * content-keyed — re-upserting older content records it as the new latest and
   * leaves the intervening versions intact. Destroying history to undo one
   * change would be the more surprising behavior.
   *
   * Returns false when the index does not exist or already matches current
   * content, so the caller can skip a pointless write.
   */
  restoreArtifactVersion: (id: string, versionIndex: number) => boolean;
  applyCloudArtifactDeltas: (deltas: ReadonlyArray<ArtifactWireDelta>) => void;
  clearCloudArtifacts: () => void;
  setCloudSyncStatus: (
    status: 'idle' | 'syncing' | 'synced' | 'error',
    error?: string | null,
  ) => void;
  reset: () => void;
};

// ============================================================================
// Actions (operate directly on _sharedArtifactStore and _sideMap)
// ============================================================================

const actions = {
  addArtifact(artifact: Omit<Artifact, 'createdAt'> & { createdAt?: Date }): string {
    const id = artifact.id || crypto.randomUUID();
    const normalized = normalizeInput({ ...artifact, id });
    // Stash web-only fields in side-map
    setSideEntry(id, {
      computeSession: normalized.computeSession,
      generatedFile: normalized.generatedFile,
      artifactManifest: normalized.artifactManifest,
    });
    _sharedArtifactStore.getState().upsertArtifact(toSharedArtifact(normalized));
    // Auto-select: if nothing is selected, select this artifact
    if (!_sharedArtifactStore.getState().selectedArtifactId) {
      _sharedArtifactStore.getState().selectArtifact(id);
    }
    return id;
  },

  upsertArtifact(artifact: ArtifactInput): void {
    const normalized = normalizeInput(artifact);
    const engine = _sharedArtifactStore.getState();
    const existing = engine.artifacts.find((a) => a.id === normalized.id);

    if (!existing) {
      // New artifact: insert
      setSideEntry(normalized.id, {
        computeSession: normalized.computeSession,
        generatedFile: normalized.generatedFile,
        artifactManifest: normalized.artifactManifest,
      });
      engine.upsertArtifact(toSharedArtifact(normalized));
      // Auto-select
      if (!engine.selectedArtifactId) {
        _sharedArtifactStore.getState().selectArtifact(normalized.id);
      }
      return;
    }

    // Backfill/repair conversationId: adopt a newly-known id but never
    // clobber a good id with undefined.
    const nextConversationId = normalized.conversationId ?? existing.conversationId;
    const conversationChanged = nextConversationId !== existing.conversationId;
    const side = getSideEntry(existing.id);
    const existingAsInput: ArtifactInput = {
      id: existing.id,
      type: existing.type as ArtifactData['type'],
      title: existing.title,
      language: existing.language ?? existing.type,
      content: existing.content,
      messageId: existing.messageId ?? '',
      conversationId: existing.conversationId,
      computeSession: side.computeSession,
      generatedFile: side.generatedFile,
      artifactManifest: side.artifactManifest,
    };
    const contentChanged = !artifactsContentEqual(normalized, existingAsInput);

    if (contentChanged) {
      // Full update: new content — let the shared store handle versioning
      setSideEntry(normalized.id, {
        computeSession: normalized.computeSession,
        generatedFile: normalized.generatedFile,
        artifactManifest: normalized.artifactManifest,
      });
      _sharedArtifactStore
        .getState()
        .upsertArtifact(toSharedArtifact({ ...normalized, conversationId: nextConversationId }));
    } else if (conversationChanged) {
      // Metadata-only patch (conversationId backfill): shared upsertArtifact
      // is idempotent on content-equal, so patch the collection directly.
      _sharedArtifactStore.setState((s) => ({
        artifacts: s.artifacts.map((a) =>
          a.id === normalized.id ? { ...a, conversationId: nextConversationId } : a,
        ),
      }));
    }
    // else: identical content + no metadata change = no-op (idempotent)
  },

  removeArtifact(id: string): void {
    const engine = _sharedArtifactStore.getState();
    engine.removeArtifact(id);
    deleteSideEntry(id);
    // Fallback selection: if removed id was selected, select artifacts[0] or null
    const remaining = _sharedArtifactStore.getState().artifacts;
    if (!remaining.some((a) => a.id === _sharedArtifactStore.getState().selectedArtifactId)) {
      _sharedArtifactStore.getState().selectArtifact(remaining[0]?.id ?? null);
    }
    // Close panel when no artifacts remain
    if (remaining.length === 0) {
      _sharedArtifactStore.getState().setPanelOpen(false);
    }
  },

  selectArtifact(id: string | null): void {
    _sharedArtifactStore.getState().selectArtifact(id);
  },

  togglePanel(): void {
    _sharedArtifactStore.getState().togglePanel();
  },

  setPanelOpen(open: boolean): void {
    _sharedArtifactStore.getState().setPanelOpen(open);
  },

  clearArtifacts(): void {
    _sharedArtifactStore.getState().clearAll();
    clearSideMap();
    _cloudArtifacts = [];
    _cloudSyncStatus = 'idle';
    _cloudSyncError = null;
  },

  addArtifactForMessage(messageId: string, artifact: ArtifactData, conversationId?: string): void {
    const existing = _sharedArtifactStore.getState().artifacts;
    if (existing.some((a) => a.id === artifact.id)) return;

    const normalized = normalizeInput({
      ...artifact,
      messageId,
      conversationId,
      title: artifact.title || 'Untitled',
      language: artifact.language || artifact.type,
    });
    setSideEntry(normalized.id, {
      computeSession: normalized.computeSession,
      generatedFile: normalized.generatedFile,
      artifactManifest: normalized.artifactManifest,
    });
    _sharedArtifactStore.getState().upsertArtifact(toSharedArtifact(normalized));
    if (!_sharedArtifactStore.getState().selectedArtifactId) {
      _sharedArtifactStore.getState().selectArtifact(normalized.id);
    }
  },

  getMessageArtifacts(messageId: string): Artifact[] {
    return mergedArtifacts()
      .filter((artifact) => artifact.messageId === messageId)
      .map(toArtifact);
  },

  getConversationArtifacts(conversationId: string): Artifact[] {
    return mergedArtifacts()
      .filter((artifact) => artifact.conversationId === conversationId)
      .map(toArtifact);
  },

  getArtifactVersions(id: string): SharedArtifact[] {
    return _sharedArtifactStore.getState().getArtifactVersions(id);
  },

  restoreArtifactVersion(id: string, versionIndex: number): boolean {
    const versions = _sharedArtifactStore.getState().getArtifactVersions(id);
    const target = versions[versionIndex];
    if (!target) return false;

    const current = _sharedArtifactStore.getState().artifacts.find((a) => a.id === id);
    if (!current || current.content === target.content) return false;

    // Go through the shared engine directly: its artifact type is wider than
    // the web `ArtifactInput` (e.g. 'component'), and narrowing here would
    // silently drop kinds this store legitimately holds.
    _sharedArtifactStore.getState().upsertArtifact({ ...current, content: target.content });
    return true;
  },

  clearArtifactsForMessage(messageId: string): void {
    const toRemove = _sharedArtifactStore
      .getState()
      .artifacts.filter((a) => a.messageId === messageId)
      .map((a) => a.id);

    _sharedArtifactStore.setState((s) => {
      const versionsById = { ...s.versionsById };
      for (const id of toRemove) delete versionsById[id];
      return {
        artifacts: s.artifacts.filter((a) => a.messageId !== messageId),
        versionsById,
      };
    });
    for (const id of toRemove) deleteSideEntry(id);
    // Repair selection + close panel
    const remaining = _sharedArtifactStore.getState().artifacts;
    if (!remaining.some((a) => a.id === _sharedArtifactStore.getState().selectedArtifactId)) {
      _sharedArtifactStore.getState().selectArtifact(remaining[0]?.id ?? null);
    }
    if (remaining.length === 0) {
      _sharedArtifactStore.getState().setPanelOpen(false);
    }
  },

  /**
   * AUDIT-FIX ART-20: drop a conversation's artifacts (and their history and
   * side-map entries) when the conversation itself goes away.
   *
   * `clearConversation` existed on the shared engine and had zero callers, so a
   * deleted chat's artifacts stayed in localStorage forever — and, because
   * `selectedArtifactId` is global, they could still be selected and rendered
   * from another chat.
   */
  clearArtifactsForConversation(conversationId: string): void {
    const doomed = _sharedArtifactStore
      .getState()
      .artifacts.filter((a) => a.conversationId === conversationId)
      .map((a) => a.id);
    if (doomed.length === 0) return;

    _sharedArtifactStore.getState().clearConversation(conversationId);
    for (const id of doomed) deleteSideEntry(id);
    _cloudArtifacts = _cloudArtifacts.filter((a) => a.conversationId !== conversationId);

    const remaining = _sharedArtifactStore.getState().artifacts;
    if (!remaining.some((a) => a.id === _sharedArtifactStore.getState().selectedArtifactId)) {
      _sharedArtifactStore.getState().selectArtifact(remaining[0]?.id ?? null);
    }
    if (remaining.length === 0) {
      _sharedArtifactStore.getState().setPanelOpen(false);
    }
  },

  applyCloudArtifactDeltas(deltas: ReadonlyArray<ArtifactWireDelta>): void {
    _cloudArtifacts = applySharedArtifactDeltas(_cloudArtifacts, deltas);

    const visibleArtifacts = mergedArtifacts();
    const selectedArtifactId = _sharedArtifactStore.getState().selectedArtifactId;
    if (
      selectedArtifactId &&
      !visibleArtifacts.some((artifact) => artifact.id === selectedArtifactId)
    ) {
      _sharedArtifactStore.getState().selectArtifact(visibleArtifacts[0]?.id ?? null);
    } else {
      notifyArtifactSubscribers();
    }
  },

  clearCloudArtifacts(): void {
    if (_cloudArtifacts.length === 0 && _cloudSyncStatus === 'idle' && !_cloudSyncError) return;
    _cloudArtifacts = [];
    _cloudSyncStatus = 'idle';
    _cloudSyncError = null;
    notifyArtifactSubscribers();
  },

  setCloudSyncStatus(
    status: 'idle' | 'syncing' | 'synced' | 'error',
    error: string | null = null,
  ): void {
    _cloudSyncStatus = status;
    _cloudSyncError = error;
    notifyArtifactSubscribers();
  },

  reset(): void {
    _sharedArtifactStore.getState().clearAll();
    clearSideMap();
    _cloudArtifacts = [];
    _cloudSyncStatus = 'idle';
    _cloudSyncError = null;
  },
};

// ============================================================================
// useArtifactsStore
//
// This hook returns the full ArtifactsStoreReturn, reading collection +
// selection + panel state from _sharedArtifactStore (the engine), and
// exposing Artifact[] derived via toArtifact() + side-map.
//
// It is NOT a zustand `create()` store — it uses `useStore` from zustand
// to subscribe to the shared vanilla store. This ensures React re-renders
// whenever the shared store changes, and components always read from the
// canonical engine.
//
// The selector-based form (useArtifactsStore(sel)) is supported via the
// standard useStore(store, selector) overload.
// ============================================================================

type Selector<T> = (state: ArtifactsStoreReturn) => T;

function buildStoreSlice(): ArtifactsStoreReturn {
  const {
    artifacts: sharedArtifacts,
    selectedArtifactId,
    panelOpen,
  } = _sharedArtifactStore.getState();
  return {
    artifacts: mergeCloudArtifacts(sharedArtifacts, _cloudArtifacts).map(toArtifact),
    selectedArtifactId,
    panelOpen,
    cloudSyncStatus: _cloudSyncStatus,
    cloudSyncError: _cloudSyncError,
    // AUDIT-FIX ART-20: read at build time so a failed write re-renders the UI.
    persistenceDegraded: _persistDegraded,
    ...actions,
  };
}

/**
 * Primary hook for the artifact store. Reads from _sharedArtifactStore (the engine).
 *
 * Usage:
 *   // Select all state
 *   const { artifacts, selectedArtifactId } = useArtifactsStore();
 *
 *   // Selector form (avoids full re-renders)
 *   const artifacts = useArtifactsStore(s => s.artifacts);
 */
export function useArtifactsStore<T = ArtifactsStoreReturn>(selector?: Selector<T>): T {
  // Subscribe to the shared vanilla store; re-render on every change. sharedState
  // establishes the subscription; buildStoreSlice reads getState() directly.
  const sharedState = useStore(_sharedArtifactStore);
  void sharedState;
  const slice = buildStoreSlice();
  if (selector) return selector(slice);
  return slice as T;
}

// ============================================================================
// AUDIT-FIX ART-20: lifecycle cleanup, reconciled against the chat store.
//
// `removeArtifact`, `clearArtifacts`, `clearArtifactsForMessage` and the
// engine's `clearConversation` all existed with ZERO non-test callers. Nothing
// ever deleted an artifact: deleting a conversation left its artifacts in
// localStorage forever, and regenerating an assistant message left the previous
// answer's artifacts sitting in the panel next to the new ones, both claiming
// to belong to the current chat.
//
// Wiring this at the call sites would mean editing the conversation-delete
// action and every regenerate handler (other modules), and would break again
// the next time someone adds a third way to remove a message. Subscribing to
// the chat store instead makes the artifact collection follow what still
// exists, whichever code path did the removing.
//
// BOTH rules are deliberately conservative, because the failure mode of an
// over-eager rule is destroying a user's artifacts:
//
//   1. Conversation deleted. The trigger is NOT "absent from `conversations`" —
//      that list is PAGINATED (`useConversations` fetches a page at a time and
//      resets to page 1 on refetch), so an unpaged conversation is absent
//      without having been deleted. The precise signal is a conversation that
//      was in the list AND had a loaded transcript bucket, and now has neither:
//      `deleteConversation` is the only action that drops a real conversation's
//      bucket (`setActiveConversation(null)` only drops the pending-chat key,
//      which is never a real conversation id).
//   2. Message gone (deleted, or replaced by a regenerate). Only judged inside a
//      conversation whose transcript IS loaded — a chat that was never opened
//      this session has no messages in memory and must never be read as "every
//      message was deleted".
// ============================================================================

/** Conversation ids that `deleteConversation` just removed. */
function findDeletedConversationIds(
  previous: { conversations: { id: string }[]; messagesByConversation: Record<string, unknown> },
  next: { conversations: { id: string }[]; messagesByConversation: Record<string, unknown> },
): string[] {
  const nextIds = new Set(next.conversations.map((c) => c.id));
  return previous.conversations
    .map((c) => c.id)
    .filter(
      (id) =>
        !nextIds.has(id) &&
        previous.messagesByConversation[id] !== undefined &&
        next.messagesByConversation[id] === undefined,
    );
}

/** Drop artifacts whose message no longer exists in its LOADED transcript. */
function clearArtifactsForVanishedMessages(): void {
  const { messagesByConversation } = useChatStore.getState();
  const staleMessageIds = new Set<string>();
  for (const artifact of _sharedArtifactStore.getState().artifacts) {
    const { conversationId, messageId } = artifact;
    if (!conversationId || !messageId) continue;
    const loaded = messagesByConversation[conversationId];
    if (!loaded) continue; // transcript not in memory — cannot judge
    if (!loaded.some((message) => message.id === messageId)) staleMessageIds.add(messageId);
  }
  for (const messageId of staleMessageIds) actions.clearArtifactsForMessage(messageId);
}

/**
 * Cheap signature of "which conversations and messages exist".
 *
 * The chat store publishes a new state object on every streamed token, so the
 * subscriber must not walk the artifact collection each time. Message CONTENT
 * changes leave this signature untouched; only adding/removing a conversation
 * or a message moves it, which is exactly when rule 2 can have work to do.
 */
function chatLifecycleSignature(): string {
  const { conversations, messagesByConversation } = useChatStore.getState();
  let signature = `${conversations.length}`;
  for (const conversation of conversations) {
    signature += `|${conversation.id}:${messagesByConversation[conversation.id]?.length ?? -1}`;
  }
  return signature;
}

if (typeof window !== 'undefined') {
  let lastSignature = chatLifecycleSignature();
  useChatStore.subscribe((state, previous) => {
    // Rule 1 — conversations the user deleted.
    for (const conversationId of findDeletedConversationIds(previous, state)) {
      actions.clearArtifactsForConversation(conversationId);
    }

    // Rule 2 — messages that no longer exist (deletion / regeneration).
    const signature = chatLifecycleSignature();
    if (signature === lastSignature) return;
    lastSignature = signature;
    clearArtifactsForVanishedMessages();
  });
}

// Attach getState so non-hook consumers (tests, clearArtifacts in beforeEach) work.
useArtifactsStore.getState = (): ArtifactsStoreReturn => buildStoreSlice();

// Expose setState for testing compatibility (noop — direct mutations via actions)
useArtifactsStore.setState = (_partial: Partial<ArtifactsStoreReturn>): void => {
  // Intentionally a no-op; callers should use actions instead.
};

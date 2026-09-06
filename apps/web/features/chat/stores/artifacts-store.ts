'use client';

import { useStore } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { create } from 'zustand';
import {
  applyArtifactDeltas as applySharedArtifactDeltas,
  createArtifactStore,
  mergeCloudArtifacts,
  wireToCloudArtifact,
  type CloudArtifact,
} from '@agiworkforce/artifacts';
import {
  ArtifactSyncPushItemSchema,
  type ArtifactSyncPushItem,
  type ArtifactWireDelta,
  type ChatSyncPushResponse,
} from '@agiworkforce/cloud-contracts';
import type { SharedArtifact } from '@agiworkforce/types';
import type { ArtifactData } from '../components/artifacts/ArtifactPreview';
import { logger } from '@shared/lib/logger';
import { useChatStore } from '@shared/stores/web-chat-store';

const MAX_RETAINED_ARTIFACTS = 200;
const MAX_ARTIFACTS_PER_PUSH = 500;

/**
 * Below this width the panel is a full-screen overlay, so opening it for the
 * reader buries the transcript they were reading under a document they never
 * asked to see. The transcript's artifact card is the way in on a phone.
 */
export const ARTIFACT_PANEL_OVERLAY_QUERY = '(max-width: 639px)';

function isArtifactPanelOverlayViewport(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(ARTIFACT_PANEL_OVERLAY_QUERY).matches;
}

/** @internal The shared vanilla store: the live engine for collection + UI state. */
export const _sharedArtifactStore = createArtifactStore({
  maxArtifacts: MAX_RETAINED_ARTIFACTS,
});

/**
 * Id prefix for an artifact that is really a tool-generated FILE already stored
 * in `media_assets`. Such a row exists twice by nature, under `<assetId>` in
 * Library and `genfile-<assetId>` here, so anything listing artifacts
 * account-wide must skip it or the same file appears in two places under two
 * ids that can never dedupe.
 */
export const GENERATED_FILE_ARTIFACT_PREFIX = 'genfile-';

export function generatedFileArtifactId(assetId: string): string {
  return `${GENERATED_FILE_ARTIFACT_PREFIX}${assetId}`;
}

export function isGeneratedFileArtifactId(id: string): boolean {
  return id.startsWith(GENERATED_FILE_ARTIFACT_PREFIX);
}

interface WebSideEntry {
  computeSession?: ArtifactData['computeSession'];
  generatedFile?: ArtifactData['generatedFile'];
  artifactManifest?: ArtifactData['artifactManifest'];
}

export interface Artifact extends ArtifactData {
  id: string;
  title: string;
  language: string;
  content: string;
  messageId: string;
  conversationId?: string;
  createdAt: Date;
}

type ArtifactInput = Omit<Artifact, 'createdAt'> & { createdAt?: Date };

let _sideMap: Record<string, WebSideEntry> = {};
let _cloudArtifacts: CloudArtifact[] = [];
let _cloudSyncStatus: 'idle' | 'syncing' | 'synced' | 'error' = 'idle';
let _cloudSyncError: string | null = null;
let _inFlightPushById = new Map<string, CloudArtifact>();
let _rejectedPushContentById: Record<string, string> = {};

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
    computeSession: side.computeSession,
    generatedFile: side.generatedFile,
    artifactManifest: side.artifactManifest,
  };
}

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

function cloudCopyOf(id: string): CloudArtifact | undefined {
  return _cloudArtifacts.find((artifact) => artifact.id === id);
}

function cloudBaseVersion(cloud: CloudArtifact | undefined): string {
  const serverVersion = cloud?.metadata?.['serverVersion'];
  return typeof serverVersion === 'string' ? serverVersion : '0';
}

function revisedAt(artifact: { updatedAt?: string; createdAt?: string }, fallback: number): number {
  const parsed = Date.parse(artifact.updatedAt ?? artifact.createdAt ?? '');
  return Number.isNaN(parsed) ? fallback : parsed;
}

function supersedesCloudCopy(local: SharedArtifact, cloud: CloudArtifact): boolean {
  const sameContent =
    local.content === cloud.content &&
    local.title === cloud.title &&
    (local.language ?? null) === (cloud.language ?? null);
  if (sameContent) return false;
  return revisedAt(local, Number.POSITIVE_INFINITY) > revisedAt(cloud, 0);
}

function toArtifactPushItem(
  artifact: SharedArtifact,
  baseVersion: string,
): ArtifactSyncPushItem | null {
  const parsed = ArtifactSyncPushItemSchema.safeParse({
    id: artifact.id,
    conversationId: artifact.conversationId,
    messageId: artifact.messageId || null,
    title: artifact.title,
    artifactType: artifact.type,
    language: artifact.language ?? null,
    content: artifact.content,
    currentVersion: artifact.version && artifact.version > 0 ? artifact.version : 1,
    baseVersion,
  });
  return parsed.success ? parsed.data : null;
}

function recordCloudCopy(artifact: CloudArtifact): void {
  _cloudArtifacts = [..._cloudArtifacts.filter((a) => a.id !== artifact.id), artifact];
}

interface PersistedShape {
  artifacts: SharedArtifact[];
  versionsById: Record<string, SharedArtifact[]>;
  selectedArtifactId: string | null;
}

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

function buildPersistedShape(): PersistedShape {
  const { artifacts, versionsById, selectedArtifactId } = _sharedArtifactStore.getState();
  return { artifacts, versionsById, selectedArtifactId };
}

let _persistDegraded = false;

export function isArtifactPersistenceDegraded(): boolean {
  return _persistDegraded;
}

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
    if (!_persistDegraded) {
      _persistDegraded = true;
      logger.error('Artifact persistence disabled: browser storage quota exhausted');
      notifyArtifactSubscribers();
    }
  },
};

const _persistStore = create<PersistedShape>()(
  persist(() => buildPersistedShape(), {
    name: 'agi-artifacts-store',
    version: 3,
    storage: createJSONStorage(() => quotaAwareArtifactStorage),
    migrate: (persisted, fromVersion) => {
      if (fromVersion < 2) {
        const s = persisted as Partial<PersistedShape>;
        return { ...s, artifacts: [], versionsById: {}, selectedArtifactId: null };
      }
      if (fromVersion < 3) {
        const s = persisted as Partial<PersistedShape>;
        const artifacts = Array.isArray(s.artifacts) ? s.artifacts : [];
        const versionsById: Record<string, SharedArtifact[]> = {};
        for (const artifact of artifacts) versionsById[artifact.id] = [artifact];
        return { ...s, artifacts, versionsById, selectedArtifactId: s.selectedArtifactId ?? null };
      }
      return persisted as PersistedShape;
    },
    partialize: (state) => ({
      artifacts: state.artifacts,
      versionsById: state.versionsById,
      selectedArtifactId: state.selectedArtifactId,
    }),
    onRehydrateStorage: () => (state) => {
      if (!state) return;
      rehydrateSharedStore(state);
    },
  }),
);

function flushToPersist(): void {
  _persistStore.setState(buildPersistedShape());
}

_sharedArtifactStore.subscribe(() => {
  flushToPersist();
});

type ArtifactsStoreReturn = {
  artifacts: Artifact[];
  selectedArtifactId: string | null;
  panelOpen: boolean;
  cloudSyncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  cloudSyncError: string | null;
  persistenceDegraded: boolean;

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
  autoOpenPanel: () => void;
  clearArtifacts: () => void;
  clearArtifactsForMessage: (messageId: string) => void;
  clearArtifactsForConversation: (conversationId: string) => void;
  getMessageArtifacts: (messageId: string) => Artifact[];
  getConversationArtifacts: (conversationId: string) => Artifact[];
  getArtifactVersions: (id: string) => SharedArtifact[];
  restoreArtifactVersion: (id: string, versionIndex: number) => boolean;
  applyCloudArtifactDeltas: (deltas: ReadonlyArray<ArtifactWireDelta>) => void;
  collectArtifactPushBatch: () => ArtifactSyncPushItem[];
  applyArtifactPushResult: (result: ChatSyncPushResponse) => void;
  clearCloudArtifacts: () => void;
  setCloudSyncStatus: (
    status: 'idle' | 'syncing' | 'synced' | 'error',
    error?: string | null,
  ) => void;
  reset: () => void;
};

const actions = {
  addArtifact(artifact: Omit<Artifact, 'createdAt'> & { createdAt?: Date }): string {
    const id = artifact.id || crypto.randomUUID();
    const normalized = normalizeInput({ ...artifact, id });
    setSideEntry(id, {
      computeSession: normalized.computeSession,
      generatedFile: normalized.generatedFile,
      artifactManifest: normalized.artifactManifest,
    });
    _sharedArtifactStore.getState().upsertArtifact(toSharedArtifact(normalized));
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
      setSideEntry(normalized.id, {
        computeSession: normalized.computeSession,
        generatedFile: normalized.generatedFile,
        artifactManifest: normalized.artifactManifest,
      });
      engine.upsertArtifact(toSharedArtifact(normalized));
      if (!engine.selectedArtifactId) {
        _sharedArtifactStore.getState().selectArtifact(normalized.id);
      }
      return;
    }

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
      setSideEntry(normalized.id, {
        computeSession: normalized.computeSession,
        generatedFile: normalized.generatedFile,
        artifactManifest: normalized.artifactManifest,
      });
      _sharedArtifactStore
        .getState()
        .upsertArtifact(toSharedArtifact({ ...normalized, conversationId: nextConversationId }));
    } else if (conversationChanged) {
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
    const remaining = _sharedArtifactStore.getState().artifacts;
    if (!remaining.some((a) => a.id === _sharedArtifactStore.getState().selectedArtifactId)) {
      _sharedArtifactStore.getState().selectArtifact(remaining[0]?.id ?? null);
    }
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

  autoOpenPanel(): void {
    if (isArtifactPanelOverlayViewport()) return;
    _sharedArtifactStore.getState().setPanelOpen(true);
  },

  clearArtifacts(): void {
    _sharedArtifactStore.getState().clearAll();
    clearSideMap();
    _cloudArtifacts = [];
    _cloudSyncStatus = 'idle';
    _cloudSyncError = null;
    _inFlightPushById = new Map();
    _rejectedPushContentById = {};
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
    const remaining = _sharedArtifactStore.getState().artifacts;
    if (!remaining.some((a) => a.id === _sharedArtifactStore.getState().selectedArtifactId)) {
      _sharedArtifactStore.getState().selectArtifact(remaining[0]?.id ?? null);
    }
    if (remaining.length === 0) {
      _sharedArtifactStore.getState().setPanelOpen(false);
    }
  },

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

  collectArtifactPushBatch(): ArtifactSyncPushItem[] {
    const batch: ArtifactSyncPushItem[] = [];
    const snapshots = new Map<string, CloudArtifact>();

    for (const artifact of _sharedArtifactStore.getState().artifacts) {
      if (batch.length >= MAX_ARTIFACTS_PER_PUSH) break;
      if (_rejectedPushContentById[artifact.id] === artifact.content) continue;
      const cloud = cloudCopyOf(artifact.id);
      if (cloud?.deletedAt) continue;
      if (cloud && !supersedesCloudCopy(artifact, cloud)) continue;
      const item = toArtifactPushItem(artifact, cloudBaseVersion(cloud));
      if (!item) continue;
      batch.push(item);
      snapshots.set(artifact.id, { ...artifact });
    }

    _inFlightPushById = snapshots;
    return batch;
  },

  applyArtifactPushResult(result: ChatSyncPushResponse): void {
    for (const row of result.applied.artifacts) {
      const pushed = _inFlightPushById.get(row.id);
      if (!pushed) continue;
      recordCloudCopy({
        ...pushed,
        metadata: { ...pushed.metadata, serverVersion: row.server_version },
      });
      delete _rejectedPushContentById[row.id];
    }

    for (const conflict of result.conflicts.artifacts) {
      if (conflict.current) {
        recordCloudCopy(wireToCloudArtifact(conflict.current));
        continue;
      }
      const pushed = _inFlightPushById.get(conflict.id);
      if (pushed) _rejectedPushContentById[conflict.id] = pushed.content;
    }

    _inFlightPushById = new Map();
    notifyArtifactSubscribers();
  },

  clearCloudArtifacts(): void {
    _inFlightPushById = new Map();
    _rejectedPushContentById = {};
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
    _inFlightPushById = new Map();
    _rejectedPushContentById = {};
  },
};

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
    persistenceDegraded: _persistDegraded,
    ...actions,
  };
}

export function useArtifactsStore<T = ArtifactsStoreReturn>(selector?: Selector<T>): T {
  const sharedState = useStore(_sharedArtifactStore);
  void sharedState;
  const slice = buildStoreSlice();
  if (selector) return selector(slice);
  return slice as T;
}

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

function clearArtifactsForVanishedMessages(): void {
  const { messagesByConversation } = useChatStore.getState();
  const staleMessageIds = new Set<string>();
  for (const artifact of _sharedArtifactStore.getState().artifacts) {
    const { conversationId, messageId } = artifact;
    if (!conversationId || !messageId) continue;
    const loaded = messagesByConversation[conversationId];
    if (!loaded) continue;
    if (!loaded.some((message) => message.id === messageId)) staleMessageIds.add(messageId);
  }
  for (const messageId of staleMessageIds) actions.clearArtifactsForMessage(messageId);
}

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
    for (const conversationId of findDeletedConversationIds(previous, state)) {
      actions.clearArtifactsForConversation(conversationId);
    }

    const signature = chatLifecycleSignature();
    if (signature === lastSignature) return;
    lastSignature = signature;
    clearArtifactsForVanishedMessages();
  });
}

useArtifactsStore.getState = (): ArtifactsStoreReturn => buildStoreSlice();

useArtifactsStore.setState = (_partial: Partial<ArtifactsStoreReturn>): void => {
  // Intentionally a no-op; callers should use actions instead.
};

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import {
  computeDerivedArtifactId,
  deriveArtifacts,
  detectArtifactType,
  extractCodeBlocks,
  applyArtifactDeltas,
  mergeCloudArtifacts,
  legacyArtifactIdAdoptions,
  withoutTitleDirectives,
  EXPLICIT_ARTIFACT_MARKERS,
  EXPLICIT_ARTIFACT_MARKER_FOR,
} from '@agiworkforce/artifacts';
import { isUuidV7, uuidV7TimestampMs } from '@agiworkforce/utils';
import { offersMessageArtifact } from '@/stores/chat/derivedMessageArtifact';
import type { CloudArtifact, DerivedCodeBlock } from '@agiworkforce/artifacts';
import { ArtifactSyncPushItemSchema } from '@agiworkforce/cloud-contracts';
import type { ArtifactSyncPushItem, ArtifactWireDelta } from '@agiworkforce/cloud-contracts';
import type { SharedArtifact, SharedArtifactType } from '@agiworkforce/types';
import type { Artifact } from '@/types/chat';
import { agiNativeColors } from '@agiworkforce/design-tokens';
import { captureCloudAccountEpoch } from '@/src/features/auth/services/cloudAccountSession';
import type {
  MobileArtifact,
  MobileArtifactKind,
  MobileArtifactProvenance,
  ScopedMobileArtifact,
} from './types';
import { translatePlural } from '@/src/i18n/plural';
import { clearAccountScopedArtifactDrafts, discardArtifactDraft } from './artifactDrafts';
import { normalizedArtifactProvenance, normalizedCloudOwnerId } from './provenance';
import { artifactDisplayTitle, storedArtifactTitle, studyPreviewLines } from './artifactTitle';

const MAX_ARTIFACTS = 200;

interface LegacyIdAdoption {
  id: string;
  conversationId: string;
  messageId: string;
}

const legacyIdAdoptions = new Map<string, LegacyIdAdoption>();
const MAX_VERSIONS_PER_ARTIFACT = 20;
const ARTIFACT_STORE_VERSION = 4;

function isValidArtifactProvenance(value: unknown): value is MobileArtifactProvenance {
  return normalizedArtifactProvenance(value) !== null;
}

function isScopedMobileArtifact(value: unknown): value is ScopedMobileArtifact {
  if (!value || typeof value !== 'object') return false;
  return isValidArtifactProvenance((value as { provenance?: unknown }).provenance);
}

function requireArtifactProvenance(provenance: MobileArtifactProvenance): MobileArtifactProvenance {
  const normalized = normalizedArtifactProvenance(provenance);
  if (!normalized) {
    throw new Error('Artifact persistence requires Local scope or a non-empty Cloud owner id');
  }
  return normalized;
}

type VersionsById = Record<string, MobileArtifact[]>;

export type CloudLinkedMobileArtifact = ScopedMobileArtifact & {
  conversationId?: string;
  artifactType?: SharedArtifactType;
};

export interface PendingCloudArtifactPush {
  ownerId: string;
  item: ArtifactSyncPushItem;
}

type PendingCloudPushesById = Record<string, PendingCloudArtifactPush>;

function cloudLinkOf(artifact: MobileArtifact): {
  conversationId?: string;
  artifactType?: string;
} {
  const linked = artifact as Partial<CloudLinkedMobileArtifact>;
  return {
    conversationId: typeof linked.conversationId === 'string' ? linked.conversationId : undefined,
    artifactType: typeof linked.artifactType === 'string' ? linked.artifactType : undefined,
  };
}

function cloudServerVersion(cloud: CloudArtifact | undefined): string {
  const serverVersion = cloud?.metadata?.['serverVersion'];
  return typeof serverVersion === 'string' ? serverVersion : '0';
}

function ownedCloudRow(
  state: Pick<ArtifactStoreState, 'cloudArtifacts' | 'cloudArtifactsOwnerId'>,
  id: string,
  ownerId: string,
): CloudArtifact | undefined {
  if (state.cloudArtifactsOwnerId !== ownerId) return undefined;
  return state.cloudArtifacts.find((row) => row.id === id);
}

function cloudPushItemFor(
  state: Pick<ArtifactStoreState, 'cloudArtifacts' | 'cloudArtifactsOwnerId' | 'versionsById'>,
  artifact: MobileArtifact,
  ownerId: string,
): ArtifactSyncPushItem | null {
  const cloud = ownedCloudRow(state, artifact.id, ownerId);
  if (cloud?.deletedAt) return null;
  const link = cloudLinkOf(artifact);
  const pinned = cloud?.metadata?.['pinned'];
  const tags = cloud?.metadata?.['tags'];
  const parsed = ArtifactSyncPushItemSchema.safeParse({
    id: artifact.id,
    conversationId: cloud?.conversationId ?? link.conversationId,
    messageId: cloud?.messageId ?? artifact.messageId ?? null,
    title: artifact.title,
    artifactType: cloud?.type ?? link.artifactType ?? mobileToCanonicalArtifact(artifact).type,
    language: artifact.language ?? null,
    content: artifact.content,
    currentVersion: cloud
      ? Math.max(1, cloud.version) + 1
      : Math.max(1, state.versionsById[artifact.id]?.length ?? 1),
    ...(typeof pinned === 'boolean' ? { pinned } : {}),
    ...(Array.isArray(tags) && tags.every((tag) => typeof tag === 'string') ? { tags } : {}),
    baseVersion: cloudServerVersion(cloud),
  });
  return parsed.success ? parsed.data : null;
}

function withPendingCloudPush(
  pending: PendingCloudPushesById,
  state: Pick<
    ArtifactStoreState,
    'artifacts' | 'cloudArtifacts' | 'cloudArtifactsOwnerId' | 'versionsById'
  >,
  id: string,
  ownerId: string | null,
): PendingCloudPushesById {
  if (!ownerId) return pending;
  const artifact = state.artifacts.find((candidate) => candidate.id === id);
  if (
    !artifact ||
    !isScopedMobileArtifact(artifact) ||
    artifact.provenance.scope !== 'cloud' ||
    artifact.provenance.ownerId !== ownerId
  ) {
    return pending;
  }
  const item = cloudPushItemFor(state, artifact, ownerId);
  if (!item) return pending;
  return { ...pending, [id]: { ownerId, item } };
}

function withoutPendingPush(pending: PendingCloudPushesById, id: string): PendingCloudPushesById {
  if (!(id in pending)) return pending;
  const { [id]: _settled, ...rest } = pending;
  return rest;
}

function validPendingPushes(pending: unknown): PendingCloudPushesById {
  if (!pending || typeof pending !== 'object') return {};
  const kept: PendingCloudPushesById = {};
  for (const [id, entry] of Object.entries(pending as Record<string, unknown>)) {
    const candidate = entry as Partial<PendingCloudArtifactPush> | null;
    const ownerId = normalizedCloudOwnerId(candidate?.ownerId);
    if (!ownerId) continue;
    const parsed = ArtifactSyncPushItemSchema.safeParse(candidate?.item);
    if (parsed.success && parsed.data.id === id) kept[id] = { ownerId, item: parsed.data };
  }
  return kept;
}

function appendVersion(versions: MobileArtifact[], next: MobileArtifact): MobileArtifact[] {
  return [...versions, { ...next, savedAt: new Date().toISOString() }].slice(
    -MAX_VERSIONS_PER_ARTIFACT,
  );
}

function versionsForArtifacts(
  versionsById: VersionsById | undefined,
  artifacts: ReadonlyArray<MobileArtifact>,
): VersionsById {
  const kept: VersionsById = {};
  for (const artifact of artifacts) {
    const versions = versionsById?.[artifact.id];
    kept[artifact.id] =
      Array.isArray(versions) && versions.length > 0
        ? versions.slice(-MAX_VERSIONS_PER_ARTIFACT)
        : [artifact];
  }
  return kept;
}

type IncomingArtifactOrigin = 'derived' | 'edited';

function mergeIncomingArtifacts(
  state: ArtifactStoreState,
  safeIncoming: ScopedMobileArtifact[],
  activeOwnerId: string | null,
  origin: IncomingArtifactOrigin,
): Partial<ArtifactStoreState> {
  const existing = state.artifacts.filter(
    (artifact): artifact is ScopedMobileArtifact =>
      isScopedMobileArtifact(artifact) &&
      (artifact.provenance.scope === 'local' || artifact.provenance.ownerId === activeOwnerId),
  );
  const currentById = new Map(existing.map((artifact) => [artifact.id, artifact]));
  const novel =
    origin === 'edited' ? [] : safeIncoming.filter((artifact) => !currentById.has(artifact.id));
  const revised = new Map<string, ScopedMobileArtifact>();
  const renamed = new Map<string, ScopedMobileArtifact>();
  for (const artifact of safeIncoming) {
    const current = currentById.get(artifact.id);
    if (!current) continue;
    if (current.content === artifact.content) {
      const rename =
        origin === 'derived' &&
        current.title !== artifact.title &&
        (state.versionsById[artifact.id]?.length ?? 1) <= 1;
      const madeAt = origin === 'derived' && !current.createdAt ? artifact.createdAt : undefined;
      if (rename || madeAt) {
        renamed.set(artifact.id, {
          ...current,
          ...(rename ? { title: artifact.title, previewLines: artifact.previewLines } : {}),
          ...(madeAt ? { createdAt: madeAt } : {}),
        });
      }
      continue;
    }
    if (origin === 'derived') {
      const seen = state.versionsById[artifact.id];
      if (
        current.editedAt ||
        (Array.isArray(seen) && seen.some((version) => version.content === artifact.content))
      ) {
        continue;
      }
      revised.set(artifact.id, {
        ...artifact,
        ...(current.createdAt ? { createdAt: current.createdAt } : {}),
      });
      continue;
    }
    revised.set(artifact.id, artifact);
  }
  const artifacts = [
    ...novel,
    ...existing.map((artifact) => revised.get(artifact.id) ?? renamed.get(artifact.id) ?? artifact),
  ];
  const versionsById = versionsForArtifacts(state.versionsById, artifacts);
  for (const [id, revision] of revised) {
    const priorVersions = state.versionsById[id];
    versionsById[id] = appendVersion(
      Array.isArray(priorVersions) && priorVersions.length > 0
        ? priorVersions
        : [currentById.get(id)!],
      revision,
    );
  }
  const hasIncomingCloud = novel.some((artifact) => artifact.provenance.scope === 'cloud');
  const ownerChanged =
    state.cloudArtifactsOwnerId !== null && state.cloudArtifactsOwnerId !== activeOwnerId;
  return {
    artifacts,
    versionsById,
    cloudArtifacts: ownerChanged ? [] : state.cloudArtifacts,
    cloudArtifactsOwnerId: hasIncomingCloud
      ? activeOwnerId
      : ownerChanged
        ? null
        : state.cloudArtifactsOwnerId,
  };
}

interface ArtifactStoreState {
  artifacts: MobileArtifact[];

  versionsById: VersionsById;

  addArtifacts: (incoming: MobileArtifact[]) => void;

  saveArtifactEdit: (artifact: MobileArtifact) => void;

  getArtifactVersions: (id: string) => MobileArtifact[];

  restoreArtifactVersion: (id: string, versionIndex: number) => boolean;

  removeArtifact: (id: string) => void;

  clearArtifacts: () => void;

  clearAccountScopedArtifacts: () => void;

  cloudArtifacts: CloudArtifact[];
  cloudArtifactsOwnerId: string | null;
  applyCloudArtifactDeltas: (deltas: ArtifactWireDelta[], ownerId: string) => void;
  clearCloudArtifacts: () => void;

  pendingCloudPushes: PendingCloudPushesById;
  pendingCloudArtifactPushes: (ownerId: string) => ArtifactSyncPushItem[];
  markArtifactPushed: (id: string, serverVersion: string, pushedContent?: string) => void;
  settleArtifactPushConflict: (id: string, current: ArtifactWireDelta | null) => void;
}

export const useArtifactStore = create<ArtifactStoreState>()(
  persist(
    (set, get) => ({
      artifacts: [],

      versionsById: {},

      addArtifacts: (incoming) => {
        if (incoming.length === 0) return;
        const activeOwnerId = captureCloudAccountEpoch()?.ownerId ?? null;
        const safeIncoming = incoming.filter((artifact): artifact is ScopedMobileArtifact => {
          if (!isScopedMobileArtifact(artifact)) return false;
          return (
            artifact.provenance.scope === 'local' || artifact.provenance.ownerId === activeOwnerId
          );
        });
        if (safeIncoming.length === 0) return;

        set((state) => mergeIncomingArtifacts(state, safeIncoming, activeOwnerId, 'derived'));
      },

      saveArtifactEdit: (edit) => {
        const activeOwnerId = captureCloudAccountEpoch()?.ownerId ?? null;
        if (!isScopedMobileArtifact(edit)) return;
        const artifact: ScopedMobileArtifact = { ...edit, editedAt: new Date().toISOString() };
        if (
          artifact.provenance.scope === 'cloud' &&
          artifact.provenance.ownerId !== activeOwnerId
        ) {
          return;
        }
        set((state) => {
          const merged = mergeIncomingArtifacts(state, [artifact], activeOwnerId, 'edited');
          const next = { ...state, ...merged };
          const revised = merged.artifacts?.find((candidate) => candidate.id === artifact.id);
          const current = state.artifacts.find((candidate) => candidate.id === artifact.id);
          if (!revised || !current || revised.content === current.content) return merged;
          return {
            ...merged,
            pendingCloudPushes: withPendingCloudPush(
              state.pendingCloudPushes,
              next,
              artifact.id,
              activeOwnerId,
            ),
          };
        });
      },

      getArtifactVersions: (id) => get().versionsById[id] ?? [],

      restoreArtifactVersion: (id, versionIndex) => {
        const versions = get().versionsById[id];
        const target = versions?.[versionIndex];
        if (!versions || !target || versionIndex >= versions.length - 1) return false;
        const activeOwnerId = captureCloudAccountEpoch()?.ownerId ?? null;
        const restored: MobileArtifact = { ...target, editedAt: new Date().toISOString() };
        set((state) => {
          const artifacts = state.artifacts.map((artifact) =>
            artifact.id === id ? restored : artifact,
          );
          const versionsById = { ...state.versionsById, [id]: appendVersion(versions, restored) };
          return {
            artifacts,
            versionsById,
            pendingCloudPushes: withPendingCloudPush(
              state.pendingCloudPushes,
              { ...state, artifacts, versionsById },
              id,
              activeOwnerId,
            ),
          };
        });
        return true;
      },

      removeArtifact: (id) => {
        const removed = get().artifacts.find((artifact) => artifact.id === id);
        if (removed) discardArtifactDraft(id, removed.provenance);
        set((state) => {
          const artifacts = state.artifacts.filter((a) => a.id !== id);
          return {
            artifacts,
            versionsById: versionsForArtifacts(state.versionsById, artifacts),
            pendingCloudPushes: withoutPendingPush(state.pendingCloudPushes, id),
          };
        });
      },

      clearArtifacts: () => {
        legacyIdAdoptions.clear();
        set({ artifacts: [], versionsById: {}, pendingCloudPushes: {} });
      },

      clearAccountScopedArtifacts: () => {
        legacyIdAdoptions.clear();
        set((state) => {
          const artifacts = state.artifacts.filter(
            (artifact): artifact is ScopedMobileArtifact =>
              isScopedMobileArtifact(artifact) && artifact.provenance.scope === 'local',
          );
          return {
            artifacts,
            versionsById: versionsForArtifacts(state.versionsById, artifacts),
            cloudArtifacts: [],
            cloudArtifactsOwnerId: null,
            pendingCloudPushes: {},
          };
        });
      },

      cloudArtifacts: [],
      cloudArtifactsOwnerId: null,

      applyCloudArtifactDeltas: (deltas, ownerId) => {
        const normalizedOwnerId = normalizedCloudOwnerId(ownerId);
        if (!normalizedOwnerId) return;
        if (captureCloudAccountEpoch()?.ownerId !== normalizedOwnerId) return;
        set((state) => {
          const artifacts = state.artifacts.filter(
            (artifact): artifact is ScopedMobileArtifact =>
              isScopedMobileArtifact(artifact) &&
              (artifact.provenance.scope === 'local' ||
                artifact.provenance.ownerId === normalizedOwnerId),
          );
          let pendingCloudPushes = state.pendingCloudPushes;
          for (const delta of deltas) {
            const pending = pendingCloudPushes[delta.id];
            if (
              pending?.ownerId === normalizedOwnerId &&
              (delta.deleted_at || delta.content === pending.item.content)
            ) {
              pendingCloudPushes = withoutPendingPush(pendingCloudPushes, delta.id);
            }
          }
          return {
            cloudArtifacts: applyArtifactDeltas(
              state.cloudArtifactsOwnerId === normalizedOwnerId ? state.cloudArtifacts : [],
              deltas,
            ),
            artifacts,
            versionsById: versionsForArtifacts(state.versionsById, artifacts),
            cloudArtifactsOwnerId: normalizedOwnerId,
            pendingCloudPushes,
          };
        });
      },

      clearCloudArtifacts: () =>
        set({ cloudArtifacts: [], cloudArtifactsOwnerId: null, pendingCloudPushes: {} }),

      pendingCloudPushes: {},

      pendingCloudArtifactPushes: (ownerId) => {
        const normalizedOwnerId = normalizedCloudOwnerId(ownerId);
        if (!normalizedOwnerId) return [];
        return Object.values(get().pendingCloudPushes)
          .filter((entry) => entry.ownerId === normalizedOwnerId)
          .map((entry) => entry.item);
      },

      markArtifactPushed: (id, serverVersion, pushedContent) => {
        const activeOwnerId = captureCloudAccountEpoch()?.ownerId ?? null;
        set((state) => {
          const pending = state.pendingCloudPushes[id];
          if (!pending || pending.ownerId !== activeOwnerId) return {};
          if (
            state.cloudArtifactsOwnerId !== null &&
            state.cloudArtifactsOwnerId !== activeOwnerId
          ) {
            return {};
          }
          const pushed =
            pushedContent === undefined || pushedContent === pending.item.content
              ? pending.item
              : { ...pending.item, content: pushedContent };
          const existing = state.cloudArtifacts.find((row) => row.id === id);
          const local = state.artifacts.find((artifact) => artifact.id === id);
          const now = new Date().toISOString();
          const row: CloudArtifact = {
            ...(existing ?? {}),
            id,
            type: pushed.artifactType as SharedArtifactType,
            title: pushed.title ?? '',
            content: pushed.content,
            language: pushed.language ?? undefined,
            version: pushed.currentVersion ?? 1,
            createdAt: existing?.createdAt ?? local?.createdAt ?? now,
            updatedAt: local?.editedAt ?? now,
            conversationId: pushed.conversationId,
            messageId: pushed.messageId ?? undefined,
            metadata: { ...(existing?.metadata ?? {}), serverVersion },
            deletedAt: null,
          };
          const cloudArtifacts = [...state.cloudArtifacts.filter((r) => r.id !== id), row];
          const stillNewer = pushed.content !== pending.item.content;
          return {
            cloudArtifacts,
            cloudArtifactsOwnerId: activeOwnerId,
            pendingCloudPushes: stillNewer
              ? {
                  ...state.pendingCloudPushes,
                  [id]: {
                    ownerId: pending.ownerId,
                    item: { ...pending.item, baseVersion: serverVersion },
                  },
                }
              : withoutPendingPush(state.pendingCloudPushes, id),
          };
        });
      },

      settleArtifactPushConflict: (id, current) => {
        const activeOwnerId = captureCloudAccountEpoch()?.ownerId ?? null;
        set((state) => {
          const pending = state.pendingCloudPushes[id];
          if (!pending || pending.ownerId !== activeOwnerId) return {};
          const pendingCloudPushes = withoutPendingPush(state.pendingCloudPushes, id);
          if (!current || current.id !== id) return { pendingCloudPushes };
          const cloudArtifacts = applyArtifactDeltas(
            state.cloudArtifactsOwnerId === activeOwnerId ? state.cloudArtifacts : [],
            [current],
          );
          const live = state.artifacts.find((artifact) => artifact.id === id);
          const versions = state.versionsById[id] ?? [];
          const serverIsKnownVersion =
            !current.deleted_at &&
            live !== undefined &&
            live.content !== current.content &&
            versions.some((version) => version.content === current.content);
          if (serverIsKnownVersion) {
            return {
              cloudArtifacts,
              cloudArtifactsOwnerId: activeOwnerId,
              pendingCloudPushes: {
                ...state.pendingCloudPushes,
                [id]: {
                  ownerId: pending.ownerId,
                  item: { ...pending.item, baseVersion: current.server_version },
                },
              },
            };
          }
          if (!live || current.deleted_at || live.content === current.content) {
            return { cloudArtifacts, cloudArtifactsOwnerId: activeOwnerId, pendingCloudPushes };
          }
          const serverCopy: MobileArtifact = {
            ...live,
            title: current.title ?? live.title,
            content: current.content,
            language: current.language ?? live.language,
            previewLines: buildPreviewLines(current.content),
            editedAt: current.updated_at,
          };
          return {
            artifacts: state.artifacts.map((artifact) =>
              artifact.id === id ? serverCopy : artifact,
            ),
            versionsById: {
              ...state.versionsById,
              [id]: appendVersion(versions.length > 0 ? versions : [live], serverCopy),
            },
            cloudArtifacts,
            cloudArtifactsOwnerId: activeOwnerId,
            pendingCloudPushes,
          };
        });
      },
    }),
    {
      name: 'artifact-store',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[artifactStore] Hydration failed:', error);
      },
      partialize: (state) => {
        const artifacts = state.artifacts.slice(0, MAX_ARTIFACTS);
        return {
          artifacts,
          versionsById: versionsForArtifacts(state.versionsById, artifacts),
          cloudArtifacts: state.cloudArtifacts.slice(0, MAX_ARTIFACTS),
          cloudArtifactsOwnerId: state.cloudArtifactsOwnerId,
          pendingCloudPushes: validPendingPushes(state.pendingCloudPushes),
        };
      },
      version: ARTIFACT_STORE_VERSION,
      migrate: (persistedState, version) => {
        const persisted = persistedState as Partial<ArtifactStoreState> | undefined;
        const ownerId = normalizedCloudOwnerId(persisted?.cloudArtifactsOwnerId);
        const scoped = Array.isArray(persisted?.artifacts)
          ? persisted.artifacts.filter(isScopedMobileArtifact)
          : [];
        const artifacts = (
          version < ARTIFACT_STORE_VERSION
            ? repairedStoredArtifacts(scoped, persisted?.versionsById)
            : scoped
        ).slice(0, MAX_ARTIFACTS);
        return {
          artifacts,
          versionsById: versionsForArtifacts(
            version < ARTIFACT_STORE_VERSION
              ? repairedVersions(persisted?.versionsById, artifacts)
              : persisted?.versionsById,
            artifacts,
          ),
          cloudArtifacts:
            ownerId && Array.isArray(persisted?.cloudArtifacts)
              ? persisted.cloudArtifacts.slice(0, MAX_ARTIFACTS)
              : [],
          cloudArtifactsOwnerId: ownerId,
          pendingCloudPushes: validPendingPushes(persisted?.pendingCloudPushes),
        };
      },
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<ArtifactStoreState> | undefined;
        const ownerId = normalizedCloudOwnerId(persisted?.cloudArtifactsOwnerId);
        const artifacts = Array.isArray(persisted?.artifacts)
          ? persisted.artifacts.filter(isScopedMobileArtifact).slice(0, MAX_ARTIFACTS)
          : [];
        return {
          ...currentState,
          artifacts,
          versionsById: versionsForArtifacts(persisted?.versionsById, artifacts),
          cloudArtifacts:
            ownerId && Array.isArray(persisted?.cloudArtifacts)
              ? persisted.cloudArtifacts.slice(0, MAX_ARTIFACTS)
              : [],
          cloudArtifactsOwnerId: ownerId,
          pendingCloudPushes: validPendingPushes(persisted?.pendingCloudPushes),
        };
      },
    },
  ),
);

rehydrateWhenMmkvReady(useArtifactStore, 'artifactStore');

export function clearAccountScopedArtifactState(): void {
  useArtifactStore.getState().clearAccountScopedArtifacts();
  clearAccountScopedArtifactDrafts();
  // Loaded on demand so this store never imports the file service, which reaches the API client.
  const fileService =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@/services/fileCreation') as typeof import('@/services/fileCreation');
  void fileService.removeViewerFileCopies().catch((error: unknown) => {
    console.warn('[artifacts] Failed to remove viewed file copies:', error);
  });
}

const SOURCE_KINDS: ReadonlySet<string> = new Set([
  'code',
  'html',
  'react',
  'component',
  'svg',
  'mermaid',
  'diagram',
  'csv',
  'json',
  'table',
  'spreadsheet',
  'data',
]);

function toMobileKind(type: string): MobileArtifactKind {
  if (SOURCE_KINDS.has(type)) return 'code';
  switch (type) {
    case 'chart':
      return 'chart';
    case 'research':
      return 'research';
    case 'image':
      return 'image';
    default:
      return 'document';
  }
}

export function accentColorForKind(
  kind: MobileArtifactKind,
  themeColors: { teal: string; terraCotta: string; agentThinking: string; agentActive: string },
): string {
  switch (kind) {
    case 'code':
      return themeColors.teal;
    case 'chart':
      return themeColors.terraCotta;
    case 'research':
      return themeColors.agentThinking;
    case 'document':
      return themeColors.agentActive;
    case 'image':
      return themeColors.terraCotta;
  }
}

const FENCE_LINE = /^(`{3,}|~{3,})/;
const ARTIFACT_MARKER_LINES: ReadonlySet<string> = new Set(EXPLICIT_ARTIFACT_MARKERS);

function previewLinesFor(source: { type: string; content: string; language?: string }): string[] {
  return studyPreviewLines(source) ?? buildPreviewLines(source.content);
}

function buildPreviewLines(content: string, max = 6): string[] {
  const lines = withoutTitleDirectives(content)
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0 && !FENCE_LINE.test(l.trimStart()));
  const body = ARTIFACT_MARKER_LINES.has(lines[0]?.trim() ?? '') ? lines.slice(1) : lines;
  return body.slice(0, max);
}

const DERIVED_ARTIFACT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_MESSAGE_ID = /^msg_(\d+)_/;
const GENERATED_IMAGE_ID_PREFIX = 'generated-image-';
const MARKDOWN_LANGUAGES: ReadonlySet<string> = new Set(['markdown', 'md']);

function messageMadeAt(messageId: string | undefined): string | undefined {
  if (!messageId) return undefined;
  const ms = isUuidV7(messageId)
    ? uuidV7TimestampMs(messageId)
    : Number(LOCAL_MESSAGE_ID.exec(messageId)?.[1]);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : undefined;
}

function sourceMessageId(artifact: MobileArtifact): string | undefined {
  if (artifact.messageId) return artifact.messageId;
  return artifact.kind === 'image' && artifact.id.startsWith(GENERATED_IMAGE_ID_PREFIX)
    ? artifact.id.slice(GENERATED_IMAGE_ID_PREFIX.length)
    : undefined;
}

function storedFence(artifact: MobileArtifact): { language: string; content: string } {
  const language = artifact.language ?? 'text';
  const markedDocument =
    artifact.kind === 'document' && MARKDOWN_LANGUAGES.has(language.toLowerCase());
  return {
    language,
    content: markedDocument
      ? `${EXPLICIT_ARTIFACT_MARKER_FOR.markdown}\n${artifact.content}`
      : artifact.content,
  };
}

function isUneditedDerivedArtifact(
  artifact: MobileArtifact,
  versionsById: VersionsById | undefined,
): boolean {
  return (
    !artifact.editedAt &&
    Boolean(artifact.messageId) &&
    DERIVED_ARTIFACT_ID.test(artifact.id) &&
    (versionsById?.[artifact.id]?.length ?? 1) <= 1
  );
}

function repairedStoredArtifacts(
  artifacts: ScopedMobileArtifact[],
  versionsById: VersionsById | undefined,
): ScopedMobileArtifact[] {
  const listed = new Set<string>();
  const repaired: ScopedMobileArtifact[] = [];
  for (const artifact of artifacts) {
    const createdAt = artifact.createdAt ?? messageMadeAt(sourceMessageId(artifact));
    const dated = createdAt ? { ...artifact, createdAt } : artifact;
    if (artifact.kind === 'image') {
      repaired.push(dated);
      continue;
    }
    const fence = storedFence(artifact);
    const source = {
      type: cloudLinkOf(artifact).artifactType ?? detectArtifactType(fence.language, fence.content),
      content: artifact.content,
      ...(artifact.language ? { language: artifact.language } : {}),
    };
    if (!isUneditedDerivedArtifact(artifact, versionsById)) {
      repaired.push({
        ...dated,
        title: storedArtifactTitle(artifact.title, source.type, artifact.language),
        previewLines: previewLinesFor(source),
      });
      continue;
    }
    const sameSource = `${artifact.messageId}\n${artifact.content}`;
    if (listed.has(sameSource)) continue;
    listed.add(sameSource);
    repaired.push({
      ...dated,
      kind: toMobileKind(source.type),
      title: artifactDisplayTitle(source),
      previewLines: previewLinesFor(source),
    });
  }
  return repaired;
}

function repairedVersions(
  versionsById: VersionsById | undefined,
  artifacts: ReadonlyArray<MobileArtifact>,
): VersionsById {
  const versions: VersionsById = { ...(versionsById ?? {}) };
  for (const artifact of artifacts) {
    if ((versions[artifact.id]?.length ?? 0) <= 1) versions[artifact.id] = [artifact];
  }
  return versions;
}

export function formatAgeLabel(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Math.max(0, now - then);
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return translatePlural('common', 'relative.daysAgo', diffDays, {
      one: '{{count}} day ago',
      other: '{{count}} days ago',
    });
  }
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function canonicalToMobileArtifact(
  artifact: { id: string; type: string; title: string; content: string; language?: string },
  createdAt: string,
  conversationTitle: string,
  themeColors: { teal: string; terraCotta: string; agentThinking: string; agentActive: string },
  provenance: MobileArtifactProvenance,
): ScopedMobileArtifact {
  const kind = toMobileKind(artifact.type);
  return {
    id: artifact.id,
    title: storedArtifactTitle(artifact.title, artifact.type, artifact.language),
    kind,
    language: artifact.language,
    content: artifact.content,
    ageLabel: formatAgeLabel(createdAt),
    createdAt,
    sourceLabel: conversationTitle || 'Chat',
    accentColor: accentColorForKind(kind, themeColors),
    previewLines: previewLinesFor(artifact),
    provenance: requireArtifactProvenance(provenance),
  };
}

function mobileToCanonicalArtifact(artifact: MobileArtifact): SharedArtifact {
  return {
    id: artifact.id,
    type:
      artifact.kind === 'code' ||
      artifact.kind === 'chart' ||
      artifact.kind === 'research' ||
      artifact.kind === 'image'
        ? artifact.kind
        : 'document',
    title: artifact.title,
    content: artifact.content,
    language: artifact.language,
    version: 1,
    createdAt: '1970-01-01T00:00:00.000Z',
  };
}

function withoutSupersededLegacyRows(
  cloud: ReadonlyArray<CloudArtifact>,
  local: ReadonlyArray<MobileArtifact>,
): ReadonlyArray<CloudArtifact> {
  if (legacyIdAdoptions.size === 0) return cloud;
  const localIds = new Set(local.map((artifact) => artifact.id));
  const heldAs = (adopterId: string, content: string): boolean => {
    const adopterRow = cloud.find((row) => row.id === adopterId);
    if (adopterRow && !adopterRow.deletedAt && adopterRow.content === content) return true;
    if (local.some((artifact) => artifact.id === adopterId && artifact.content === content)) {
      return true;
    }
    const versions = useArtifactStore.getState().versionsById[adopterId];
    return Array.isArray(versions) && versions.some((version) => version.content === content);
  };
  return cloud.filter((row) => {
    const adoption = legacyIdAdoptions.get(row.id);
    if (!adoption || row.deletedAt || localIds.has(row.id)) return true;
    if (row.conversationId !== adoption.conversationId || row.messageId !== adoption.messageId) {
      return true;
    }
    return !heldAs(adoption.id, row.content);
  });
}

export function mergeMobileArtifactsForGallery(
  local: ReadonlyArray<MobileArtifact>,
  cloud: ReadonlyArray<CloudArtifact>,
  themeColors: { teal: string; terraCotta: string; agentThinking: string; agentActive: string },
  cloudOwnerId?: string | null,
): MobileArtifact[] {
  const normalizedOwnerId = normalizedCloudOwnerId(cloudOwnerId);
  const ownedCloud = normalizedOwnerId ? withoutSupersededLegacyRows(cloud, local) : [];
  const merged = mergeCloudArtifacts(local.map(mobileToCanonicalArtifact), ownedCloud);
  const visibleIds = new Set(merged.map((artifact) => artifact.id));
  const localIds = new Set(local.map((artifact) => artifact.id));
  const activeCloudById = new Map(
    ownedCloud
      .filter((artifact) => !artifact.deletedAt)
      .map((artifact) => [artifact.id, artifact] as const),
  );
  const fromCloud = (artifact: CloudArtifact): MobileArtifact => {
    const createdAt = artifact.createdAt ?? artifact.updatedAt ?? '1970-01-01T00:00:00.000Z';
    const mapped = canonicalToMobileArtifact(artifact, createdAt, 'AGI Cloud', themeColors, {
      scope: 'cloud',
      ownerId: normalizedOwnerId!,
    });
    return artifact.updatedAt && artifact.updatedAt !== createdAt
      ? { ...mapped, editedAt: artifact.updatedAt }
      : mapped;
  };
  const fromCloudOver = (artifact: MobileArtifact, winner: CloudArtifact): MobileArtifact => {
    const mapped = fromCloud(winner);
    if (winner.content !== artifact.content) return mapped;
    const { editedAt: _serverTime, ...withoutServerTime } = mapped;
    return {
      ...withoutServerTime,
      ageLabel: artifact.ageLabel,
      ...(artifact.createdAt ? { createdAt: artifact.createdAt } : {}),
      ...(artifact.editedAt ? { editedAt: artifact.editedAt } : {}),
    };
  };

  const cloudOnly = merged
    .filter((artifact) => !localIds.has(artifact.id))
    .map((artifact) => activeCloudById.get(artifact.id))
    .filter((artifact): artifact is CloudArtifact => Boolean(artifact))
    .sort((a, b) =>
      (b.updatedAt ?? b.createdAt ?? '').localeCompare(a.updatedAt ?? a.createdAt ?? ''),
    )
    .map(fromCloud);

  const localSequence = local
    .filter((artifact) => visibleIds.has(artifact.id))
    .map((artifact) => {
      const cloudWinner = activeCloudById.get(artifact.id);
      return cloudWinner ? fromCloudOver(artifact, cloudWinner) : artifact;
    });

  return [...cloudOnly, ...localSequence];
}

export function viewerArtifactFor(artifact: MobileArtifact): Artifact {
  return {
    id: artifact.id,
    type: artifact.kind,
    title: artifact.title,
    content: artifact.content,
    ...(artifact.language ? { language: artifact.language } : {}),
  };
}

export function generatedImageToMobileArtifact(input: {
  messageId: string;
  imagePath: string;
  prompt?: string;
  createdAt: string;
  conversationTitle: string;
  provenance: MobileArtifactProvenance;
  accentColor: string;
}): ScopedMobileArtifact {
  const prompt = input.prompt?.trim();
  return {
    id: `${GENERATED_IMAGE_ID_PREFIX}${input.messageId}`,
    title: prompt ? `Image: ${prompt.slice(0, 72)}` : 'Generated image',
    kind: 'image',
    language: 'PNG',
    content: input.imagePath,
    ageLabel: formatAgeLabel(input.createdAt),
    createdAt: input.createdAt,
    sourceLabel: input.conversationTitle || 'AGI Cloud',
    accentColor: input.accentColor,
    previewLines: prompt ? [prompt] : ['Generated image'],
    provenance: requireArtifactProvenance(input.provenance),
  };
}

export function deriveAndMapToMobileArtifacts(
  markdown: string,
  conversationId: string,
  messageId: string,
  createdAt: string,
  conversationTitle: string,
  provenance: MobileArtifactProvenance,
): CloudLinkedMobileArtifact[] {
  const safeProvenance = requireArtifactProvenance(provenance);
  for (const { id, legacyId } of legacyArtifactIdAdoptions(markdown, {
    conversationId,
    messageId,
  })) {
    legacyIdAdoptions.set(legacyId, { id, conversationId, messageId });
  }
  const shared = deriveArtifacts(markdown, {
    conversationId,
    messageId,
    include: (block) => offersMessageArtifact(block, safeProvenance.scope),
    now: createdAt,
  });

  return shared.map((s) =>
    messageLinkedArtifact(s, conversationId, messageId, conversationTitle, safeProvenance),
  );
}

function messageLinkedArtifact(
  s: {
    id: string;
    type: SharedArtifactType;
    language?: string;
    content: string;
    createdAt: string;
  },
  conversationId: string,
  messageId: string,
  conversationTitle: string,
  provenance: MobileArtifactProvenance,
): CloudLinkedMobileArtifact {
  const kind = toMobileKind(s.type);
  const language = s.type === 'svg' ? 'svg' : s.language === 'text' ? undefined : s.language;
  const source = { type: s.type, content: s.content, ...(language ? { language } : {}) };
  return {
    id: s.id,
    messageId,
    conversationId,
    artifactType: s.type,
    title: artifactDisplayTitle(source),
    kind,
    language,
    content: s.content,
    ageLabel: formatAgeLabel(s.createdAt),
    createdAt: s.createdAt,
    sourceLabel: conversationTitle || 'Chat',
    accentColor: accentColorForKind(kind, agiNativeColors.dark),
    previewLines: previewLinesFor(source),
    provenance,
  };
}

function withoutIndentation(code: string): string {
  return code
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .join('\n');
}

function codeBlockShowing(blocks: readonly DerivedCodeBlock[], code: string) {
  const exact = code.trim();
  const found = blocks.find((block) => block.content === exact);
  if (found) return found;
  const loose = withoutIndentation(code);
  const matches = blocks.filter((block) => withoutIndentation(block.content) === loose);
  return matches.length === 1 ? matches[0] : undefined;
}

function editorArtifactSource(input: {
  markdown: string;
  code: string;
  language: string;
  conversationId: string;
  messageId: string;
}): { id: string; language: string } | null {
  const block = codeBlockShowing(extractCodeBlocks(input.markdown), input.code);
  if (block) {
    return {
      id: computeDerivedArtifactId(
        input.conversationId,
        `${input.messageId}:editor`,
        block.ordinal,
      ),
      language: block.language,
    };
  }
  if (!withoutIndentation(input.markdown).includes(withoutIndentation(input.code))) return null;
  return {
    id: computeDerivedArtifactId(
      input.conversationId,
      `${input.messageId}:editor:${input.language}\n${input.code.trim()}`,
      0,
    ),
    language: input.language,
  };
}

export function codeBlockEditorMobileArtifact(input: {
  markdown: string;
  code: string;
  language: string | undefined;
  conversationId: string;
  messageId: string;
  createdAt: string;
  conversationTitle: string;
  provenance: MobileArtifactProvenance;
}): CloudLinkedMobileArtifact | null {
  const content = input.code.trim();
  if (content.length === 0) return null;
  const source = editorArtifactSource({
    markdown: input.markdown,
    code: input.code,
    language: input.language?.toLowerCase() || 'text',
    conversationId: input.conversationId,
    messageId: input.messageId,
  });
  if (!source) return null;
  return messageLinkedArtifact(
    {
      id: source.id,
      type: detectArtifactType(source.language, content),
      language: source.language,
      content,
      createdAt: input.createdAt,
    },
    input.conversationId,
    input.messageId,
    input.conversationTitle,
    requireArtifactProvenance(input.provenance),
  );
}

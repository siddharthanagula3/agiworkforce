import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import { deriveArtifacts, applyArtifactDeltas, mergeCloudArtifacts } from '@agiworkforce/artifacts';
import type { CloudArtifact } from '@agiworkforce/artifacts';
import type { ArtifactWireDelta } from '@agiworkforce/cloud-contracts';
import type { SharedArtifact } from '@agiworkforce/types';
import { captureCloudAccountEpoch } from '@/src/features/auth/services/cloudAccountSession';
import type {
  MobileArtifact,
  MobileArtifactKind,
  MobileArtifactProvenance,
  ScopedMobileArtifact,
} from './types';

const MAX_ARTIFACTS = 200;
const MAX_VERSIONS_PER_ARTIFACT = 20;
const ARTIFACT_STORE_VERSION = 2;

function normalizedCloudOwnerId(ownerId: unknown): string | null {
  return typeof ownerId === 'string' && ownerId.trim().length > 0 ? ownerId.trim() : null;
}

function isValidArtifactProvenance(value: unknown): value is MobileArtifactProvenance {
  if (!value || typeof value !== 'object') return false;
  const provenance = value as Record<string, unknown>;
  if (provenance.scope === 'local') return true;
  return provenance.scope === 'cloud' && normalizedCloudOwnerId(provenance.ownerId) !== null;
}

function isScopedMobileArtifact(value: unknown): value is ScopedMobileArtifact {
  if (!value || typeof value !== 'object') return false;
  return isValidArtifactProvenance((value as { provenance?: unknown }).provenance);
}

function requireArtifactProvenance(provenance: MobileArtifactProvenance): MobileArtifactProvenance {
  if (!isValidArtifactProvenance(provenance)) {
    throw new Error('Artifact persistence requires Local scope or a non-empty Cloud owner id');
  }
  return provenance.scope === 'cloud'
    ? { scope: 'cloud', ownerId: provenance.ownerId.trim() }
    : { scope: 'local' };
}

type VersionsById = Record<string, MobileArtifact[]>;

function appendVersion(versions: MobileArtifact[], next: MobileArtifact): MobileArtifact[] {
  return [...versions, next].slice(-MAX_VERSIONS_PER_ARTIFACT);
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

interface ArtifactStoreState {
  artifacts: MobileArtifact[];

  versionsById: VersionsById;

  addArtifacts: (incoming: MobileArtifact[]) => void;

  getArtifactVersions: (id: string) => MobileArtifact[];

  restoreArtifactVersion: (id: string, versionIndex: number) => boolean;

  removeArtifact: (id: string) => void;

  clearArtifacts: () => void;

  clearAccountScopedArtifacts: () => void;

  cloudArtifacts: CloudArtifact[];
  cloudArtifactsOwnerId: string | null;
  applyCloudArtifactDeltas: (deltas: ArtifactWireDelta[], ownerId: string) => void;
  clearCloudArtifacts: () => void;
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

        set((state) => {
          const existing = state.artifacts.filter(
            (artifact): artifact is ScopedMobileArtifact =>
              isScopedMobileArtifact(artifact) &&
              (artifact.provenance.scope === 'local' ||
                artifact.provenance.ownerId === activeOwnerId),
          );
          const currentById = new Map(existing.map((artifact) => [artifact.id, artifact]));
          const novel = safeIncoming.filter((artifact) => !currentById.has(artifact.id));
          const revised = new Map<string, ScopedMobileArtifact>();
          for (const artifact of safeIncoming) {
            const current = currentById.get(artifact.id);
            if (current && current.content !== artifact.content) revised.set(artifact.id, artifact);
          }
          const artifacts = [
            ...novel,
            ...existing.map((artifact) => revised.get(artifact.id) ?? artifact),
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
        });
      },

      getArtifactVersions: (id) => get().versionsById[id] ?? [],

      restoreArtifactVersion: (id, versionIndex) => {
        const versions = get().versionsById[id];
        const target = versions?.[versionIndex];
        if (!versions || !target || versionIndex >= versions.length - 1) return false;
        set((state) => ({
          artifacts: state.artifacts.map((artifact) => (artifact.id === id ? target : artifact)),
          versionsById: { ...state.versionsById, [id]: appendVersion(versions, target) },
        }));
        return true;
      },

      removeArtifact: (id) => {
        set((state) => {
          const artifacts = state.artifacts.filter((a) => a.id !== id);
          return { artifacts, versionsById: versionsForArtifacts(state.versionsById, artifacts) };
        });
      },

      clearArtifacts: () => set({ artifacts: [], versionsById: {} }),

      clearAccountScopedArtifacts: () =>
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
          };
        }),

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
          return {
            cloudArtifacts: applyArtifactDeltas(
              state.cloudArtifactsOwnerId === normalizedOwnerId ? state.cloudArtifacts : [],
              deltas,
            ),
            artifacts,
            versionsById: versionsForArtifacts(state.versionsById, artifacts),
            cloudArtifactsOwnerId: normalizedOwnerId,
          };
        });
      },

      clearCloudArtifacts: () => set({ cloudArtifacts: [], cloudArtifactsOwnerId: null }),
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
        };
      },
      version: ARTIFACT_STORE_VERSION,
      migrate: (persistedState) => {
        const persisted = persistedState as Partial<ArtifactStoreState> | undefined;
        const ownerId = normalizedCloudOwnerId(persisted?.cloudArtifactsOwnerId);
        const artifacts = Array.isArray(persisted?.artifacts)
          ? persisted.artifacts.filter(isScopedMobileArtifact).slice(0, MAX_ARTIFACTS)
          : [];
        return {
          artifacts,
          versionsById: versionsForArtifacts(persisted?.versionsById, artifacts),
          cloudArtifacts:
            ownerId && Array.isArray(persisted?.cloudArtifacts)
              ? persisted.cloudArtifacts.slice(0, MAX_ARTIFACTS)
              : [],
          cloudArtifactsOwnerId: ownerId,
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
        };
      },
    },
  ),
);

rehydrateWhenMmkvReady(useArtifactStore, 'artifactStore');

export function clearAccountScopedArtifactState(): void {
  useArtifactStore.getState().clearAccountScopedArtifacts();
}

function toMobileKind(type: string): MobileArtifactKind {
  switch (type) {
    case 'code':
      return 'code';
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

function buildPreviewLines(content: string, max = 6): string[] {
  return content
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0)
    .slice(0, max);
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
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
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
    title: artifact.title || 'Untitled artifact',
    kind,
    language: artifact.language,
    content: artifact.content,
    ageLabel: formatAgeLabel(createdAt),
    sourceLabel: conversationTitle || 'Chat',
    accentColor: accentColorForKind(kind, themeColors),
    previewLines: buildPreviewLines(artifact.content),
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

export function mergeMobileArtifactsForGallery(
  local: ReadonlyArray<MobileArtifact>,
  cloud: ReadonlyArray<CloudArtifact>,
  themeColors: { teal: string; terraCotta: string; agentThinking: string; agentActive: string },
  cloudOwnerId?: string | null,
): MobileArtifact[] {
  const normalizedOwnerId = normalizedCloudOwnerId(cloudOwnerId);
  const ownedCloud = normalizedOwnerId ? cloud : [];
  const merged = mergeCloudArtifacts(local.map(mobileToCanonicalArtifact), ownedCloud);
  const visibleIds = new Set(merged.map((artifact) => artifact.id));
  const localIds = new Set(local.map((artifact) => artifact.id));
  const activeCloudById = new Map(
    ownedCloud
      .filter((artifact) => !artifact.deletedAt)
      .map((artifact) => [artifact.id, artifact] as const),
  );
  const fromCloud = (artifact: CloudArtifact): MobileArtifact =>
    canonicalToMobileArtifact(
      artifact,
      artifact.updatedAt ?? artifact.createdAt ?? '1970-01-01T00:00:00.000Z',
      'AGI Cloud',
      themeColors,
      { scope: 'cloud', ownerId: normalizedOwnerId! },
    );

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
      return cloudWinner ? fromCloud(cloudWinner) : artifact;
    });

  return [...cloudOnly, ...localSequence];
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
    id: `generated-image-${input.messageId}`,
    title: prompt ? `Image: ${prompt.slice(0, 72)}` : 'Generated image',
    kind: 'image',
    language: 'PNG',
    content: input.imagePath,
    ageLabel: formatAgeLabel(input.createdAt),
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
  themeColors: { teal: string; terraCotta: string; agentThinking: string; agentActive: string },
  provenance: MobileArtifactProvenance,
): ScopedMobileArtifact[] {
  const safeProvenance = requireArtifactProvenance(provenance);
  const shared = deriveArtifacts(markdown, {
    conversationId,
    messageId,
    include: 'code',
    minCodeLines: 4,
    now: createdAt,
  });

  return shared.map((s) => {
    const kind = toMobileKind(s.type);
    return {
      id: s.id, // shared deterministic id — do NOT regenerate
      messageId,
      title: s.title,
      kind,
      language: s.language === 'text' ? undefined : s.language,
      content: s.content,
      ageLabel: formatAgeLabel(s.createdAt),
      sourceLabel: conversationTitle || 'Chat',
      accentColor: accentColorForKind(kind, themeColors),
      previewLines: buildPreviewLines(s.content),
      provenance: safeProvenance,
    };
  });
}

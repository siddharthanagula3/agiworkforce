/**
 * Artifact Store
 *
 * Persists user-created artifacts extracted from chat messages. Artifacts are
 * first-class outputs and persist independently of the source conversation —
 * deleting a chat does not cascade-delete its artifacts.
 *
 * Extraction happens after each LLM turn (onDone / local finalContent), not
 * per-token. When the stream protocol surfaces structured artifact events,
 * swap the post-hoc parser for the event handler.
 *
 * Storage: MMKV with at-rest encryption via the shared mmkvStorage adapter.
 * Cap: last MAX_ARTIFACTS entries to prevent unbounded growth (mirrors
 * chatMessageStore's partialize strategy).
 *
 * Derivation is delegated to @agiworkforce/artifacts `deriveArtifacts` — the
 * ONE canonical place across web, desktop, and mobile (shared-packages-
 * consolidation-plan-2026-06-21.md §3). Mobile-specific PRESENTATION helpers
 * (kind mapping, accent colors, preview lines, age label) remain here.
 */
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ARTIFACTS = 200;
const ARTIFACT_STORE_VERSION = 1;

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

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface ArtifactStoreState {
  /** User-created artifacts, newest first. */
  artifacts: MobileArtifact[];

  /** Add one or more artifacts; duplicates (by id) are silently skipped. */
  addArtifacts: (incoming: MobileArtifact[]) => void;

  /** Remove a single artifact by id. */
  removeArtifact: (id: string) => void;

  /** Clear all user artifacts (e.g. sign-out). */
  clearArtifacts: () => void;

  /**
   * Remove every Cloud or legacy-unowned artifact while retaining only data
   * explicitly proven to be Local/device-scoped.
   */
  clearAccountScopedArtifacts: () => void;

  // --- Cloud-synced artifacts (managed sync, migration 0039) ---
  // Kept SEPARATE from the locally-derived `artifacts` slice so the derived gallery is
  // untouched; the render layer merges (mergeCloudArtifacts) when cloud sync is live.
  /** Pulled cloud artifacts (edited/desktop-authored), keyed by id. */
  cloudArtifacts: CloudArtifact[];
  /** Clerk owner of the pulled Cloud overlay. Null means the overlay is unusable. */
  cloudArtifactsOwnerId: string | null;
  /** Apply pulled artifact deltas from `/api/chat/sync` (delegates to the shared logic). */
  applyCloudArtifactDeltas: (deltas: ArtifactWireDelta[], ownerId: string) => void;
  /** Clear pulled cloud artifacts (sign-out / leaving cloud mode). */
  clearCloudArtifacts: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useArtifactStore = create<ArtifactStoreState>()(
  persist(
    (set) => ({
      artifacts: [],

      addArtifacts: (incoming) => {
        if (incoming.length === 0) return;
        // Missing/malformed provenance can only come from an older caller or
        // persisted legacy data. Do not let it become a new mixed-boundary row.
        const activeOwnerId = captureCloudAccountEpoch()?.ownerId ?? null;
        const safeIncoming = incoming.filter((artifact): artifact is ScopedMobileArtifact => {
          if (!isScopedMobileArtifact(artifact)) return false;
          return (
            artifact.provenance.scope === 'local' || artifact.provenance.ownerId === activeOwnerId
          );
        });
        if (safeIncoming.length === 0) return;

        set((state) => {
          // Remove malformed rows and Cloud rows from any previous account
          // before deduping. Local artifacts remain device-owned.
          const existing = state.artifacts.filter(
            (artifact): artifact is ScopedMobileArtifact =>
              isScopedMobileArtifact(artifact) &&
              (artifact.provenance.scope === 'local' ||
                artifact.provenance.ownerId === activeOwnerId),
          );
          const existingIds = new Set(existing.map((artifact) => artifact.id));
          const novel = safeIncoming.filter((artifact) => !existingIds.has(artifact.id));
          const hasIncomingCloud = novel.some((artifact) => artifact.provenance.scope === 'cloud');
          const ownerChanged =
            state.cloudArtifactsOwnerId !== null && state.cloudArtifactsOwnerId !== activeOwnerId;
          return {
            artifacts: [...novel, ...existing],
            cloudArtifacts: ownerChanged ? [] : state.cloudArtifacts,
            cloudArtifactsOwnerId: hasIncomingCloud
              ? activeOwnerId
              : ownerChanged
                ? null
                : state.cloudArtifactsOwnerId,
          };
        });
      },

      removeArtifact: (id) => {
        set((state) => ({ artifacts: state.artifacts.filter((a) => a.id !== id) }));
      },

      clearArtifacts: () => set({ artifacts: [] }),

      clearAccountScopedArtifacts: () =>
        set((state) => ({
          artifacts: state.artifacts.filter(
            (artifact): artifact is ScopedMobileArtifact =>
              isScopedMobileArtifact(artifact) && artifact.provenance.scope === 'local',
          ),
          cloudArtifacts: [],
          cloudArtifactsOwnerId: null,
        })),

      cloudArtifacts: [],
      cloudArtifactsOwnerId: null,

      applyCloudArtifactDeltas: (deltas, ownerId) => {
        const normalizedOwnerId = normalizedCloudOwnerId(ownerId);
        if (!normalizedOwnerId) return;
        if (captureCloudAccountEpoch()?.ownerId !== normalizedOwnerId) return;
        set((state) => ({
          cloudArtifacts: applyArtifactDeltas(
            state.cloudArtifactsOwnerId === normalizedOwnerId ? state.cloudArtifacts : [],
            deltas,
          ),
          artifacts: state.artifacts.filter(
            (artifact): artifact is ScopedMobileArtifact =>
              isScopedMobileArtifact(artifact) &&
              (artifact.provenance.scope === 'local' ||
                artifact.provenance.ownerId === normalizedOwnerId),
          ),
          cloudArtifactsOwnerId: normalizedOwnerId,
        }));
      },

      clearCloudArtifacts: () => set({ cloudArtifacts: [], cloudArtifactsOwnerId: null }),
    }),
    {
      name: 'artifact-store',
      storage: createJSONStorage(() => mmkvStorage),
      // AUDIT-FIX: MMKV-RACE — skip hydration until encrypted storage is ready.
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[artifactStore] Hydration failed:', error);
      },
      partialize: (state) => ({
        artifacts: state.artifacts.slice(0, MAX_ARTIFACTS),
        cloudArtifacts: state.cloudArtifacts.slice(0, MAX_ARTIFACTS),
        cloudArtifactsOwnerId: state.cloudArtifactsOwnerId,
      }),
      version: ARTIFACT_STORE_VERSION,
      migrate: (persistedState) => {
        const persisted = persistedState as Partial<ArtifactStoreState> | undefined;
        const ownerId = normalizedCloudOwnerId(persisted?.cloudArtifactsOwnerId);
        return {
          artifacts: Array.isArray(persisted?.artifacts)
            ? persisted.artifacts.filter(isScopedMobileArtifact).slice(0, MAX_ARTIFACTS)
            : [],
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
        return {
          ...currentState,
          artifacts: Array.isArray(persisted?.artifacts)
            ? persisted.artifacts.filter(isScopedMobileArtifact).slice(0, MAX_ARTIFACTS)
            : [],
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

/** Central account-teardown entry point. Local artifacts are preserved. */
export function clearAccountScopedArtifactState(): void {
  useArtifactStore.getState().clearAccountScopedArtifacts();
}

// ---------------------------------------------------------------------------
// Extraction helpers (called from chatExecutionStore after stream completion)
// ---------------------------------------------------------------------------

/**
 * Map chat Artifact.type (canonical) to MobileArtifactKind (gallery).
 * 'email' and 'image' are closest to 'document' for display purposes.
 */
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

/**
 * Derive per-kind accent color from the current theme palette.
 * Accepts any object with the four required color keys so this function is
 * usable both inside React components (passing useThemeColors()) and outside
 * (passing the _artifactThemeColors constant in chatExecutionStore).
 */
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

/**
 * Build the first N non-empty lines from content, used for card previews.
 */
function buildPreviewLines(content: string, max = 6): string[] {
  return content
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0)
    .slice(0, max);
}

/**
 * Format an ISO date string as a human-readable age label.
 * Produces: "just now", "N min ago", "N hours ago", "N days ago", or a short date.
 */
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

/**
 * Convert a canonical Artifact (from ChatMessage.artifacts) into a
 * MobileArtifact suitable for the gallery. themeColors is passed in so this
 * pure function stays testable without a React context.
 *
 * conversationTitle is used to build sourceLabel; falls back to 'Chat'.
 */
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
    // MobileArtifact is presentation-only and does not persist canonical
    // version timestamps. These placeholders participate only in the shared
    // id/tombstone merge; a matching Cloud row replaces them before render.
    version: 1,
    createdAt: '1970-01-01T00:00:00.000Z',
  };
}

/**
 * Build the visible gallery from locally-derived artifacts plus the
 * server-authoritative Cloud overlay. The shared canonical merge owns
 * identity/tombstone semantics; this adapter preserves Mobile presentation
 * fields for unrelated local artifacts and maps only Cloud winners.
 */
export function mergeMobileArtifactsForGallery(
  local: ReadonlyArray<MobileArtifact>,
  cloud: ReadonlyArray<CloudArtifact>,
  themeColors: { teal: string; terraCotta: string; agentThinking: string; agentActive: string },
  cloudOwnerId?: string | null,
): MobileArtifact[] {
  const normalizedOwnerId = normalizedCloudOwnerId(cloudOwnerId);
  // A pulled Cloud overlay without an owner is legacy/mixed data. Fail closed
  // rather than showing it to whichever Clerk account happens to sign in.
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

/** Build the durable Artifacts-panel projection for one generated image turn. */
export function generatedImageToMobileArtifact(input: {
  messageId: string;
  imagePath: string;
  prompt?: string;
  createdAt: string;
  conversationTitle: string;
  provenance: MobileArtifactProvenance;
  /** Semantic image accent resolved by the caller's active theme. */
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

// ---------------------------------------------------------------------------
// Canonical derivation delegate
// ---------------------------------------------------------------------------

/**
 * Derive MobileArtifacts from a markdown message by delegating extraction and
 * identity to the shared `deriveArtifacts` service, then mapping each
 * `SharedArtifact` to the mobile presentation type.
 *
 * This is the ONLY call site for artifact extraction. `codeBlocksToMobileArtifacts`
 * and `extractCodeBlocks` have been removed — all derivation is now canonical.
 *
 * - ids: deterministic uuidv5(conversationId:messageId:ordinal) — same as web/desktop.
 * - Gallery policy: include: 'code', minCodeLines: 4 (unchanged from fork).
 * - language: 'text' sentinel (unlabeled blocks) is mapped back to undefined so
 *   the gallery card falls back to the kind label rather than showing "text".
 * - kind: toMobileKind(shared.type) — html/svg/react/mermaid blocks now correctly
 *   map to 'document' instead of the fork's hardcoded 'code'. This is intentional
 *   and matches the future direction (those block types are not code gallery items).
 */
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
      title: s.title,
      kind,
      // 'text' is the shared service's sentinel for unlabeled blocks; map to
      // undefined so the gallery card shows the kind label instead of "text".
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

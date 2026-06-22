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
 * Derivation is delegated to @agiworkforce/services `deriveArtifacts` — the
 * ONE canonical place across web, desktop, and mobile (shared-packages-
 * consolidation-plan-2026-06-21.md §3). Mobile-specific PRESENTATION helpers
 * (kind mapping, accent colors, preview lines, age label) remain here.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import { deriveArtifacts } from '@agiworkforce/services';
import type { MobileArtifact, MobileArtifactKind } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ARTIFACTS = 200;

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
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useArtifactStore = create<ArtifactStoreState>()(
  persist(
    (set, get) => ({
      artifacts: [],

      addArtifacts: (incoming) => {
        if (incoming.length === 0) return;
        const existing = get().artifacts;
        const existingIds = new Set(existing.map((a) => a.id));
        const novel = incoming.filter((a) => !existingIds.has(a.id));
        if (novel.length === 0) return;
        set({ artifacts: [...novel, ...existing] });
      },

      removeArtifact: (id) => {
        set((state) => ({ artifacts: state.artifacts.filter((a) => a.id !== id) }));
      },

      clearArtifacts: () => set({ artifacts: [] }),
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
      }),
    },
  ),
);

rehydrateWhenMmkvReady(useArtifactStore, 'artifactStore');

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
): MobileArtifact {
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
): MobileArtifact[] {
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
    };
  });
}

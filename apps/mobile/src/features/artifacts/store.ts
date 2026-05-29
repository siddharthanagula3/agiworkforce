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
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
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
// Fenced-code-block extractor
// ---------------------------------------------------------------------------

/** A fenced code block parsed from a markdown string. */
export interface ParsedCodeBlock {
  language: string;
  content: string;
}

const FENCED_CODE_RE = /```(\w*)\n([\s\S]*?)```/g;

/**
 * Extract all fenced code blocks from a markdown string.
 * Returns only blocks whose non-empty line count is at least MIN_CODE_LINES —
 * single-line inline snippets are not gallery-worthy.
 */
const MIN_CODE_LINES = 4;

export function extractCodeBlocks(text: string): ParsedCodeBlock[] {
  const blocks: ParsedCodeBlock[] = [];
  let match: RegExpExecArray | null;
  FENCED_CODE_RE.lastIndex = 0;
  while ((match = FENCED_CODE_RE.exec(text)) !== null) {
    const language = (match[1] ?? '').trim();
    const content = (match[2] ?? '').trimEnd();
    if (content.split('\n').filter((l) => l.trim().length > 0).length >= MIN_CODE_LINES) {
      blocks.push({ language, content });
    }
  }
  return blocks;
}

const MAX_TITLE_CONTENT_CHARS = 60;

/**
 * Derive a human-readable title from a code block's first non-empty line
 * (e.g. a comment, function signature, or markdown heading).
 * Falls back to "${language} snippet" or "Code snippet".
 */
export function titleFromCodeBlock(block: ParsedCodeBlock, index: number): string {
  const lines = block.content.split('\n').filter((l) => l.trim().length > 0);
  const first = lines[0] ?? '';
  // Strip common comment/heading markers
  const cleaned = first
    .replace(/^#+\s+/, '')
    .replace(/^\/\/+\s*/, '')
    .replace(/^#\s*/, '')
    .trim();
  if (cleaned.length > 2 && cleaned.length <= MAX_TITLE_CONTENT_CHARS) {
    return cleaned;
  }
  const lang = block.language ? `${block.language} snippet` : 'Code snippet';
  return index === 0 ? lang : `${lang} ${index + 1}`;
}

/**
 * Convert fenced code blocks extracted from an LLM response into MobileArtifacts.
 * messageId is used to generate stable, collision-resistant IDs.
 */
export function codeBlocksToMobileArtifacts(
  blocks: ParsedCodeBlock[],
  messageId: string,
  createdAt: string,
  conversationTitle: string,
  themeColors: { teal: string; terraCotta: string; agentThinking: string; agentActive: string },
): MobileArtifact[] {
  return blocks.map((block, i) => {
    const kind: MobileArtifactKind = 'code';
    return {
      id: `${messageId}_code_${i}`,
      title: titleFromCodeBlock(block, i),
      kind,
      language: block.language || undefined,
      content: block.content,
      ageLabel: formatAgeLabel(createdAt),
      sourceLabel: conversationTitle || 'Chat',
      accentColor: accentColorForKind(kind, themeColors),
      previewLines: buildPreviewLines(block.content),
    };
  });
}

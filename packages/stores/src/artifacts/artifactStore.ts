/**
 * Shared, platform-agnostic artifact store (consolidation Step 1b).
 *
 * Returns a Zustand **vanilla** store (`createStore`) so each surface wraps it with its own
 * React bindings + persistence — exactly like {@link createChatStore}. PURE: no `next/`, no
 * `@tauri-apps`, no DOM. Operates on the canonical {@link SharedArtifact} (from
 * `@agiworkforce/types`); each surface maps it to its own view type (web `ArtifactData`,
 * mobile `MobileArtifact`).
 *
 * Replaces the three forked artifact stores (web `features/chat/stores/artifacts-store.ts`,
 * desktop Tauri-SQLite store, mobile MMKV store) — see
 * `docs/plans/shared-packages-consolidation-plan-2026-06-21.md` §4 (Step 1b).
 *
 * Versioning is CONTENT-keyed: re-upserting an artifact with identical content is idempotent
 * (so deterministic re-derivation never spuriously bumps a version, despite changing
 * timestamps); upserting the SAME id with DIFFERENT content appends a new version. This makes
 * derived artifacts stable and editable artifacts versioned, on one model.
 *
 * @module artifacts/artifactStore
 */

import { createStore, type StoreApi } from 'zustand/vanilla';
import type { SharedArtifact } from '@agiworkforce/types';

export interface ArtifactStoreState {
  /** Current (latest-version) artifacts, in insertion order. */
  artifacts: SharedArtifact[];
  /** Full version history per artifact id (index 0 = v1 … last = current). */
  versionsById: Record<string, SharedArtifact[]>;
  /** The artifact shown in the viewer/panel. */
  selectedArtifactId: string | null;
  /** Whether the artifact side-panel is open. */
  panelOpen: boolean;

  // --- mutations ---
  /** Add a new artifact, or version-bump an existing id when its content changed. */
  upsertArtifact: (artifact: SharedArtifact) => void;
  upsertArtifacts: (artifacts: SharedArtifact[]) => void;
  removeArtifact: (id: string) => void;
  clearConversation: (conversationId: string) => void;
  clearAll: () => void;

  // --- selectors (pure reads) ---
  getArtifact: (id: string) => SharedArtifact | undefined;
  getArtifactVersions: (id: string) => SharedArtifact[];
  getConversationArtifacts: (conversationId: string) => SharedArtifact[];

  // --- ui ---
  selectArtifact: (id: string | null) => void;
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  /** Select an artifact AND open the panel (the inline-card → split-view action). */
  openArtifact: (id: string) => void;
}

export interface CreateArtifactStoreOptions {
  /**
   * Cap on retained artifacts (e.g. mobile MMKV cap of 200). When adding a NEW artifact id
   * beyond the cap, the oldest is dropped (with its version history). Default: unlimited.
   */
  maxArtifacts?: number;
}

export type ArtifactStore = StoreApi<ArtifactStoreState>;

interface Collection {
  artifacts: SharedArtifact[];
  versionsById: Record<string, SharedArtifact[]>;
}

/** Pure reducer: add/version-bump one artifact. Idempotent when content is unchanged. */
function upsertOne(state: Collection, incoming: SharedArtifact, maxArtifacts?: number): Collection {
  const existing = state.artifacts.find((a) => a.id === incoming.id);

  if (!existing) {
    let artifacts = [...state.artifacts, incoming];
    const versionsById = { ...state.versionsById, [incoming.id]: [incoming] };
    // Enforce the cap by dropping the oldest distinct artifact.
    if (maxArtifacts && maxArtifacts > 0 && artifacts.length > maxArtifacts) {
      const dropped = artifacts[0]!;
      artifacts = artifacts.slice(1);
      delete versionsById[dropped.id];
    }
    return { artifacts, versionsById };
  }

  // Idempotent: identical content (ignoring timestamps) is a no-op — deterministic
  // re-derivation must not spuriously bump versions.
  if (existing.content === incoming.content) return state;

  // Content changed (an edit) → append a new version with an incremented number.
  const nextVersion: SharedArtifact = {
    ...incoming,
    version: existing.version + 1,
    createdAt: existing.createdAt,
    updatedAt: incoming.updatedAt ?? incoming.createdAt,
  };
  return {
    artifacts: state.artifacts.map((a) => (a.id === incoming.id ? nextVersion : a)),
    versionsById: {
      ...state.versionsById,
      [incoming.id]: [...(state.versionsById[incoming.id] ?? [existing]), nextVersion],
    },
  };
}

export function createArtifactStore(options: CreateArtifactStoreOptions = {}): ArtifactStore {
  const { maxArtifacts } = options;

  return createStore<ArtifactStoreState>((set, get) => ({
    artifacts: [],
    versionsById: {},
    selectedArtifactId: null,
    panelOpen: false,

    upsertArtifact: (artifact) => set((s) => upsertOne(s, artifact, maxArtifacts)),

    upsertArtifacts: (incoming) =>
      set((s) => incoming.reduce<Collection>((acc, a) => upsertOne(acc, a, maxArtifacts), s)),

    removeArtifact: (id) =>
      set((s) => {
        const versionsById = { ...s.versionsById };
        delete versionsById[id];
        return {
          artifacts: s.artifacts.filter((a) => a.id !== id),
          versionsById,
          selectedArtifactId: s.selectedArtifactId === id ? null : s.selectedArtifactId,
        };
      }),

    clearConversation: (conversationId) =>
      set((s) => {
        const versionsById = { ...s.versionsById };
        for (const a of s.artifacts) {
          if (a.conversationId === conversationId) delete versionsById[a.id];
        }
        const artifacts = s.artifacts.filter((a) => a.conversationId !== conversationId);
        const stillSelected =
          s.selectedArtifactId && artifacts.some((a) => a.id === s.selectedArtifactId);
        return {
          artifacts,
          versionsById,
          selectedArtifactId: stillSelected ? s.selectedArtifactId : null,
        };
      }),

    clearAll: () => set({ artifacts: [], versionsById: {}, selectedArtifactId: null }),

    getArtifact: (id) => get().artifacts.find((a) => a.id === id),
    getArtifactVersions: (id) => get().versionsById[id] ?? [],
    getConversationArtifacts: (conversationId) =>
      get().artifacts.filter((a) => a.conversationId === conversationId),

    selectArtifact: (id) => set({ selectedArtifactId: id }),
    setPanelOpen: (open) => set({ panelOpen: open }),
    togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
    openArtifact: (id) => set({ selectedArtifactId: id, panelOpen: true }),
  }));
}

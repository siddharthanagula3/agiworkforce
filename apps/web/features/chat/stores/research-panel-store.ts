'use client';

import { create } from 'zustand';

// ============================================================================
// Types
// ============================================================================

export interface ResearchSource {
  url: string;
  title: string;
  snippet?: string;
  favicon?: string;
  citationIndex?: number;
}

interface ResearchPanelState {
  panelOpen: boolean;
  sources: ResearchSource[];
  query?: string;
  /**
   * The conversation the current `sources` belong to. The Sources panel must be
   * scoped per-chat: a chat that did NOT run a web search should show no sources,
   * not the leftover sources from a previous chat. Consumers compare this against
   * the active conversation id and treat a mismatch as "no sources".
   */
  conversationId: string | null;
}

interface ResearchPanelActions {
  openPanel: (conversationId: string | null, sources: ResearchSource[], query?: string) => void;
  closePanel: () => void;
  togglePanel: () => void;
  setSources: (conversationId: string | null, sources: ResearchSource[], query?: string) => void;
  /** Returns the sources only if they belong to the given conversation (else empty). */
  sourcesFor: (conversationId: string | null | undefined) => {
    sources: ResearchSource[];
    query?: string;
  };
}

// ============================================================================
// Store
// ============================================================================

export const useResearchPanelStore = create<ResearchPanelState & ResearchPanelActions>()(
  (set, get) => ({
    panelOpen: false,
    sources: [],
    query: undefined,
    conversationId: null,

    openPanel: (conversationId, sources, query) =>
      set({ panelOpen: true, sources, query, conversationId }),
    closePanel: () => set({ panelOpen: false }),
    togglePanel: () => set((state) => ({ panelOpen: !state.panelOpen })),
    setSources: (conversationId, sources, query) => set({ sources, query, conversationId }),
    sourcesFor: (conversationId) => {
      const state = get();
      if (!conversationId || state.conversationId !== conversationId) {
        return { sources: [], query: undefined };
      }
      return { sources: state.sources, query: state.query };
    },
  }),
);

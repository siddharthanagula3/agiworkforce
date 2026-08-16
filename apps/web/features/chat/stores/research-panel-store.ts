'use client';

import { create } from 'zustand';

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
  conversationId: string | null;
}

interface ResearchPanelActions {
  openPanel: (conversationId: string | null, sources: ResearchSource[], query?: string) => void;
  closePanel: () => void;
  togglePanel: () => void;
  setSources: (conversationId: string | null, sources: ResearchSource[], query?: string) => void;
  sourcesFor: (conversationId: string | null | undefined) => {
    sources: ResearchSource[];
    query?: string;
  };
}

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

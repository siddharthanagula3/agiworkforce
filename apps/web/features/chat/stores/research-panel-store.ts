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
  messageId: string | null;
  cited: ResearchSource[];
  more: ResearchSource[];
  query?: string;
  conversationId: string | null;
}

interface ResearchPanelActions {
  openPanel: (
    conversationId: string | null,
    messageId: string,
    cited: ResearchSource[],
    more: ResearchSource[],
    query?: string,
  ) => void;
  closePanel: () => void;
  togglePanel: () => void;
  setSources: (
    conversationId: string | null,
    messageId: string,
    cited: ResearchSource[],
    more: ResearchSource[],
    query?: string,
  ) => void;
  sourcesFor: (conversationId: string | null | undefined) => {
    messageId: string | null;
    cited: ResearchSource[];
    more: ResearchSource[];
    query?: string;
  };
}

export const useResearchPanelStore = create<ResearchPanelState & ResearchPanelActions>()(
  (set, get) => ({
    panelOpen: false,
    messageId: null,
    cited: [],
    more: [],
    query: undefined,
    conversationId: null,

    openPanel: (conversationId, messageId, cited, more, query) =>
      set({ panelOpen: true, messageId, cited, more, query, conversationId }),
    closePanel: () => set({ panelOpen: false }),
    togglePanel: () => set((state) => ({ panelOpen: !state.panelOpen })),
    setSources: (conversationId, messageId, cited, more, query) =>
      set((state) => (state.panelOpen ? state : { cited, more, query, conversationId, messageId })),
    sourcesFor: (conversationId) => {
      const state = get();
      if (!conversationId || state.conversationId !== conversationId) {
        return { messageId: null, cited: [], more: [], query: undefined };
      }
      return {
        messageId: state.messageId,
        cited: state.cited,
        more: state.more,
        query: state.query,
      };
    },
  }),
);

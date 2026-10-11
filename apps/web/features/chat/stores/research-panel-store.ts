'use client';

import type { AgentEventSource, ManagedMemoryCitations } from '@agiworkforce/types';
import { create } from 'zustand';

export interface ResearchSource extends AgentEventSource {
  favicon?: string;
  /** When the page was published, when the search backend reported it. */
  publishedDate?: string;
  retrievedAt?: string;
  citationIndex?: number;
}

interface ResearchPanelState {
  panelOpen: boolean;
  messageId: string | null;
  cited: ResearchSource[];
  more: ResearchSource[];
  query?: string;
  memories: ManagedMemoryCitations | null;
  conversationId: string | null;
}

interface ResearchPanelActions {
  openPanel: (
    conversationId: string | null,
    messageId: string,
    cited: ResearchSource[],
    more: ResearchSource[],
    query?: string,
    memories?: ManagedMemoryCitations | null,
  ) => void;
  closePanel: () => void;
  togglePanel: () => void;
  setSources: (
    conversationId: string | null,
    messageId: string,
    cited: ResearchSource[],
    more: ResearchSource[],
    query?: string,
    memories?: ManagedMemoryCitations | null,
  ) => void;
  sourcesFor: (conversationId: string | null | undefined) => {
    messageId: string | null;
    cited: ResearchSource[];
    more: ResearchSource[];
    query?: string;
    memories: ManagedMemoryCitations | null;
  };
}

export const useResearchPanelStore = create<ResearchPanelState & ResearchPanelActions>()(
  (set, get) => ({
    panelOpen: false,
    messageId: null,
    cited: [],
    more: [],
    query: undefined,
    memories: null,
    conversationId: null,

    openPanel: (conversationId, messageId, cited, more, query, memories = null) =>
      set({ panelOpen: true, messageId, cited, more, query, memories, conversationId }),
    closePanel: () => set({ panelOpen: false }),
    togglePanel: () => set((state) => ({ panelOpen: !state.panelOpen })),
    setSources: (conversationId, messageId, cited, more, query, memories = null) =>
      set((state) =>
        state.panelOpen ? state : { cited, more, query, memories, conversationId, messageId },
      ),
    sourcesFor: (conversationId) => {
      const state = get();
      if (!conversationId || state.conversationId !== conversationId) {
        return { messageId: null, cited: [], more: [], query: undefined, memories: null };
      }
      return {
        messageId: state.messageId,
        cited: state.cited,
        more: state.more,
        query: state.query,
        memories: state.memories,
      };
    },
  }),
);

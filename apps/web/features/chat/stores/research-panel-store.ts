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
}

interface ResearchPanelActions {
  openPanel: (sources: ResearchSource[], query?: string) => void;
  closePanel: () => void;
  togglePanel: () => void;
  setSources: (sources: ResearchSource[], query?: string) => void;
}

// ============================================================================
// Store
// ============================================================================

export const useResearchPanelStore = create<ResearchPanelState & ResearchPanelActions>()((set) => ({
  panelOpen: false,
  sources: [],
  query: undefined,

  openPanel: (sources, query) => set({ panelOpen: true, sources, query }),
  closePanel: () => set({ panelOpen: false }),
  togglePanel: () => set((state) => ({ panelOpen: !state.panelOpen })),
  setSources: (sources, query) => set({ sources, query }),
}));

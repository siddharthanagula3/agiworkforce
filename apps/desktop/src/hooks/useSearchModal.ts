/**
 * useSearchModal
 *
 * Lightweight Zustand store for controlling the unified Spotlight Search modal
 * (Cmd+K). Kept separate from the large unifiedChatStore so the modal can be
 * opened/closed from anywhere without pulling in chat state.
 */
import { create } from 'zustand';

interface SearchModalState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useSearchModal = create<SearchModalState>()((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}));

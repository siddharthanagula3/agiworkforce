/**
 * mentionStore — surface-agnostic store for @mention typeaheads.
 *
 * Tracks the active mention trigger (@skill or @file), the query text,
 * and the currently highlighted cursor index in the results list.
 *
 * Phase A Slice 5 (new store for SkillMentionPicker + FileMentionPicker)
 */
import { create } from 'zustand';

export type MentionTrigger = '@skill' | '@file' | null;

interface MentionState {
  /** Which mention type is active, or null when no mention is open. */
  activeTrigger: MentionTrigger;
  /** Raw text the user typed after the @ prefix. */
  query: string;
  /** Highlighted item index in the picker list. */
  cursorIndex: number;

  openMention: (trigger: MentionTrigger, query?: string) => void;
  closeMention: () => void;
  setQuery: (query: string) => void;
  setCursorIndex: (index: number) => void;
  moveCursor: (direction: 'up' | 'down', resultCount: number) => void;
}

export const useMentionStore = create<MentionState>()((set, get) => ({
  activeTrigger: null,
  query: '',
  cursorIndex: 0,

  openMention: (trigger, query = '') => set({ activeTrigger: trigger, query, cursorIndex: 0 }),
  closeMention: () => set({ activeTrigger: null, query: '', cursorIndex: 0 }),
  setQuery: (query) => set({ query, cursorIndex: 0 }),
  setCursorIndex: (index) => set({ cursorIndex: index }),
  moveCursor: (direction, resultCount) => {
    if (resultCount === 0) return;
    const { cursorIndex } = get();
    if (direction === 'down') {
      set({ cursorIndex: (cursorIndex + 1) % resultCount });
    } else {
      set({ cursorIndex: cursorIndex === 0 ? resultCount - 1 : cursorIndex - 1 });
    }
  },
}));

// ── Selectors ─────────────────────────────────────────────────────────────────

export const selectActiveMentionTrigger = (s: MentionState): MentionTrigger => s.activeTrigger;
export const selectMentionQuery = (s: MentionState): string => s.query;
export const selectMentionCursorIndex = (s: MentionState): number => s.cursorIndex;

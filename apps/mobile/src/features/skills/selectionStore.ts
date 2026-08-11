import { create } from 'zustand';

export interface MobileSkillSelection {
  ownerId: string;
  name: string;
}

interface MobileSkillSelectionState {
  selection: MobileSkillSelection | null;
  selectSkill: (selection: MobileSkillSelection) => void;
  clearSkill: () => void;
}

/**
 * One-shot, in-memory handoff from the Cloud Skills directory to chat.
 *
 * The owner id prevents a selection made by one signed-in account from being
 * shown or sent by another. It is deliberately not persisted: a Skill is
 * execution context for the next Cloud message, not durable user content.
 */
export const useMobileSkillSelectionStore = create<MobileSkillSelectionState>((set) => ({
  selection: null,
  selectSkill: (selection) => set({ selection }),
  clearSkill: () => set({ selection: null }),
}));

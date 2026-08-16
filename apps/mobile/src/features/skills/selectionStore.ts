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

export const useMobileSkillSelectionStore = create<MobileSkillSelectionState>((set) => ({
  selection: null,
  selectSkill: (selection) => set({ selection }),
  clearSkill: () => set({ selection: null }),
}));

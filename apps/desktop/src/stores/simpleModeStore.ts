/**
 * Simple Mode Store
 *
 * Manages the UI complexity level for different user types.
 * Simple mode hides advanced features to make the app more accessible
 * for non-technical users.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UIMode = 'simple' | 'advanced';

interface SimpleModeState {
  // Current UI mode
  mode: UIMode;

  // Whether the user has completed onboarding
  onboardingCompleted: boolean;

  // Whether to show the mode switcher tooltip
  showModeSwitcherHint: boolean;

  // Actions
  setMode: (mode: UIMode) => void;
  toggleMode: () => void;
  completeOnboarding: () => void;
  dismissModeSwitcherHint: () => void;

  // Selectors
  isSimpleMode: () => boolean;
  isAdvancedMode: () => boolean;
}

export const useSimpleModeStore = create<SimpleModeState>()(
  persist(
    (set, get) => ({
      // Default to simple mode for new users
      mode: 'simple',
      onboardingCompleted: false,
      showModeSwitcherHint: true,

      setMode: (mode) => set({ mode }),

      toggleMode: () =>
        set((state) => ({
          mode: state.mode === 'simple' ? 'advanced' : 'simple',
          showModeSwitcherHint: false,
        })),

      completeOnboarding: () => set({ onboardingCompleted: true }),

      dismissModeSwitcherHint: () => set({ showModeSwitcherHint: false }),

      isSimpleMode: () => get().mode === 'simple',
      isAdvancedMode: () => get().mode === 'advanced',
    }),
    {
      name: 'agi-workforce-simple-mode',
      version: 1,
    },
  ),
);

// Selector for use with useShallow
export const selectIsSimpleMode = (state: SimpleModeState) => state.mode === 'simple';
export const selectUIMode = (state: SimpleModeState) => state.mode;

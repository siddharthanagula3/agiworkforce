/**
 * Simple Mode Store - DEPRECATED
 *
 * This store has been consolidated into the unified UI store.
 * This file re-exports from ui.ts for backwards compatibility.
 *
 * @deprecated Import from './ui' instead
 */

export {
  useUIStore as useSimpleModeStore,
  // Types
  type UIMode,
  // Selectors
  selectIsSimpleMode,
  selectUIMode,
  selectOnboardingCompleted,
  selectShowModeSwitcherHint,
} from './ui';

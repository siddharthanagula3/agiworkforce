/**
 * Barrel export for the autofill module.
 * Import from './autofill' rather than from the individual files.
 */

export { detectJobApplication } from './detector';
export type { DetectionResult, DetectedField, DetectedPlatform } from './detector';

export {
  LINKEDIN_SELECTORS,
  LINKEDIN_EASY_APPLY_NEXT_BUTTON_SELECTOR,
  isLinkedInEasyApplyModalOpen,
  getLinkedInEasyApplyStep,
  resolveLinkedInSelector,
  collectResolvableLinkedInFields,
} from './linkedin';

export {
  LEVER_SELECTORS,
  LEVER_EEO_SELECTORS,
  detectLeverCustomFields,
  resolveLeverSelector,
  collectResolvableLeverFields,
} from './lever';
export type { LeverCustomField } from './lever';

export {
  fillFields,
  autofillLinkedIn,
  autofillLever,
  loadAutofillProfile,
  saveAutofillProfile,
  AUTOFILL_PROFILE_STORAGE_KEY,
} from './filler';
export type { FillResult, AutofillResult } from './filler';

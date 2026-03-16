/**
 * Accessibility Library
 * WCAG 2.1 AA Compliance Utilities and Components
 */

// Color contrast utilities
export {
  getLuminance,
  getContrast,
  isAACompliant,
  isAAACompliant,
  getContrastReport,
} from './contrast';

// ARIA helpers
export {
  ARIA,
  ROLES,
  getLiveRegionAttrs,
  KEYS,
  isActivationKey,
  isCloseKey,
  isNavigationKey,
} from './aria';

// Keyboard navigation hooks
export {
  useKeyboardNavigation,
  useFocusTrap,
  useTypeahead,
  type KeyboardNavigationOptions,
} from './useKeyboardNavigation';

// Re-export SkipLinks component
export type { SkipLinksProps } from '../../../components/accessibility/SkipLinks';
export { SkipLinks } from '../../../components/accessibility/SkipLinks';

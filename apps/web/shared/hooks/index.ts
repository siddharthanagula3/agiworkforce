// Shared Hooks - Public API

// Mobile detection
export { useIsMobile } from './use-mobile';

// Toast notifications
export { useToast, toast } from './use-toast';

// Accessibility hooks
export {
  useAccessibility,
  useKeyboardNavigation,
  useAriaAttributes,
  useScreenReaderAnnouncements,
  useColorContrast,
} from './useAccessibility';

// Auto-scroll behavior
export { useAutoScroll } from './useAutoScroll';

// Chat state management
export { useChatState, type ChatMessage, type ChatTab, type ChatState } from './useChatState';

// Theme context
export { useThemeContext } from './useThemeContext';

// Session timeout enforcement
export {
  useSessionTimeout,
  type SessionTimeoutState,
  type UseSessionTimeoutOptions,
  type UseSessionTimeoutReturn,
} from './useSessionTimeout';

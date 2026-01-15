/**
 * Friendly Error Messages
 *
 * Converts technical error messages into plain language
 * that non-technical users can understand.
 *
 * This module re-exports error utilities from @agiworkforce/utils
 * and provides desktop-specific extensions.
 *
 * @module friendlyErrors
 */

// Re-export core error handling from shared package
export { getFriendlyError, formatErrorForChat, getErrorMessage } from '@agiworkforce/utils';
export type { FriendlyError } from '@agiworkforce/utils';

/**
 * Common user-friendly messages for various states
 */
export const FRIENDLY_MESSAGES = {
  loading: [
    'Thinking...',
    'Working on it...',
    'Let me figure this out...',
    'Processing your request...',
    'Just a moment...',
  ],
  success: ['Done!', 'All set!', 'Got it!', 'Here you go!'],
  empty: {
    title: 'Start a conversation',
    subtitle: "Ask me anything - I'm here to help!",
  },
  noResults: {
    title: "I couldn't find anything",
    subtitle: 'Try rephrasing your question or asking something different.',
  },
} as const;

/**
 * Get a random loading message
 */
export function getLoadingMessage(): string {
  const messages = FRIENDLY_MESSAGES.loading;
  return messages[Math.floor(Math.random() * messages.length)] || messages[0] || 'Thinking...';
}

/**
 * Message utility functions for AGI Workforce Desktop
 * Created: 2025-11-25
 */

/**
 * Determines whether to show the Claude planning/reasoning card for a message.
 *
 * Planning cards should only appear for document-like tasks (writing, drafting, etc.),
 * not for simple greetings or Q&A interactions.
 *
 * @param userMessage - The user's input message that triggered the response
 * @param metadata - Optional message metadata
 * @returns true if the planning card should be shown, false otherwise
 */
export function shouldShowClaudePlanningCard(
  userMessage: string,
  metadata?: { type?: string; [key: string]: any },
): boolean {
  // Always show if explicitly marked as reasoning
  if (metadata?.type === 'reasoning') {
    return true;
  }

  // Don't show planning card if no user message context
  if (!userMessage || typeof userMessage !== 'string') {
    return false;
  }

  const lowerContent = userMessage.toLowerCase().trim();

  // Check for simple greetings and small talk - these should NOT show planning
  const simpleGreetings = [
    'hi',
    'hello',
    'hey',
    'thanks',
    'thank you',
    'ok',
    'okay',
    'yes',
    'no',
    'sure',
    'got it',
    'cool',
    'nice',
    'good',
    'bye',
    'goodbye',
    'see you',
    'how are you',
    "what's up",
    'sup',
    'yo',
    'help',
    'stop',
    'continue',
    'proceed',
  ];

  // Check if the message is just a simple greeting (with or without punctuation)
  const strippedContent = lowerContent.replace(/[!?.]/g, '');
  if (simpleGreetings.some((greeting) => strippedContent === greeting)) {
    return false;
  }

  // Check for document-like tasks - these SHOULD show planning
  const documentKeywords = [
    // Writing verbs
    'write',
    'draft',
    'create',
    'compose',
    'generate',
    // Document types
    'document',
    'specification',
    'spec',
    'report',
    'proposal',
    'prompt',
    'markdown',
    '.md',
    'readme',
    'deck',
    'docs',
    'documentation',
    'essay',
    'article',
    'email',
    'pitch',
    'plan',
    'outline',
    'template',
    'guide',
    'tutorial',
    'post',
    'blog',
    'letter',
    'memo',
    'brief',
    'summary',
    // YC-specific
    'yc application',
    'yc answer',
    'y combinator',
    // Other artifact indicators
    'design a',
    'build a',
    'make a',
    'develop a',
    'contract',
    'agreement',
    'terms',
    'policy',
  ];

  // Check if the message contains document-like keywords
  const hasDocumentKeyword = documentKeywords.some((keyword) => lowerContent.includes(keyword));

  // Show planning card for document-like tasks
  return hasDocumentKeyword;
}

/**
 * Gets the previous user message from a conversation for context.
 * Used to determine if a planning card should be shown based on the user's request.
 *
 * @param messages - Array of conversation messages
 * @param currentMessageId - ID of the current assistant message
 * @returns The most recent user message content, or empty string if not found
 */
export function getPreviousUserMessage(
  messages: Array<{ id: string; role: string; content: string }>,
  currentMessageId: string,
): string {
  const currentIndex = messages.findIndex((msg) => msg.id === currentMessageId);
  if (currentIndex === -1) return '';

  // Find the most recent user message before this one
  for (let i = currentIndex - 1; i >= 0; i--) {
    const message = messages[i];
    if (message && message.role === 'user') {
      return message.content;
    }
  }

  return '';
}

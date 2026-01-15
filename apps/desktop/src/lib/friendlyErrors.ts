/**
 * Friendly Error Messages
 *
 * Converts technical error messages into plain language
 * that non-technical users can understand.
 */

interface FriendlyError {
  title: string;
  message: string;
  suggestion?: string;
  icon?: 'error' | 'warning' | 'info' | 'network' | 'payment' | 'auth';
}

/**
 * Convert a technical error into a user-friendly message
 */
export function getFriendlyError(error: Error | string): FriendlyError {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorLower = errorMessage.toLowerCase();

  // Network errors
  if (
    errorLower.includes('network') ||
    errorLower.includes('fetch') ||
    errorLower.includes('econnrefused') ||
    errorLower.includes('etimedout')
  ) {
    return {
      title: 'Connection Problem',
      message: "We couldn't connect to our servers right now.",
      suggestion: 'Please check your internet connection and try again.',
      icon: 'network',
    };
  }

  // Timeout errors
  if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
    return {
      title: 'Taking Too Long',
      message: 'The request is taking longer than expected.',
      suggestion: 'Please try again in a moment. If this continues, try a shorter question.',
      icon: 'warning',
    };
  }

  // Authentication errors
  if (
    errorLower.includes('401') ||
    errorLower.includes('unauthorized') ||
    errorLower.includes('auth') ||
    errorLower.includes('[err_auth_invalid]')
  ) {
    return {
      title: 'Sign In Required',
      message: 'You need to sign in to continue.',
      suggestion: 'Please sign out and sign back in to refresh your session.',
      icon: 'auth',
    };
  }

  // Rate limit errors
  if (
    errorLower.includes('429') ||
    errorLower.includes('rate limit') ||
    errorLower.includes('[err_rate_limit]')
  ) {
    return {
      title: 'Slow Down',
      message: "You're sending messages too quickly.",
      suggestion: 'Please wait a moment before trying again.',
      icon: 'warning',
    };
  }

  // Payment/billing errors
  if (
    errorLower.includes('billing') ||
    errorLower.includes('payment') ||
    errorLower.includes('credits') ||
    errorLower.includes('quota') ||
    errorLower.includes('[err_billing_quota]')
  ) {
    return {
      title: 'Usage Limit Reached',
      message: "You've used up your available credits for now.",
      suggestion: 'You can upgrade your plan or wait until your credits refresh.',
      icon: 'payment',
    };
  }

  // Model/provider errors
  if (
    errorLower.includes('model') ||
    errorLower.includes('provider') ||
    errorLower.includes('[err_provider_error]')
  ) {
    return {
      title: 'AI Temporarily Unavailable',
      message: 'The AI service is having a brief hiccup.',
      suggestion: 'Please try again in a moment. We usually fix these quickly!',
      icon: 'warning',
    };
  }

  // File/attachment errors
  if (
    errorLower.includes('file') ||
    errorLower.includes('attachment') ||
    errorLower.includes('upload')
  ) {
    return {
      title: 'File Problem',
      message: 'There was an issue with the file you uploaded.',
      suggestion: 'Please make sure the file is under 50MB and try again.',
      icon: 'error',
    };
  }

  // Server errors (5xx)
  if (
    errorLower.includes('500') ||
    errorLower.includes('server error') ||
    errorLower.includes('internal')
  ) {
    return {
      title: 'Something Went Wrong',
      message: "We're experiencing technical difficulties.",
      suggestion: 'Our team has been notified. Please try again in a few minutes.',
      icon: 'error',
    };
  }

  // Catch any remaining error codes and provide friendly fallback
  // Strip technical error codes from display
  if (errorLower.includes('[err_')) {
    return {
      title: 'Request Failed',
      message: 'We ran into a problem processing your request.',
      suggestion: 'Please try again in a moment. If this continues, try restarting the app.',
      icon: 'error',
    };
  }

  // Default fallback
  return {
    title: 'Something Went Wrong',
    message: "We weren't able to complete your request.",
    suggestion: 'Please try again. If this keeps happening, try restarting the app.',
    icon: 'error',
  };
}

/**
 * Format an error for display in the chat
 */
export function formatErrorForChat(error: Error | string, isSimpleMode: boolean): string {
  if (!isSimpleMode) {
    // In advanced mode, show more technical details
    const errorMessage = typeof error === 'string' ? error : error.message;
    return `Error: ${errorMessage}`;
  }

  // In simple mode, show friendly message
  const friendly = getFriendlyError(error);

  let formatted = `**${friendly.title}**\n\n${friendly.message}`;
  if (friendly.suggestion) {
    formatted += `\n\n💡 ${friendly.suggestion}`;
  }

  return formatted;
}

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

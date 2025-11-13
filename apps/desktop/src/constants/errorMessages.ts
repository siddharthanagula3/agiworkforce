export interface ErrorMessageDefinition {
  title: string;
  message: string;
  suggestions?: string[];
  helpLink?: string;
  recoverable?: boolean;
}

export const ERROR_MESSAGES: Record<string, ErrorMessageDefinition> = {
  // Network Errors
  NETWORK_ERROR: {
    title: 'Connection Issue',
    message: 'Unable to connect to the server. Please check your internet connection.',
    suggestions: [
      'Check your WiFi or ethernet connection',
      'Disable VPN if enabled',
      'Try again in a moment',
      'Check if the server is down',
    ],
    helpLink: '/docs/troubleshooting/network',
    recoverable: true,
  },

  NETWORK_TIMEOUT: {
    title: 'Request Timeout',
    message: 'The request took too long to complete.',
    suggestions: [
      'Check your internet speed',
      'Try again with a smaller request',
      'The server might be overloaded',
    ],
    recoverable: true,
  },

  API_RATE_LIMIT: {
    title: 'Rate Limit Exceeded',
    message: 'Too many requests. Please wait before trying again.',
    suggestions: [
      'Wait a few minutes before retrying',
      'Consider upgrading your API plan',
      'Reduce the frequency of requests',
    ],
    recoverable: true,
  },

  // File System Errors
  FILE_NOT_FOUND: {
    title: 'File Not Found',
    message: 'The requested file could not be found.',
    suggestions: [
      'Check if the file path is correct',
      'Verify the file still exists',
      'Check file permissions',
    ],
    helpLink: '/docs/troubleshooting/filesystem',
    recoverable: false,
  },

  PERMISSION_DENIED: {
    title: 'Permission Denied',
    message: 'You do not have permission to access this resource.',
    suggestions: [
      'Run the application as administrator',
      'Check file/folder permissions',
      'Contact your system administrator',
    ],
    recoverable: true,
  },

  DISK_FULL: {
    title: 'Disk Full',
    message: 'Not enough disk space to complete the operation.',
    suggestions: [
      'Free up disk space by deleting unnecessary files',
      'Move files to an external drive',
      'Empty the recycle bin',
    ],
    recoverable: false,
  },

  // Database Errors
  DATABASE_LOCKED: {
    title: 'Database Locked',
    message: 'The database is currently locked by another process.',
    suggestions: [
      'Wait a moment and try again',
      'Close other instances of the application',
      'Restart the application',
    ],
    recoverable: true,
  },

  DATABASE_CORRUPTED: {
    title: 'Database Corrupted',
    message: 'The database file appears to be corrupted.',
    suggestions: [
      'Restore from a backup if available',
      'Contact support for assistance',
      'You may need to reset the application',
    ],
    helpLink: '/docs/troubleshooting/database',
    recoverable: false,
  },

  // Authentication Errors
  AUTH_FAILED: {
    title: 'Authentication Failed',
    message: 'Unable to authenticate with the provided credentials.',
    suggestions: [
      'Check your username and password',
      'Verify your API key is correct',
      'Check if your account is active',
    ],
    recoverable: true,
  },

  TOKEN_EXPIRED: {
    title: 'Session Expired',
    message: 'Your session has expired. Please log in again.',
    suggestions: ['Click to re-authenticate', 'Check if your credentials are still valid'],
    recoverable: true,
  },

  // LLM Provider Errors
  LLM_API_ERROR: {
    title: 'LLM Provider Error',
    message: 'An error occurred while communicating with the LLM provider.',
    suggestions: [
      'Check your API key configuration',
      'Verify your account has sufficient credits',
      'Try switching to a different provider',
      'Check the provider status page',
    ],
    helpLink: '/docs/troubleshooting/llm',
    recoverable: true,
  },

  LLM_CONTEXT_LENGTH: {
    title: 'Context Too Long',
    message: 'The conversation context exceeds the model\'s maximum length.',
    suggestions: [
      'Start a new conversation',
      'Summarize the conversation history',
      'Use a model with larger context window',
    ],
    recoverable: false,
  },

  LLM_CONTENT_FILTER: {
    title: 'Content Filtered',
    message: 'The request was blocked by content filtering.',
    suggestions: [
      'Rephrase your request',
      'Remove potentially sensitive content',
      'Review the content policy',
    ],
    recoverable: true,
  },

  // Browser Automation Errors
  BROWSER_NOT_FOUND: {
    title: 'Browser Not Found',
    message: 'The required browser is not installed or cannot be found.',
    suggestions: [
      'Install the required browser',
      'Check the browser installation path',
      'Try using a different browser',
    ],
    helpLink: '/docs/troubleshooting/browser',
    recoverable: false,
  },

  BROWSER_CRASH: {
    title: 'Browser Crashed',
    message: 'The browser automation session crashed unexpectedly.',
    suggestions: [
      'Try the operation again',
      'Update your browser to the latest version',
      'Check system resources (memory, CPU)',
    ],
    recoverable: true,
  },

  ELEMENT_NOT_FOUND: {
    title: 'Element Not Found',
    message: 'Could not find the specified UI element on the page.',
    suggestions: [
      'The page might still be loading',
      'The element selector might be incorrect',
      'The page structure may have changed',
    ],
    recoverable: true,
  },

  // Automation Errors
  AUTOMATION_FAILED: {
    title: 'Automation Failed',
    message: 'The automation task could not be completed.',
    suggestions: [
      'Check if the application is still running',
      'Verify the automation steps are correct',
      'Try running the automation manually first',
    ],
    helpLink: '/docs/troubleshooting/automation',
    recoverable: true,
  },

  UI_ELEMENT_TIMEOUT: {
    title: 'Element Timeout',
    message: 'Waited too long for a UI element to appear.',
    suggestions: [
      'The application might be slow to respond',
      'Increase the timeout duration in settings',
      'Check if the element still exists',
    ],
    recoverable: true,
  },

  // System Errors
  OUT_OF_MEMORY: {
    title: 'Out of Memory',
    message: 'The application ran out of available memory.',
    suggestions: [
      'Close other applications to free up memory',
      'Restart the application',
      'Process smaller amounts of data',
      'Upgrade system RAM if this occurs frequently',
    ],
    recoverable: false,
  },

  SYSTEM_ERROR: {
    title: 'System Error',
    message: 'An unexpected system error occurred.',
    suggestions: [
      'Try the operation again',
      'Restart the application',
      'Check system logs for details',
      'Contact support if the issue persists',
    ],
    recoverable: true,
  },

  // AGI Errors
  AGI_PLANNING_FAILED: {
    title: 'Planning Failed',
    message: 'The AGI planner could not create a plan for the goal.',
    suggestions: [
      'Try rephrasing the goal more specifically',
      'Break down complex goals into smaller steps',
      'Check if the LLM provider is available',
    ],
    recoverable: true,
  },

  AGI_EXECUTION_FAILED: {
    title: 'Execution Failed',
    message: 'The AGI system failed to execute a step.',
    suggestions: [
      'Review the step details in the error log',
      'Check if required tools are available',
      'Try running the step manually',
    ],
    helpLink: '/docs/troubleshooting/agi',
    recoverable: true,
  },

  AGI_TOOL_NOT_FOUND: {
    title: 'Tool Not Available',
    message: 'The required tool is not available or not installed.',
    suggestions: [
      'Install the required tool',
      'Enable the tool in settings',
      'Try using an alternative tool',
    ],
    recoverable: false,
  },

  // Unknown Error
  UNKNOWN_ERROR: {
    title: 'Unknown Error',
    message: 'An unexpected error occurred.',
    suggestions: [
      'Try the operation again',
      'Restart the application',
      'Check the error logs for details',
      'Report this issue if it persists',
    ],
    recoverable: true,
  },
};

/**
 * Get a user-friendly error message for an error type
 */
export function getErrorMessage(errorType: string): ErrorMessageDefinition {
  return ERROR_MESSAGES[errorType] || ERROR_MESSAGES.UNKNOWN_ERROR;
}

/**
 * Format an error with context
 */
export function formatError(
  errorType: string,
  additionalContext?: string
): ErrorMessageDefinition {
  const baseMessage = getErrorMessage(errorType);

  if (additionalContext) {
    return {
      ...baseMessage,
      message: `${baseMessage.message} ${additionalContext}`,
    };
  }

  return baseMessage;
}

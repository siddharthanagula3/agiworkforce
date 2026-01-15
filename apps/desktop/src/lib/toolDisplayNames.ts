/**
 * Tool Display Names
 *
 * Translates technical tool names to user-friendly descriptions
 * for non-technical users in simple mode.
 */

export interface ToolDisplayInfo {
  /** User-friendly name */
  displayName: string;
  /** Active form (e.g., "Searching...") */
  activeForm: string;
  /** Completed form (e.g., "Searched") */
  completedForm: string;
  /** Short description for tooltips */
  description: string;
  /** Icon category for UI */
  category:
    | 'search'
    | 'browser'
    | 'code'
    | 'file'
    | 'terminal'
    | 'media'
    | 'data'
    | 'communication'
    | 'system';
}

/**
 * Mapping of technical tool names to user-friendly display info
 */
const TOOL_DISPLAY_MAP: Record<string, ToolDisplayInfo> = {
  // Browser/Web tools
  browser_navigate: {
    displayName: 'Open website',
    activeForm: 'Opening website...',
    completedForm: 'Opened website',
    description: 'Navigate to a web page',
    category: 'browser',
  },
  browser_click: {
    displayName: 'Click',
    activeForm: 'Clicking...',
    completedForm: 'Clicked',
    description: 'Click on a button or link',
    category: 'browser',
  },
  browser_type: {
    displayName: 'Type text',
    activeForm: 'Typing...',
    completedForm: 'Typed text',
    description: 'Enter text into a form field',
    category: 'browser',
  },
  browser_screenshot: {
    displayName: 'Take screenshot',
    activeForm: 'Taking screenshot...',
    completedForm: 'Captured screenshot',
    description: 'Capture what you see on screen',
    category: 'browser',
  },
  browser_scroll: {
    displayName: 'Scroll page',
    activeForm: 'Scrolling...',
    completedForm: 'Scrolled',
    description: 'Scroll up or down on a page',
    category: 'browser',
  },
  ui_click: {
    displayName: 'Click',
    activeForm: 'Clicking...',
    completedForm: 'Clicked',
    description: 'Click on screen',
    category: 'browser',
  },
  ui_type: {
    displayName: 'Type text',
    activeForm: 'Typing...',
    completedForm: 'Typed text',
    description: 'Enter text',
    category: 'browser',
  },

  // Search tools
  web_search: {
    displayName: 'Search the web',
    activeForm: 'Searching...',
    completedForm: 'Found results',
    description: 'Search for information online',
    category: 'search',
  },
  perplexity_search: {
    displayName: 'Search the web',
    activeForm: 'Searching...',
    completedForm: 'Found results',
    description: 'Search for information with citations',
    category: 'search',
  },
  search: {
    displayName: 'Search',
    activeForm: 'Searching...',
    completedForm: 'Found results',
    description: 'Search for information',
    category: 'search',
  },

  // File tools
  file_read: {
    displayName: 'Read file',
    activeForm: 'Reading file...',
    completedForm: 'Read file',
    description: 'Open and read a file',
    category: 'file',
  },
  file_write: {
    displayName: 'Save file',
    activeForm: 'Saving file...',
    completedForm: 'Saved file',
    description: 'Save content to a file',
    category: 'file',
  },
  file_create: {
    displayName: 'Create file',
    activeForm: 'Creating file...',
    completedForm: 'Created file',
    description: 'Create a new file',
    category: 'file',
  },
  file_delete: {
    displayName: 'Delete file',
    activeForm: 'Deleting file...',
    completedForm: 'Deleted file',
    description: 'Remove a file',
    category: 'file',
  },
  read_file: {
    displayName: 'Read file',
    activeForm: 'Reading file...',
    completedForm: 'Read file',
    description: 'Open and read a file',
    category: 'file',
  },
  write_file: {
    displayName: 'Save file',
    activeForm: 'Saving file...',
    completedForm: 'Saved file',
    description: 'Save content to a file',
    category: 'file',
  },

  // Code tools
  code_execute: {
    displayName: 'Run code',
    activeForm: 'Running code...',
    completedForm: 'Code completed',
    description: 'Execute code',
    category: 'code',
  },
  code_edit: {
    displayName: 'Edit code',
    activeForm: 'Editing code...',
    completedForm: 'Edited code',
    description: 'Make changes to code',
    category: 'code',
  },
  code_analyze: {
    displayName: 'Analyze code',
    activeForm: 'Analyzing...',
    completedForm: 'Analysis complete',
    description: 'Review and understand code',
    category: 'code',
  },

  // Terminal tools
  terminal_execute: {
    displayName: 'Run command',
    activeForm: 'Running command...',
    completedForm: 'Command completed',
    description: 'Execute a system command',
    category: 'terminal',
  },
  shell_execute: {
    displayName: 'Run command',
    activeForm: 'Running command...',
    completedForm: 'Command completed',
    description: 'Execute a terminal command',
    category: 'terminal',
  },
  bash: {
    displayName: 'Run command',
    activeForm: 'Running command...',
    completedForm: 'Command completed',
    description: 'Execute a terminal command',
    category: 'terminal',
  },

  // Media tools
  image_generate: {
    displayName: 'Create image',
    activeForm: 'Creating image...',
    completedForm: 'Image created',
    description: 'Generate a new image',
    category: 'media',
  },
  image_edit: {
    displayName: 'Edit image',
    activeForm: 'Editing image...',
    completedForm: 'Image edited',
    description: 'Modify an existing image',
    category: 'media',
  },
  video_generate: {
    displayName: 'Create video',
    activeForm: 'Creating video...',
    completedForm: 'Video created',
    description: 'Generate a new video',
    category: 'media',
  },

  // Data tools
  database_query: {
    displayName: 'Search database',
    activeForm: 'Searching data...',
    completedForm: 'Found data',
    description: 'Query a database',
    category: 'data',
  },
  data_analyze: {
    displayName: 'Analyze data',
    activeForm: 'Analyzing data...',
    completedForm: 'Analysis complete',
    description: 'Process and analyze data',
    category: 'data',
  },

  // Communication tools
  email_send: {
    displayName: 'Send email',
    activeForm: 'Sending email...',
    completedForm: 'Email sent',
    description: 'Send an email message',
    category: 'communication',
  },
  email_read: {
    displayName: 'Check email',
    activeForm: 'Checking email...',
    completedForm: 'Email retrieved',
    description: 'Read email messages',
    category: 'communication',
  },

  // MCP tools (translate MCP tool IDs)
  mcp__supabase__execute_sql: {
    displayName: 'Run database query',
    activeForm: 'Querying database...',
    completedForm: 'Query complete',
    description: 'Execute a database operation',
    category: 'data',
  },
  mcp__supabase__list_tables: {
    displayName: 'List tables',
    activeForm: 'Listing tables...',
    completedForm: 'Listed tables',
    description: 'View database tables',
    category: 'data',
  },
  mcp__filesystem__read_file: {
    displayName: 'Read file',
    activeForm: 'Reading file...',
    completedForm: 'Read file',
    description: 'Open and read a file',
    category: 'file',
  },
  mcp__filesystem__write_file: {
    displayName: 'Save file',
    activeForm: 'Saving file...',
    completedForm: 'Saved file',
    description: 'Save content to a file',
    category: 'file',
  },

  // System tools
  system_info: {
    displayName: 'Check system',
    activeForm: 'Checking system...',
    completedForm: 'System checked',
    description: 'Get system information',
    category: 'system',
  },
};

/**
 * Get user-friendly display info for a tool
 * Falls back to a cleaned-up version of the technical name if not found
 */
export function getToolDisplayInfo(technicalName: string | undefined | null): ToolDisplayInfo {
  if (!technicalName) {
    return {
      displayName: 'Working',
      activeForm: 'Working...',
      completedForm: 'Done',
      description: 'Processing your request',
      category: 'system',
    };
  }

  // Normalize the name (lowercase, trim)
  const normalized = technicalName.toLowerCase().trim();

  // Direct match
  if (TOOL_DISPLAY_MAP[normalized]) {
    return TOOL_DISPLAY_MAP[normalized];
  }

  // Try without underscores
  const withoutUnderscores = normalized.replace(/_/g, '');
  for (const [key, value] of Object.entries(TOOL_DISPLAY_MAP)) {
    if (key.replace(/_/g, '') === withoutUnderscores) {
      return value;
    }
  }

  // Try partial matches for common patterns
  if (normalized.includes('search') || normalized.includes('find')) {
    return {
      displayName: 'Searching',
      activeForm: 'Searching...',
      completedForm: 'Search complete',
      description: 'Looking for information',
      category: 'search',
    };
  }

  if (
    normalized.includes('browser') ||
    normalized.includes('web') ||
    normalized.includes('navigate')
  ) {
    return {
      displayName: 'Browsing',
      activeForm: 'Loading page...',
      completedForm: 'Page loaded',
      description: 'Working in browser',
      category: 'browser',
    };
  }

  if (normalized.includes('click') || normalized.includes('press')) {
    return {
      displayName: 'Clicking',
      activeForm: 'Clicking...',
      completedForm: 'Clicked',
      description: 'Clicking on element',
      category: 'browser',
    };
  }

  if (normalized.includes('type') || normalized.includes('input') || normalized.includes('fill')) {
    return {
      displayName: 'Typing',
      activeForm: 'Typing...',
      completedForm: 'Text entered',
      description: 'Entering text',
      category: 'browser',
    };
  }

  if (normalized.includes('file') || normalized.includes('read') || normalized.includes('write')) {
    return {
      displayName: 'Working with files',
      activeForm: 'Working with file...',
      completedForm: 'File processed',
      description: 'File operation',
      category: 'file',
    };
  }

  if (normalized.includes('code') || normalized.includes('execute') || normalized.includes('run')) {
    return {
      displayName: 'Running',
      activeForm: 'Running...',
      completedForm: 'Completed',
      description: 'Running code',
      category: 'code',
    };
  }

  if (
    normalized.includes('image') ||
    normalized.includes('video') ||
    normalized.includes('media')
  ) {
    return {
      displayName: 'Processing media',
      activeForm: 'Processing...',
      completedForm: 'Media ready',
      description: 'Working with media',
      category: 'media',
    };
  }

  if (
    normalized.includes('database') ||
    normalized.includes('query') ||
    normalized.includes('sql')
  ) {
    return {
      displayName: 'Database operation',
      activeForm: 'Querying...',
      completedForm: 'Query complete',
      description: 'Database operation',
      category: 'data',
    };
  }

  if (
    normalized.includes('terminal') ||
    normalized.includes('shell') ||
    normalized.includes('bash') ||
    normalized.includes('cmd')
  ) {
    return {
      displayName: 'Running command',
      activeForm: 'Running command...',
      completedForm: 'Command complete',
      description: 'Terminal operation',
      category: 'terminal',
    };
  }

  if (
    normalized.includes('email') ||
    normalized.includes('message') ||
    normalized.includes('send')
  ) {
    return {
      displayName: 'Sending',
      activeForm: 'Sending...',
      completedForm: 'Sent',
      description: 'Sending message',
      category: 'communication',
    };
  }

  // MCP tools - extract the action from mcp__{server}__{action} format
  if (normalized.startsWith('mcp__') || normalized.startsWith('mcp_')) {
    const parts = normalized.split('__').filter(Boolean);
    if (parts.length >= 2) {
      const action = parts[parts.length - 1] || 'working';
      // Convert snake_case to readable form
      const readable = action.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
      return {
        displayName: readable,
        activeForm: `${readable}...`,
        completedForm: `${readable} complete`,
        description: `${readable} operation`,
        category: 'system',
      };
    }
  }

  // Default fallback - clean up the technical name
  const cleanedName = technicalName
    .replace(/^(mcp__|tool_|action_)/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase())
    .trim();

  return {
    displayName: cleanedName || 'Working',
    activeForm: `${cleanedName || 'Working'}...`,
    completedForm: `${cleanedName || 'Task'} complete`,
    description: 'Processing your request',
    category: 'system',
  };
}

/**
 * Get just the friendly display name
 */
export function getFriendlyToolName(technicalName: string | undefined | null): string {
  return getToolDisplayInfo(technicalName).displayName;
}

/**
 * Get the active form (e.g., "Searching...")
 */
export function getToolActiveForm(technicalName: string | undefined | null): string {
  return getToolDisplayInfo(technicalName).activeForm;
}

/**
 * Get the completed form (e.g., "Search complete")
 */
export function getToolCompletedForm(technicalName: string | undefined | null): string {
  return getToolDisplayInfo(technicalName).completedForm;
}

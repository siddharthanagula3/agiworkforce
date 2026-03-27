/**
 * Inline Tool Renderer Registry
 * Maps tool names to their respective React components for inline display
 */

import React from 'react';

export interface ToolResultProps {
  result: {
    data?: unknown;
    status?: 'idle' | 'running' | 'success' | 'error' | 'completed' | 'failed';
    error?: string;
  };
  status?: 'idle' | 'running' | 'success' | 'error' | 'completed' | 'failed';
  onExpand?: (sidecarType: string) => void;
}

// Lazy imports for code splitting
const InlineSearchResults = React.lazy(() =>
  import('./InlineSearchResults').then((m) => ({ default: m.InlineSearchResults })),
);

const InlineCodeDiff = React.lazy(() =>
  import('./InlineCodeDiff').then((m) => ({ default: m.InlineCodeDiff })),
);

const InlineDirectoryList = React.lazy(() =>
  import('./InlineDirectoryList').then((m) => ({ default: m.InlineDirectoryList })),
);

const InlineTerminalOutput = React.lazy(() =>
  import('./InlineTerminalOutput').then((m) => ({ default: m.InlineTerminalOutput })),
);

const InlineImageGeneration = React.lazy(() =>
  import('./InlineMediaGeneration').then((m) => ({ default: m.InlineImageGeneration })),
);

const InlineVideoGeneration = React.lazy(() =>
  import('./InlineMediaGeneration').then((m) => ({ default: m.InlineVideoGeneration })),
);

const InlineDocumentGeneration = React.lazy(() =>
  import('./InlineDocumentGeneration').then((m) => ({ default: m.InlineDocumentGeneration })),
);

const InlineDocumentRead = React.lazy(() =>
  import('./InlineDocumentRead').then((m) => ({ default: m.InlineDocumentRead })),
);

const InlineDocumentSearch = React.lazy(() =>
  import('./InlineDocumentSearch').then((m) => ({ default: m.InlineDocumentSearch })),
);

const InlineArtifactCard = React.lazy(() =>
  import('./InlineArtifactCard').then((m) => ({ default: m.InlineArtifactCard })),
);

const InlineConversationSearch = React.lazy(() =>
  import('./InlineConversationSearch').then((m) => ({ default: m.InlineConversationSearch })),
);

const InlineGitHubPR = React.lazy(() =>
  import('./InlineGitHub').then((m) => ({ default: m.InlineGitHubPR })),
);

const InlineGitHubIssue = React.lazy(() =>
  import('./InlineGitHub').then((m) => ({ default: m.InlineGitHubIssue })),
);

const InlineGitHubCommit = React.lazy(() =>
  import('./InlineGitHub').then((m) => ({ default: m.InlineGitHubCommit })),
);

const InlineDatabaseResults = React.lazy(() =>
  import('./InlineDatabaseResults').then((m) => ({ default: m.InlineDatabaseResults })),
);

const InlineAPIResponse = React.lazy(() =>
  import('./InlineAPIResponse').then((m) => ({ default: m.InlineAPIResponse })),
);

const InlineScreenshot = React.lazy(() =>
  import('./InlineScreenshot').then((m) => ({ default: m.InlineScreenshot })),
);

// Reuse existing components for multiple tool types
const InlineBrowserAutomation = InlineTerminalOutput; // Browser ops usually return structured/text output
const InlineEmailOperation = InlineTerminalOutput; // Reuse terminal style for email
const InlineCalendarOperation = InlineTerminalOutput; // Reuse terminal style for calendar
const InlineCloudOperation = InlineTerminalOutput; // Reuse terminal style for cloud ops
const InlineMemoryOperation = InlineTerminalOutput; // Reuse terminal style for memory
const InlineScheduleOperation = InlineTerminalOutput; // Reuse terminal style for schedule
const InlineProductivityOperation = InlineTerminalOutput; // Reuse terminal style for productivity
const InlineGitOperation = InlineTerminalOutput; // Reuse terminal style for git
const InlineUIControl = InlineTerminalOutput; // UI click/type usually return status payloads
const InlineCodeExecution = InlineTerminalOutput; // Reuse terminal for code execution
const InlineImageAnalysis = InlineSearchResults; // Reuse search results style for image analysis

/**
 * Registry of tool renderers
 * Maps tool/capability names to React components
 */
export const TOOL_RENDERERS: Record<
  string,
  | React.ComponentType<ToolResultProps>
  | React.LazyExoticComponent<React.ComponentType<ToolResultProps>>
> = {
  // ============================================
  // WEB SEARCH & RESEARCH
  // ============================================
  web_search: InlineSearchResults,
  perplexity_search: InlineSearchResults,
  search_web: InlineSearchResults,
  browser_search: InlineSearchResults,

  // ============================================
  // FILE OPERATIONS
  // ============================================
  file_read: InlineCodeDiff,
  file_write: InlineCodeDiff,
  file_edit: InlineCodeDiff,
  file_create: InlineCodeDiff,
  file_delete: InlineCodeDiff,
  code_edit: InlineCodeDiff,

  // Directory/file listing
  file_list: InlineDirectoryList,
  list_directory: InlineDirectoryList,
  list_directory_with_sizes: InlineDirectoryList,
  mcp__filesystem__list_directory: InlineDirectoryList,
  mcp__filesystem__list_allowed_directories: InlineDirectoryList,

  // ============================================
  // MCP FILESYSTEM TOOLS
  // ============================================
  mcp__filesystem__read_file: InlineCodeDiff,
  mcp__filesystem__read_text_file: InlineCodeDiff,
  mcp__filesystem__get_file_info: InlineSearchResults,
  mcp__filesystem__search_files: InlineSearchResults,
  mcp__filesystem__move_file: InlineTerminalOutput,
  mcp__filesystem__create_directory: InlineTerminalOutput,
  mcp__filesystem__write_file: InlineTerminalOutput,
  mcp__filesystem__edit_file: InlineTerminalOutput,

  // ============================================
  // SUPABASE TOOLS
  // ============================================
  mcp__supabase__list_tables: InlineSearchResults,
  mcp__supabase__list_extensions: InlineSearchResults,
  mcp__supabase__list_migrations: InlineSearchResults,
  mcp__supabase__execute_sql: InlineDatabaseResults,
  mcp__supabase__get_logs: InlineSearchResults,
  mcp__supabase__list_edge_functions: InlineSearchResults,

  // ============================================
  // CLAUDE IN CHROME TOOLS
  // ============================================
  mcp__claude_in_chrome__read_page: InlineSearchResults,
  mcp__claude_in_chrome__get_page_text: InlineSearchResults,
  mcp__claude_in_chrome__read_console_messages: InlineSearchResults,
  mcp__claude_in_chrome__read_network_requests: InlineSearchResults,

  // ============================================
  // TERMINAL & CODE EXECUTION
  // ============================================
  terminal_execute: InlineTerminalOutput,
  shell_command: InlineTerminalOutput,
  terminal_run: InlineTerminalOutput,
  bash_execute: InlineTerminalOutput,
  code_execute: InlineCodeExecution,
  code_analyze: InlineCodeDiff,

  // ============================================
  // MEDIA GENERATION (Image & Video)
  // ============================================
  image_generate: InlineImageGeneration,
  media_generate_image: InlineImageGeneration,
  dalle_generate: InlineImageGeneration,
  stable_diffusion_generate: InlineImageGeneration,
  imagen_generate: InlineImageGeneration,
  video_generate: InlineVideoGeneration,
  media_generate_video: InlineVideoGeneration,
  veo_generate: InlineVideoGeneration,

  // ============================================
  // DOCUMENT GENERATION
  // ============================================
  document_create_pdf: InlineDocumentGeneration,
  document_create_word: InlineDocumentGeneration,
  document_create_docx: InlineDocumentGeneration,
  document_create_excel: InlineDocumentGeneration,
  document_create_xlsx: InlineDocumentGeneration,
  document_read: InlineDocumentRead,
  document_extract_text: InlineDocumentRead,
  document_search: InlineDocumentSearch,
  artifact_create: InlineArtifactCard,
  artifact_generate: InlineArtifactCard,
  create_artifact: InlineArtifactCard,
  search_chat_history: InlineConversationSearch,
  search_past_conversations: InlineConversationSearch,
  search_conversations: InlineConversationSearch,
  conversation_search: InlineConversationSearch,
  find_relevant_chats: InlineConversationSearch,

  // ============================================
  // BROWSER AUTOMATION
  // ============================================
  browser_navigate: InlineBrowserAutomation,
  browser_click: InlineBrowserAutomation,
  browser_type: InlineBrowserAutomation,
  browser_extract: InlineBrowserAutomation,
  browser_autofill_job_application: InlineBrowserAutomation,
  browser_wait_for_selector: InlineBrowserAutomation,
  browser_get_text: InlineBrowserAutomation,
  browser_get_attribute: InlineBrowserAutomation,
  browser_screenshot: InlineScreenshot,
  browser_hover: InlineBrowserAutomation,
  browser_focus: InlineBrowserAutomation,
  browser_scroll_into_view: InlineBrowserAutomation,
  browser_query_all: InlineBrowserAutomation,
  browser_execute_async_js: InlineBrowserAutomation,
  browser_get_element_state: InlineBrowserAutomation,
  browser_wait_for_interactive: InlineBrowserAutomation,
  browser_select_option: InlineBrowserAutomation,
  browser_check: InlineBrowserAutomation,
  browser_uncheck: InlineBrowserAutomation,
  browser_get_url: InlineBrowserAutomation,
  browser_get_title: InlineBrowserAutomation,
  browser_go_back: InlineBrowserAutomation,
  browser_go_forward: InlineBrowserAutomation,
  browser_reload: InlineBrowserAutomation,
  browser_wait_for_navigation: InlineBrowserAutomation,
  browser_get_dom_snapshot: InlineBrowserAutomation,
  extension_page_context: InlineTerminalOutput,
  extension_task_result: InlineTerminalOutput,

  // ============================================
  // UI AUTOMATION
  // ============================================
  ui_click: InlineUIControl,
  ui_type: InlineUIControl,
  ui_screenshot: InlineScreenshot,

  // ============================================
  // IMAGE ANALYSIS & OCR
  // ============================================
  image_ocr: InlineImageAnalysis,
  image_analyze: InlineImageAnalysis,

  // ============================================
  // EMAIL OPERATIONS
  // ============================================
  email_send: InlineEmailOperation,
  email_fetch: InlineEmailOperation,

  // ============================================
  // CALENDAR OPERATIONS
  // ============================================
  calendar_create_event: InlineCalendarOperation,
  calendar_list_events: InlineCalendarOperation,

  // ============================================
  // CLOUD OPERATIONS
  // ============================================
  cloud_upload: InlineCloudOperation,
  cloud_download: InlineCloudOperation,
  api_upload: InlineAPIResponse,
  api_download: InlineAPIResponse,

  // ============================================
  // PRODUCTIVITY (Task Management)
  // ============================================
  productivity_create_task: InlineProductivityOperation,

  // ============================================
  // MEMORY OPERATIONS
  // ============================================
  memory_remember: InlineMemoryOperation,
  memory_recall: InlineMemoryOperation,
  memory_search: InlineSearchResults,
  memory_forget: InlineMemoryOperation,

  // ============================================
  // SCHEDULE OPERATIONS
  // ============================================
  schedule_reminder: InlineScheduleOperation,
  schedule_recurring_task: InlineScheduleOperation,
  cancel_scheduled_task: InlineScheduleOperation,
  list_scheduled_tasks: InlineScheduleOperation,

  // ============================================
  // GIT OPERATIONS
  // ============================================
  git_init: InlineGitOperation,
  git_add: InlineGitOperation,
  git_commit: InlineGitOperation,
  git_push: InlineGitOperation,
  git_status: InlineGitOperation,
  git_clone: InlineGitOperation,
  github_create_repo: InlineGitHubPR,

  // ============================================
  // GITHUB OPERATIONS
  // ============================================
  github_pr_create: InlineGitHubPR,
  github_pr_list: InlineGitHubPR,
  github_issue_create: InlineGitHubIssue,
  github_issue_list: InlineGitHubIssue,
  github_commit: InlineGitHubCommit,
  github_push: InlineGitHubCommit,

  // ============================================
  // DATABASE OPERATIONS
  // ============================================
  db_query: InlineDatabaseResults,
  database_query: InlineDatabaseResults,
  db_execute: InlineDatabaseResults,
  sql_query: InlineDatabaseResults,
  db_transaction_begin: InlineDatabaseResults,
  db_transaction_commit: InlineDatabaseResults,
  db_transaction_rollback: InlineDatabaseResults,

  // ============================================
  // API OPERATIONS
  // ============================================
  api_call: InlineAPIResponse,
  execute_api_call: InlineAPIResponse,
  http_request: InlineAPIResponse,
  fetch_url: InlineAPIResponse,

  // ============================================
  // SCREENSHOT & CAPTURE
  // ============================================
  screenshot: InlineScreenshot,
  computer_use_capture_screen: InlineScreenshot,
  computer_use_preview: InlineScreenshot,
  __server__computer_use_preview: InlineScreenshot,
  automation_screenshot: InlineScreenshot,
  capture_screen: InlineScreenshot,
  automation_ocr: InlineScreenshot,
  computer_use_click: InlineUIControl,
  computer_use_type: InlineUIControl,
  computer_use_move_mouse: InlineUIControl,

  // ============================================
  // LLM REASONING
  // ============================================
  llm_reason: InlineSearchResults,
};

/**
 * Get renderer for a specific tool
 */
export function getToolRenderer(
  toolName: string | undefined,
):
  | React.ComponentType<ToolResultProps>
  | React.LazyExoticComponent<React.ComponentType<ToolResultProps>>
  | null {
  if (!toolName) return null;
  if (TOOL_RENDERERS[toolName]) {
    return TOOL_RENDERERS[toolName];
  }

  // Fallbacks for dynamically registered tools (especially MCP/app tools).
  if (toolName.startsWith('mcp__')) return InlineTerminalOutput;
  if (toolName.includes('search') || toolName.includes('fetch')) return InlineSearchResults;
  if (toolName.includes('screenshot') || toolName.includes('capture')) return InlineScreenshot;

  return InlineTerminalOutput;
}

/**
 * Check if a tool has an inline renderer
 */
export function hasInlineRenderer(toolName: string | undefined): boolean {
  return getToolRenderer(toolName) !== null;
}

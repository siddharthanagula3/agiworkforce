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

/**
 * Registry of tool renderers
 * Maps tool/capability names to React components
 */
export const TOOL_RENDERERS: Record<
  string,
  | React.ComponentType<ToolResultProps>
  | React.LazyExoticComponent<React.ComponentType<ToolResultProps>>
> = {
  // Web search and browsing
  web_search: InlineSearchResults,
  perplexity_search: InlineSearchResults,
  search_web: InlineSearchResults,
  browser_search: InlineSearchResults,

  // Code operations
  file_read: InlineCodeDiff,
  file_write: InlineCodeDiff,
  file_edit: InlineCodeDiff,
  file_create: InlineCodeDiff,
  code_edit: InlineCodeDiff,

  // Directory/file listing operations (AUDIT-UI-024)
  file_list: InlineDirectoryList,
  list_directory: InlineDirectoryList,
  list_directory_with_sizes: InlineDirectoryList,
  mcp__filesystem__list_directory: InlineDirectoryList,
  mcp__filesystem__list_allowed_directories: InlineDirectoryList,

  // Terminal operations
  terminal_execute: InlineTerminalOutput,
  shell_command: InlineTerminalOutput,
  terminal_run: InlineTerminalOutput,
  bash_execute: InlineTerminalOutput,

  // Media generation
  image_generate: InlineImageGeneration,
  media_generate_image: InlineImageGeneration,
  dalle_generate: InlineImageGeneration,
  stable_diffusion_generate: InlineImageGeneration,
  imagen_generate: InlineImageGeneration,
  video_generate: InlineVideoGeneration,
  media_generate_video: InlineVideoGeneration,
  veo_generate: InlineVideoGeneration,
  document_create_pdf: InlineDocumentGeneration,
  document_create_word: InlineDocumentGeneration,
  document_create_docx: InlineDocumentGeneration,
  document_create_excel: InlineDocumentGeneration,
  document_create_xlsx: InlineDocumentGeneration,

  // GitHub operations
  github_pr_create: InlineGitHubPR,
  github_pr_list: InlineGitHubPR,
  github_issue_create: InlineGitHubIssue,
  github_issue_list: InlineGitHubIssue,
  github_commit: InlineGitHubCommit,
  github_push: InlineGitHubCommit,

  // Database operations
  db_query: InlineDatabaseResults,
  database_query: InlineDatabaseResults,
  db_execute: InlineDatabaseResults,
  sql_query: InlineDatabaseResults,

  // API operations
  api_call: InlineAPIResponse,
  execute_api_call: InlineAPIResponse,
  http_request: InlineAPIResponse,
  fetch_url: InlineAPIResponse,

  // Screenshot and OCR operations
  screenshot: InlineScreenshot,
  computer_use_capture_screen: InlineScreenshot,
  automation_screenshot: InlineScreenshot,
  capture_screen: InlineScreenshot,
  automation_ocr: InlineScreenshot,
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
  return TOOL_RENDERERS[toolName] || null;
}

/**
 * Check if a tool has an inline renderer
 */
export function hasInlineRenderer(toolName: string | undefined): boolean {
  return toolName !== undefined && toolName in TOOL_RENDERERS;
}

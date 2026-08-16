
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

const InlineSwarmProgress = React.lazy(() =>
  import('./InlineSwarmProgress').then((m) => ({ default: m.InlineSwarmProgress })),
);

const InlineArtifactCard = React.lazy(() =>
  import('./InlineArtifactCard').then((m) => ({ default: m.InlineArtifactCard })),
);

const InlineSkillCard = React.lazy(() =>
  import('./InlineSkillCard').then((m) => ({ default: m.InlineSkillCard })),
);

const InlineVisionResult = React.lazy(() =>
  import('./InlineVisionResult').then((m) => ({ default: m.InlineVisionResult })),
);

const InlineMemoryCard = React.lazy(() =>
  import('./InlineMemoryCard').then((m) => ({ default: m.InlineMemoryCard })),
);

const InlineVoiceResult = React.lazy(() =>
  import('./InlineVoiceResult').then((m) => ({ default: m.InlineVoiceResult })),
);

const InlineAgentCard = React.lazy(() =>
  import('./InlineAgentCard').then((m) => ({ default: m.InlineAgentCard })),
);

const InlineGitResult = React.lazy(() =>
  import('./InlineGitResult').then((m) => ({ default: m.InlineGitResult })),
);

const InlineScheduleCard = React.lazy(() =>
  import('./InlineScheduleCard').then((m) => ({ default: m.InlineScheduleCard })),
);

const InlineLSPResult = React.lazy(() =>
  import('./InlineLSPResult').then((m) => ({ default: m.InlineLSPResult })),
);

const InlineMarketplaceCard = React.lazy(() =>
  import('./InlineMarketplaceCard').then((m) => ({ default: m.InlineMarketplaceCard })),
);

const InlineTodoList = React.lazy(() =>
  import('./TodoList').then((m) => ({ default: m.TodoList })),
);

const InlineQuestionPrompt = React.lazy(() =>
  import('./QuestionPrompt').then((m) => ({ default: m.QuestionPrompt })),
);

const InlineBrowserAutomation = InlineTerminalOutput;
const InlineEmailOperation = InlineTerminalOutput;
const InlineCalendarOperation = InlineTerminalOutput;
const InlineCloudOperation = InlineTerminalOutput;
const InlineUIControl = InlineTerminalOutput;
const InlineCodeExecution = InlineTerminalOutput;
const InlineProductivityOperation = InlineTerminalOutput;
const InlineImageAnalysis = InlineVisionResult;

export const TOOL_RENDERERS: Record<
  string,
  | React.ComponentType<ToolResultProps>
  | React.LazyExoticComponent<React.ComponentType<ToolResultProps>>
> = {
  web_search: InlineSearchResults,
  perplexity_search: InlineSearchResults,
  search_web: InlineSearchResults,
  browser_search: InlineSearchResults,

  file_read: InlineCodeDiff,
  file_write: InlineCodeDiff,
  file_edit: InlineCodeDiff,
  file_create: InlineCodeDiff,
  file_delete: InlineCodeDiff,
  code_edit: InlineCodeDiff,

  file_list: InlineDirectoryList,
  list_directory: InlineDirectoryList,
  list_directory_with_sizes: InlineDirectoryList,
  mcp__filesystem__list_directory: InlineDirectoryList,
  mcp__filesystem__list_allowed_directories: InlineDirectoryList,

  mcp__filesystem__read_file: InlineCodeDiff,
  mcp__filesystem__read_text_file: InlineCodeDiff,
  mcp__filesystem__get_file_info: InlineSearchResults,
  mcp__filesystem__search_files: InlineSearchResults,
  mcp__filesystem__move_file: InlineTerminalOutput,
  mcp__filesystem__create_directory: InlineTerminalOutput,
  mcp__filesystem__write_file: InlineTerminalOutput,
  mcp__filesystem__edit_file: InlineTerminalOutput,

  mcp__claude_in_chrome__read_page: InlineSearchResults,
  mcp__claude_in_chrome__get_page_text: InlineSearchResults,
  mcp__claude_in_chrome__read_console_messages: InlineSearchResults,
  mcp__claude_in_chrome__read_network_requests: InlineSearchResults,

  terminal_execute: InlineTerminalOutput,
  shell_command: InlineTerminalOutput,
  terminal_run: InlineTerminalOutput,
  bash_execute: InlineTerminalOutput,
  code_execute: InlineCodeExecution,
  code_analyze: InlineCodeDiff,

  image_generate: InlineImageGeneration,
  media_generate_image: InlineImageGeneration,
  dalle_generate: InlineImageGeneration,
  imagen_generate: InlineImageGeneration,
  video_generate: InlineVideoGeneration,
  media_generate_video: InlineVideoGeneration,
  veo_generate: InlineVideoGeneration,

  document_create_pdf: InlineDocumentGeneration,
  document_create_word: InlineDocumentGeneration,
  document_create_docx: InlineDocumentGeneration,
  document_create_excel: InlineDocumentGeneration,
  document_create_xlsx: InlineDocumentGeneration,
  document_read: InlineDocumentRead,
  document_extract_text: InlineDocumentRead,
  document_search: InlineDocumentSearch,

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

  ui_click: InlineUIControl,
  ui_type: InlineUIControl,
  ui_screenshot: InlineScreenshot,

  image_ocr: InlineImageAnalysis,
  image_analyze: InlineImageAnalysis,

  email_send: InlineEmailOperation,
  email_fetch: InlineEmailOperation,

  calendar_create_event: InlineCalendarOperation,
  calendar_list_events: InlineCalendarOperation,

  cloud_upload: InlineCloudOperation,
  cloud_download: InlineCloudOperation,
  api_upload: InlineAPIResponse,
  api_download: InlineAPIResponse,

  productivity_create_task: InlineProductivityOperation,

  memory_remember: InlineMemoryCard,
  memory_recall: InlineMemoryCard,
  memory_search: InlineSearchResults,
  memory_forget: InlineMemoryCard,

  schedule_reminder: InlineScheduleCard,
  schedule_recurring_task: InlineScheduleCard,
  cancel_scheduled_task: InlineScheduleCard,
  list_scheduled_tasks: InlineScheduleCard,

  git_init: InlineGitResult,
  git_add: InlineGitResult,
  git_commit: InlineGitResult,
  git_push: InlineGitResult,
  git_status: InlineGitResult,
  git_clone: InlineGitResult,
  git_diff: InlineGitResult,
  git_branch: InlineGitResult,
  git_log: InlineGitResult,
  github_create_repo: InlineGitHubPR,

  github_pr_create: InlineGitHubPR,
  github_pr_list: InlineGitHubPR,
  github_issue_create: InlineGitHubIssue,
  github_issue_list: InlineGitHubIssue,
  github_commit: InlineGitHubCommit,
  github_push: InlineGitHubCommit,

  db_query: InlineDatabaseResults,
  database_query: InlineDatabaseResults,
  db_execute: InlineDatabaseResults,
  sql_query: InlineDatabaseResults,
  db_transaction_begin: InlineDatabaseResults,
  db_transaction_commit: InlineDatabaseResults,
  db_transaction_rollback: InlineDatabaseResults,

  api_call: InlineAPIResponse,
  execute_api_call: InlineAPIResponse,
  http_request: InlineAPIResponse,
  fetch_url: InlineAPIResponse,

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

  llm_reason: InlineSearchResults,

  swarm_execute: InlineSwarmProgress,
  swarm_run: InlineSwarmProgress,
  agent_swarm: InlineSwarmProgress,
  multi_agent_run: InlineSwarmProgress,

  artifact_create: InlineArtifactCard,
  artifact_generate: InlineArtifactCard,
  create_artifact: InlineArtifactCard,

  skill_invoke: InlineSkillCard,
  skill_run: InlineSkillCard,
  invoke_skill: InlineSkillCard,

  vision_analyze: InlineVisionResult,
  vision_ocr: InlineVisionResult,
  analyze_image: InlineVisionResult,

  voice_transcribe: InlineVoiceResult,
  speech_to_text: InlineVoiceResult,
  audio_transcribe: InlineVoiceResult,

  agent_start: InlineAgentCard,
  agent_create: InlineAgentCard,
  background_agent: InlineAgentCard,
  agent_status: InlineAgentCard,

  lsp_hover: InlineLSPResult,
  lsp_definition: InlineLSPResult,
  lsp_diagnostics: InlineLSPResult,
  lsp_query: InlineLSPResult,

  marketplace_search: InlineMarketplaceCard,
  marketplace_install: InlineMarketplaceCard,
  template_fetch: InlineMarketplaceCard,

  todo_write: InlineTodoList,

  question: InlineQuestionPrompt,
};

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

  if (toolName.startsWith('mcp__')) return InlineTerminalOutput;
  if (toolName.includes('search') || toolName.includes('fetch')) return InlineSearchResults;
  if (toolName.includes('screenshot') || toolName.includes('capture')) return InlineScreenshot;

  return InlineTerminalOutput;
}

export function hasInlineRenderer(toolName: string | undefined): boolean {
  return getToolRenderer(toolName) !== null;
}

const DEFAULT_TOOL_EXECUTION_HARD_TIMEOUT_MS = 120_000;
const FAST_METADATA_TOOL_TIMEOUT_MS = 10_000;
const LONG_RUNNING_TOOL_TIMEOUT_MS = 300_000;

export const resolveToolHardTimeoutMs = (toolName: string): number => {
  const normalized = toolName.toLowerCase();
  if (
    normalized === 'file_read' ||
    normalized === 'file_list' ||
    normalized.includes('list_directory') ||
    normalized.includes('filesystem__list_directory') ||
    normalized.includes('list_allowed_directories') ||
    normalized.includes('filesystem__list_allowed_directories') ||
    normalized.includes('read_text_file') ||
    normalized.includes('filesystem__read_text_file')
  ) {
    return FAST_METADATA_TOOL_TIMEOUT_MS;
  }

  if (normalized === 'terminal_execute' || normalized.startsWith('document_create_')) {
    return LONG_RUNNING_TOOL_TIMEOUT_MS;
  }

  return DEFAULT_TOOL_EXECUTION_HARD_TIMEOUT_MS;
};

export const shouldAbortGenerationOnToolTimeout = (toolName: string): boolean => {
  const normalized = toolName.toLowerCase();
  return (
    normalized === 'file_read' ||
    normalized === 'file_list' ||
    normalized.includes('list_directory') ||
    normalized.includes('filesystem__list_directory') ||
    normalized.includes('list_allowed_directories') ||
    normalized.includes('filesystem__list_allowed_directories') ||
    normalized.includes('read_text_file') ||
    normalized.includes('filesystem__read_text_file')
  );
};

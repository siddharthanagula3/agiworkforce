const DEFAULT_TOOL_EXECUTION_HARD_TIMEOUT_MS = 180_000;
const FAST_METADATA_TOOL_TIMEOUT_MS = 45_000;
const LONG_RUNNING_TOOL_TIMEOUT_MS = 600_000;

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

  if (
    normalized === 'terminal_execute' ||
    normalized.startsWith('document_create_') ||
    normalized === 'video_generate' ||
    normalized === 'media_generate_video' ||
    normalized === 'image_generate' ||
    normalized === 'media_generate_image' ||
    normalized === 'text_to_image' ||
    normalized.startsWith('generate_image') ||
    normalized.startsWith('image_generation') ||
    normalized.startsWith('generate_video') ||
    normalized.startsWith('video_generation')
  ) {
    return LONG_RUNNING_TOOL_TIMEOUT_MS;
  }

  return DEFAULT_TOOL_EXECUTION_HARD_TIMEOUT_MS;
};

export const shouldAbortGenerationOnToolTimeout = (toolName: string): boolean => {
  void toolName;
  // Keep generation alive by default. Backend tool lifecycle events and model loop
  // should determine terminal state, avoiding premature frontend aborts.
  return false;
};

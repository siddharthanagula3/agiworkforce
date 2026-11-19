export const SEARCH_FILES_TOOL_NAME = 'search_files';
export const OPEN_FILE_TOOL_NAME = 'open_file';

/** search_files and open_file, offered and run together. */
export function isFileSearchTool(name: string): boolean {
  return name === SEARCH_FILES_TOOL_NAME || name === OPEN_FILE_TOOL_NAME;
}

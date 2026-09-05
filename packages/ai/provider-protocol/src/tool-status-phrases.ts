import { PLACES_SEARCH_TOOL_NAME } from '@agiworkforce/types';

const TOOL_STATUS_PHRASES: [pattern: RegExp, phrase: string][] = [
  [new RegExp(`\\b${PLACES_SEARCH_TOOL_NAME}\\b`, 'i'), 'Searching for places'],
  [/\bweb_search|search_web|browser_search|perplexity/i, 'Searching the web'],
  [/\bweb_fetch|url_fetch|fetch_url|http_request/i, 'Fetching page'],
  [/\bcode_execut|execute_code|run_code|jupyter/i, 'Running code'],
  [/\blist_files|list_dir/i, 'Listing files'],
  [/\bfile_read|view|read_file/i, 'Reading file'],
  [/\bfile_write|write_file|create_file/i, 'Writing file'],
  [/\bfile_edit|edit_file|patch/i, 'Editing file'],
  [/\bbash|shell|terminal|command/i, 'Running command'],
  [/\bgrep|ripgrep|search_codebase/i, 'Searching codebase'],
  [/\bgit_/i, 'Running git'],
  [/\bdb_query|sql_query|database/i, 'Querying database'],
  [/\bskill/i, 'Reading skill'],
  [/\bcreate_office_file\b/i, 'Creating Office file'],
  [/\bsearch_maps\b/i, 'Preparing map'],
  [/\bmemory|relevant_chat/i, 'Retrieving project context'],
];

export function toolStatusPhrase(toolName: string): string | undefined {
  for (const [pattern, phrase] of TOOL_STATUS_PHRASES) {
    if (pattern.test(toolName)) return phrase;
  }
  return undefined;
}

import { PLACES_SEARCH_TOOL_NAME, type AgentEventToolCategory } from '@agiworkforce/types';

export type AgentActivityLabelSignal =
  | { kind: 'idle'; modelName?: string }
  | { kind: 'thinking' }
  | { kind: 'planning' }
  | { kind: 'tool'; name: string; category: AgentEventToolCategory; argument?: string };

const IDLE_UNKNOWN_MODEL_LABEL = 'Connecting to the model';
const THINKING_LABEL = 'Thinking';
const PLANNING_LABEL = 'Planning';
const RUNNING_CODE_LABEL = 'Running code';
const LOOKING_UP_PLACE_LABEL = 'Looking up a place';
const SEARCHING_FOR_PLACES_LABEL = 'Searching for places';
const READING_FILE_FALLBACK_LABEL = 'Reading a file';
const READING_PAGE_FALLBACK_LABEL = 'Reading a web page';
const SEARCHING_WEB_FALLBACK_LABEL = 'Searching the web';

const WEB_SEARCH_TOOL_NAMES = new Set(['web_search', 'gemini_grounding']);
const MAP_SEARCH_TOOL_NAMES = new Set(['search_maps']);
const PLACES_SEARCH_TOOL_NAMES = new Set([PLACES_SEARCH_TOOL_NAME]);
const CODE_EXECUTION_TOOL_NAMES = new Set(['code_execution']);

const TOOL_ARGUMENT_KEYS = [
  'query',
  'q',
  'location',
  'place',
  'address',
  'path',
  'file',
  'filename',
  'url',
] as const;

function deriveToolLabel(
  name: string,
  category: AgentEventToolCategory,
  argument?: string,
): string {
  if (PLACES_SEARCH_TOOL_NAMES.has(name)) return SEARCHING_FOR_PLACES_LABEL;
  if (MAP_SEARCH_TOOL_NAMES.has(name)) return LOOKING_UP_PLACE_LABEL;
  if (WEB_SEARCH_TOOL_NAMES.has(name) || category === 'web-search') {
    return argument ? `Searching the web for ${argument}` : SEARCHING_WEB_FALLBACK_LABEL;
  }
  if (
    CODE_EXECUTION_TOOL_NAMES.has(name) ||
    category === 'code-execution' ||
    category === 'shell'
  ) {
    return RUNNING_CODE_LABEL;
  }
  if (category === 'filesystem') {
    return argument ? `Reading ${argument}` : READING_FILE_FALLBACK_LABEL;
  }
  if (category === 'web-fetch') {
    return argument ? `Reading ${argument}` : READING_PAGE_FALLBACK_LABEL;
  }
  return argument ? `Using ${name} for ${argument}` : `Using ${name}`;
}

export function deriveAgentActivityLabel(signal: AgentActivityLabelSignal): string {
  switch (signal.kind) {
    case 'idle':
      return signal.modelName ? `Connecting to ${signal.modelName}` : IDLE_UNKNOWN_MODEL_LABEL;
    case 'thinking':
      return THINKING_LABEL;
    case 'planning':
      return PLANNING_LABEL;
    case 'tool':
      return deriveToolLabel(signal.name, signal.category, signal.argument);
  }
}

export function extractToolActivityArgument(
  args: Record<string, unknown> | undefined,
): string | undefined {
  if (!args) return undefined;
  for (const key of TOOL_ARGUMENT_KEYS) {
    const value = args[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

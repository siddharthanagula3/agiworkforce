import type { AgentEventToolCategory } from '@agiworkforce/types/protocol';

const MCP_TOOL_PREFIX = 'mcp__';
const MAX_SUMMARY_ARGUMENT_LENGTH = 120;
const SUMMARY_SEPARATOR = ': ';
const TRUNCATION_MARKER = '…';

const CATEGORY_KEYWORDS: readonly (readonly [string, AgentEventToolCategory])[] = [
  ['web_search', 'web-search'],
  ['websearch', 'web-search'],
  ['web_fetch', 'web-fetch'],
  ['webfetch', 'web-fetch'],
  ['read_web_page', 'web-fetch'],
  ['mcp', 'mcp'],
  ['browser', 'computer-use'],
  ['bash', 'shell'],
  ['shell', 'shell'],
  ['terminal', 'shell'],
  ['command', 'shell'],
  ['notebook', 'code-execution'],
  ['execute', 'code-execution'],
  ['skill', 'skill'],
  ['memory', 'memory'],
  ['read', 'filesystem'],
  ['write', 'filesystem'],
  ['edit', 'filesystem'],
  ['glob', 'filesystem'],
  ['grep', 'filesystem'],
  ['file', 'filesystem'],
  ['directory', 'filesystem'],
  ['ls', 'filesystem'],
  ['patch', 'filesystem'],
];

const SUMMARY_ARGUMENT_KEYS: readonly string[] = [
  'command',
  'file_path',
  'path',
  'notebook_path',
  'pattern',
  'url',
  'query',
  'tool',
  'prompt',
  'description',
];

export function toolCategoryFor(name: string): AgentEventToolCategory {
  if (name.startsWith(MCP_TOOL_PREFIX)) return 'mcp';
  const needle = name.toLowerCase();
  for (const [keyword, category] of CATEGORY_KEYWORDS) {
    if (needle.includes(keyword)) return category;
  }
  return 'other';
}

function truncate(value: string): string {
  return value.length <= MAX_SUMMARY_ARGUMENT_LENGTH
    ? value
    : `${value.slice(0, MAX_SUMMARY_ARGUMENT_LENGTH)}${TRUNCATION_MARKER}`;
}

export function toolSummaryArgument(input: unknown): string | null {
  if (typeof input === 'string') return truncate(input.replaceAll('\n', ' ').trim()) || null;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  for (const key of SUMMARY_ARGUMENT_KEYS) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return truncate(value.replaceAll('\n', ' ').trim());
    }
  }
  return null;
}

export function toolSummary(name: string, input: unknown): string {
  const argument = toolSummaryArgument(input);
  return argument ? `${name}${SUMMARY_SEPARATOR}${argument}` : name;
}

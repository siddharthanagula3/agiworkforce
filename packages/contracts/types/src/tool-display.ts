
export type ToolDisplayCategory =
  | 'search'
  | 'browser'
  | 'code'
  | 'file'
  | 'terminal'
  | 'media'
  | 'data'
  | 'communication'
  | 'system';

export const CATEGORY_ICON_NAME: Record<ToolDisplayCategory, string> = {
  search: 'Search',
  browser: 'Globe',
  code: 'Code',
  file: 'FileText',
  terminal: 'Terminal',
  media: 'Image',
  data: 'Database',
  communication: 'MessageSquare',
  system: 'Settings',
};

export const TOOL_ICON_NAME: Record<string, string> = {
  Read: 'FileText',
  Write: 'FileText',
  Edit: 'Edit3',
  MultiEdit: 'Edit3',
  ApplyPatch: 'Edit3',
  LS: 'FolderOpen',
  Glob: 'FolderOpen',
  Search: 'Search',
  Grep: 'Search',
  CodeSearch: 'Code',
  Bash: 'Terminal',
  WebSearch: 'Globe',
  WebFetch: 'Globe',
  Memory: 'Database',
  Git: 'GitBranch',
  ImageGen: 'Image',
  VideoGen: 'Video',
  Question: 'HelpCircle',
  TodoWrite: 'ListTodo',
  Click: 'MousePointerClick',
  Clicking: 'MousePointerClick',
  Browsing: 'Globe',
  Typing: 'Edit3',
  'Open website': 'Globe',
  'Take screenshot': 'Image',
  'Scroll page': 'Globe',
  'Type text': 'Edit3',
  'Run database query': 'Database',
  'List tables': 'Database',
  'Read file': 'FileText',
  'Save file': 'FileText',
  'List files': 'FolderOpen',
  'List allowed folders': 'FolderOpen',
  'Run command': 'Terminal',
  'Run code': 'Code',
  'Search the web': 'Globe',
  'Create image': 'Image',
  'Create video': 'Video',
  MCP: 'Box',
};

export const DEFAULT_TOOL_ICON_NAME = 'Wrench';

export interface ToolDisplayLabel {
  displayName: string;
  activeForm: string;
  completedForm: string;
}

const TOOL_DISPLAY_LABEL: Record<string, ToolDisplayLabel> = {
  web_search: {
    displayName: 'Search the web',
    activeForm: 'Searching the web…',
    completedForm: 'Searched the web',
  },
  perplexity_search: {
    displayName: 'Search the web',
    activeForm: 'Searching the web…',
    completedForm: 'Searched the web',
  },
  code_execution: {
    displayName: 'Run code',
    activeForm: 'Running code…',
    completedForm: 'Ran code',
  },
  code_interpreter: {
    displayName: 'Run code',
    activeForm: 'Running code…',
    completedForm: 'Ran code',
  },
};

function mcpToolSuffix(name: string): string | undefined {
  const PREFIX = 'mcp__';
  if (!name.toLowerCase().startsWith(PREFIX)) return undefined;
  const separator = name.indexOf('__', PREFIX.length);
  if (separator === -1) return undefined;
  const suffix = name.slice(separator + 2);
  return suffix.length > 0 ? suffix : undefined;
}

export function getToolDisplayLabel(rawName: string | null | undefined): ToolDisplayLabel {
  const name = (rawName ?? '').trim();
  if (!name) {
    return { displayName: 'Working', activeForm: 'Working…', completedForm: 'Done' };
  }

  const direct = TOOL_DISPLAY_LABEL[name] ?? TOOL_DISPLAY_LABEL[name.toLowerCase()];
  if (direct) return direct;

  const source = mcpToolSuffix(name) ?? name;
  const readable = source
    .replace(/^(mcp__|tool_|action_)/i, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

  if (!readable) return { displayName: 'Working', activeForm: 'Working…', completedForm: 'Done' };

  return {
    displayName: readable,
    activeForm: `${readable}…`,
    completedForm: readable,
  };
}

export const TOOL_TIMELINE_ICON_NAME = {
  thinking: 'Clock',
  done: 'CheckCircle2',
} as const;

export function getToolSourceBadge(rawName: string | null | undefined): string | null {
  const n = (rawName ?? '').trim();
  if (!n) return null;
  const mcp = n.match(/^mcp__([a-z0-9_-]+)__/i);
  if (mcp?.[1])
    return (
      mcp[1]
        .replace(/^[_-]+/, '')
        .charAt(0)
        .toUpperCase() || null
    );
  const composite = n.match(/^([a-z0-9-]+)__/i);
  if (composite?.[1] && composite[1].toLowerCase() !== 'mcp') {
    return composite[1].charAt(0).toUpperCase();
  }
  return null;
}

/**
 * Resolve the lucide icon name for a tool.
 *
 * @param name      raw tool name OR its friendly display name
 * @param category  optional category (from the tool display metadata) used as a
 *                  fallback when the name isn't in TOOL_ICON_NAME
 */
export function getToolIconName(
  name: string | null | undefined,
  category?: ToolDisplayCategory | null,
): string {
  const key = (name ?? '').trim();
  if (key && TOOL_ICON_NAME[key]) return TOOL_ICON_NAME[key];
  if (key) {
    const canonical = Object.keys(TOOL_ICON_NAME).find(
      (k) => k.toLowerCase() === key.toLowerCase(),
    );
    if (canonical) return TOOL_ICON_NAME[canonical] as string;
  }
  if (category && CATEGORY_ICON_NAME[category]) return CATEGORY_ICON_NAME[category];
  return DEFAULT_TOOL_ICON_NAME;
}

const FILE_EXTENSION_ICON_NAME: Record<string, string> = {
  js: 'Code',
  jsx: 'Code',
  ts: 'Code',
  tsx: 'Code',
  py: 'Code',
  json: 'Code',
  css: 'Code',
  html: 'FileText',
  md: 'FileText',
  txt: 'FileText',
  pdf: 'FileText',
  docx: 'FileText',
  pptx: 'FileText',
  csv: 'FileText',
  xlsx: 'FileText',
};

export function getFileExtensionIconName(filePath: string | null | undefined): string {
  const path = (filePath ?? '').trim();
  const match = path.match(/\.([a-z0-9]+)$/i);
  const ext = match?.[1]?.toLowerCase();
  if (ext && FILE_EXTENSION_ICON_NAME[ext]) return FILE_EXTENSION_ICON_NAME[ext];
  return DEFAULT_TOOL_ICON_NAME;
}

export interface ToolTimelineEntry {
  name: string;
  filePath?: string | null;
  command?: string | null;
}

export function summarizeToolTimeline(entries: ToolTimelineEntry[]): string {
  if (entries.length === 0) return '';

  let commands = 0;
  let filesCreated = 0;
  let filesRead = 0;
  let searches = 0;
  let other = 0;

  for (const entry of entries) {
    const name = entry.name.toLowerCase();
    if (
      entry.command ||
      name.includes('bash') ||
      name.includes('command') ||
      name.includes('shell')
    ) {
      commands += 1;
    } else if (name.includes('write') || name.includes('create')) {
      filesCreated += 1;
    } else if (name.includes('read') || name.includes('view')) {
      filesRead += 1;
    } else if (name.includes('search') || name.includes('web_search')) {
      searches += 1;
    } else {
      other += 1;
    }
  }

  const parts: string[] = [];
  if (commands > 0) parts.push(commands === 1 ? 'Ran 1 command' : `Ran ${commands} commands`);
  if (searches > 0) parts.push(searches === 1 ? 'searched the web' : `ran ${searches} searches`);
  if (filesCreated > 0)
    parts.push(filesCreated === 1 ? 'created a file' : `created ${filesCreated} files`);
  if (filesRead > 0) parts.push(filesRead === 1 ? 'read a file' : `read ${filesRead} files`);
  if (other > 0 && parts.length === 0) {
    parts.push(entries.length === 1 ? 'Used 1 tool' : `Used ${entries.length} tools`);
  }

  if (parts.length === 0)
    return entries.length === 1 ? 'Used 1 tool' : `Used ${entries.length} tools`;

  return [parts[0], ...parts.slice(1)].join(', ');
}

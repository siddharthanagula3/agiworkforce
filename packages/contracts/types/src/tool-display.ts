/**
 * Cross-surface tool-call display registry.
 *
 * PURE TypeScript — NO React, NO icon library. This is the single source of
 * truth for how a tool call is presented (icon + category) across every surface:
 *   - desktop / web (apps/desktop, served as web /chat) → map iconName → lucide-react
 *   - mobile (apps/mobile, React Native)                → map iconName → lucide-react-native
 *
 * Icon names are lucide names that exist in BOTH lucide-react and
 * lucide-react-native (same generated icon set), so every surface renders the
 * same icon for the same tool. Keep this file dependency-free so React Native
 * can import it without pulling in any DOM/React code.
 */

/** Icon category buckets, mirrored from the per-tool display metadata. */
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

/** Fallback icon per category — a lucide name valid in react + react-native. */
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

/**
 * Direct tool-name → lucide icon name. Keys cover both canonical tool names
 * (Read, Bash, WebSearch…) and the user-facing display names produced by the
 * display map (e.g. 'Open website', 'Run command'), so a lookup works whether
 * the caller has the raw name or the friendly label.
 */
export const TOOL_ICON_NAME: Record<string, string> = {
  // Filesystem
  Read: 'FileText',
  Write: 'FileText',
  Edit: 'Edit3',
  MultiEdit: 'Edit3',
  ApplyPatch: 'Edit3',
  LS: 'FolderOpen',
  Glob: 'FolderOpen',
  // Search
  Search: 'Search',
  Grep: 'Search',
  CodeSearch: 'Code',
  // Terminal
  Bash: 'Terminal',
  // Web
  WebSearch: 'Globe',
  WebFetch: 'Globe',
  // Data
  Memory: 'Database',
  // Git
  Git: 'GitBranch',
  // Media
  ImageGen: 'Image',
  VideoGen: 'Video',
  // Interactive
  Question: 'HelpCircle',
  TodoWrite: 'ListTodo',
  // Browser / UI automation
  Click: 'MousePointerClick',
  Clicking: 'MousePointerClick',
  Browsing: 'Globe',
  Typing: 'Edit3',
  'Open website': 'Globe',
  'Take screenshot': 'Image',
  'Scroll page': 'Globe',
  'Type text': 'Edit3',
  // MCP friendly display names
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
  // MCP source indicator
  MCP: 'Box',
};

/** Default when nothing matches — a generic tool icon present in both libs. */
export const DEFAULT_TOOL_ICON_NAME = 'Wrench';

/** Friendly label + per-status action phrase for a tool call. */
export interface ToolDisplayLabel {
  /** Neutral display name, e.g. "Search the web". */
  displayName: string;
  /** Phrase while running, e.g. "Searching the web…". */
  activeForm: string;
  /** Phrase once completed, e.g. "Searched the web". */
  completedForm: string;
}

/**
 * Direct tool-name → friendly label. Keys are raw/canonical tool names as they
 * arrive over the wire (e.g. from `x_tool_status.name` or MCP `function.name`).
 * Kept intentionally smaller than desktop's `toolDisplayNames.ts` — covers the
 * server-tool names mobile actually receives; extend as new tools ship.
 */
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

/**
 * Resolve a friendly display label for a tool call, given its raw name.
 *
 * Order: direct map match → MCP-prefixed name humanized (`mcp__x__do_thing` →
 * "Do thing") → generic snake/kebab-case humanization → "Working" fallback.
 */
export function getToolDisplayLabel(rawName: string | null | undefined): ToolDisplayLabel {
  const name = (rawName ?? '').trim();
  if (!name) {
    return { displayName: 'Working', activeForm: 'Working…', completedForm: 'Done' };
  }

  const direct = TOOL_DISPLAY_LABEL[name] ?? TOOL_DISPLAY_LABEL[name.toLowerCase()];
  if (direct) return direct;

  const mcp = name.match(/^mcp__([a-z0-9_-]+)__(.+)$/i);
  const source = mcp?.[2] ?? name;
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

/** Step-variant icon names shared by the timeline UIs (thinking / done). */
export const TOOL_TIMELINE_ICON_NAME = {
  thinking: 'Clock',
  done: 'CheckCircle2',
} as const;

/**
 * Short integration "source" badge for a tool, à la Claude's inline tool-call
 * UI where MCP/connector tools show a letter mark (e.g. "F" for Filesystem)
 * to the left of the step.
 *
 * Returns a 1-char uppercase badge for MCP/namespaced tools
 * (`mcp__filesystem__list` → "F", `github__create_issue` → "G"), or null for
 * native tools (which are represented by their own icon, no source mark).
 */
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
  // Try a case-insensitive canonical match (e.g. "read" → "Read").
  if (key) {
    const canonical = Object.keys(TOOL_ICON_NAME).find(
      (k) => k.toLowerCase() === key.toLowerCase(),
    );
    if (canonical) return TOOL_ICON_NAME[canonical] as string;
  }
  if (category && CATEGORY_ICON_NAME[category]) return CATEGORY_ICON_NAME[category];
  return DEFAULT_TOOL_ICON_NAME;
}

/**
 * Icon for a CREATED FILE, keyed by extension — distinct from `getToolIconName`
 * (which resolves the tool's own icon, e.g. Terminal for a Bash tool). A tool
 * that writes `build_resume.js` should show a code-file icon regardless of
 * which tool wrote it. Kept to icon names present in both lucide-react and
 * lucide-react-native (same constraint as TOOL_ICON_NAME) — no speculative
 * icon names that might not exist in the generated set.
 */
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

/** Minimal shape `summarizeToolTimeline` needs — matches mobile's ToolCall structurally. */
export interface ToolTimelineEntry {
  name: string;
  filePath?: string | null;
  command?: string | null;
}

/**
 * Derives the collapsible group-header summary shown above a tool-call
 * timeline (e.g. "Ran 5 commands, created a file, read a file"), the same
 * role as Claude's own inline tool-use summary line. Pure client-side —
 * counts what already ran, no new data needed.
 */
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

  // First part keeps its own casing (e.g. "Ran 5 commands"); join the rest lowercase.
  return [parts[0], ...parts.slice(1)].join(', ');
}

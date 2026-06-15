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

/** Step-variant icon names shared by the timeline UIs (thinking / done). */
export const TOOL_TIMELINE_ICON_NAME = {
  thinking: 'Clock',
  done: 'CheckCircle2',
} as const;

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

/**
 * Canonical slash command registry for the web chat surface.
 *
 * This is the single source of truth for all slash commands. Both the
 * autocomplete hooks (apps/web/hooks/) and the visual SlashCommandMenu
 * component import from here so the command sets stay in sync.
 *
 * Built-in commands cover UI tools (search, think, image, doc, code) and
 * desktop/agentic actions (browser, terminal, database, undo, compact).
 * Custom user-defined commands are appended at runtime by SlashCommandMenu
 * by reading from the settings store.
 */

// Icon names are Lucide identifiers so this file stays framework-agnostic
// (the component layer is responsible for resolving them to React elements).
export type SlashCommandIconName =
  | 'Globe'
  | 'Brain'
  | 'Image'
  | 'FileText'
  | 'Code'
  | 'MonitorPlay'
  | 'Terminal'
  | 'Database'
  | 'Undo2'
  | 'Minimize2'
  | 'Sparkles';

export interface SlashCommandDefinition {
  id: string;
  /** Display label (includes leading /). */
  label: string;
  description: string;
  example?: string;
  iconName: SlashCommandIconName;
  isCustom?: boolean;
  /** True for skill-sourced commands fetched from /api/skills. */
  isSkill?: boolean;
}

/**
 * All built-in slash commands, ordered by expected usage frequency.
 * Keep this list as the canonical source; do not define command lists
 * in individual hooks or components.
 */
export const BUILT_IN_SLASH_COMMANDS: SlashCommandDefinition[] = [
  {
    id: 'search',
    label: '/search',
    description: 'Search the web',
    example: '/search latest AI news',
    iconName: 'Globe',
  },
  {
    id: 'think',
    label: '/think',
    description: 'Extended reasoning',
    example: '/think solve this problem step by step',
    iconName: 'Brain',
  },
  {
    id: 'image',
    label: '/image',
    description: 'Generate an image',
    example: '/image a futuristic city at dusk',
    iconName: 'Image',
  },
  {
    id: 'doc',
    label: '/doc',
    description: 'Create a document',
    example: '/doc meeting notes template',
    iconName: 'FileText',
  },
  {
    id: 'code',
    label: '/code',
    description: 'Write or explain code',
    example: '/code sort an array in Python',
    iconName: 'Code',
  },
  {
    id: 'browser',
    label: '/browser',
    description: 'Automate browser actions',
    example: '/browser https://example.com',
    iconName: 'MonitorPlay',
  },
  {
    id: 'terminal',
    label: '/terminal',
    description: 'Execute shell commands',
    example: '/terminal ls -la',
    iconName: 'Terminal',
  },
  {
    id: 'database',
    label: '/database',
    description: 'Run database queries',
    example: '/database SELECT * FROM users',
    iconName: 'Database',
  },
  {
    id: 'undo',
    label: '/undo',
    description: 'Undo recent AI actions',
    example: '/undo or /undo list',
    iconName: 'Undo2',
  },
  {
    id: 'compact',
    label: '/compact',
    description: 'Summarize and compress conversation context',
    example: '/compact',
    iconName: 'Minimize2',
  },
];

/** Stable set of all valid command IDs, used for fast O(1) lookup. */
export const BUILT_IN_COMMAND_IDS = new Set(BUILT_IN_SLASH_COMMANDS.map((c) => c.id));

/**
 * Filter the built-in command list against a partial query string.
 * An empty query returns all commands.
 */
export function filterSlashCommands(
  query: string,
  commands: SlashCommandDefinition[] = BUILT_IN_SLASH_COMMANDS,
): SlashCommandDefinition[] {
  if (!query) return commands;
  const q = query.toLowerCase();
  return commands.filter((cmd) => cmd.id.startsWith(q) || cmd.label.slice(1).startsWith(q));
}

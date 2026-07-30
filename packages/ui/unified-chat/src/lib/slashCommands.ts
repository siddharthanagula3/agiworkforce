/**
 * Slash-command registry.
 *
 * Hosts mount this in the composer to detect when the user types a leading
 * slash + command name. Built-in commands cover common chat affordances
 * (rewind, plan, clear, model-switch, etc.). Hosts can extend with their
 * own via `registerSlashCommand`.
 *
 * The registry is pure data — invoking a command is the host's
 * responsibility. The host calls `parseSlashCommand(input)` to detect a
 * command + args, then dispatches via `getCommand(name).handler` (or the
 * host's own dispatcher).
 *
 * Companion: `usePlanModeStore` + `useCheckpointStore` for the state the
 * built-ins toggle.
 */

import type { PlatformCapability } from '@agiworkforce/types';

/**
 * Framework-neutral icon names used by the shared slash menu catalog. Hosts
 * resolve these to their icon system at the component boundary.
 */
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
  | 'Sparkles'
  | 'History'
  | 'ListChecks'
  | 'CircleHelp';

/**
 * Canonical menu metadata for prompt-transforming commands. This used to live
 * in the web app while Desktop maintained a second, much larger hard-coded
 * catalog. Keeping the framework-neutral definitions here lets every surface
 * render the package menu while still capability-filtering commands it cannot
 * execute.
 */
export interface SlashCommandDefinition {
  id: string;
  /** Display label including the leading slash. */
  label: string;
  description: string;
  example?: string;
  iconName: SlashCommandIconName;
  isCustom?: boolean;
  isSkill?: boolean;
  requiredCapability?: PlatformCapability;
}

/** Prompt commands supported by the managed chat composer. */
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
    requiredCapability: 'canUseBrowserAutomation',
  },
  {
    id: 'terminal',
    label: '/terminal',
    description: 'Execute shell commands',
    example: '/terminal ls -la',
    iconName: 'Terminal',
    requiredCapability: 'canUseTerminal',
  },
  {
    id: 'database',
    label: '/database',
    description: 'Run database queries',
    example: '/database SELECT * FROM users',
    iconName: 'Database',
    requiredCapability: 'canUseLocalDatabase',
  },
];

export const BUILT_IN_COMMAND_IDS = new Set(BUILT_IN_SLASH_COMMANDS.map((command) => command.id));

export function filterSlashCommandsByCapability(
  commands: SlashCommandDefinition[],
  isCapabilityEnabled: (capability: PlatformCapability) => boolean,
): SlashCommandDefinition[] {
  return commands.filter(
    (command) => !command.requiredCapability || isCapabilityEnabled(command.requiredCapability),
  );
}

export function filterSlashCommands(
  query: string,
  commands: SlashCommandDefinition[] = BUILT_IN_SLASH_COMMANDS,
): SlashCommandDefinition[] {
  if (!query) return commands;
  const normalizedQuery = query.toLowerCase();
  return commands.filter(
    (command) =>
      command.id.startsWith(normalizedQuery) ||
      command.label.slice(1).startsWith(normalizedQuery) ||
      command.description.toLowerCase().includes(normalizedQuery),
  );
}

export interface SlashCommand {
  /** The slash trigger without leading slash, e.g. `'rewind'`, `'plan'`. */
  name: string;
  /** Short one-line description shown in the autocomplete list. */
  description: string;
  /** Optional argument hint shown in autocomplete (e.g. `'<message-id>'`). */
  argsHint?: string;
  /** Category for grouping (e.g. `'control-flow'`, `'memory'`, `'view'`). */
  category?: string;
  /**
   * Handler the host invokes when the command is entered. May open a UI
   * panel, mutate a store, fire an analytics event, etc.
   *
   * Receives the trailing argument string (may be empty), the active
   * conversationId, and a `host` callback bag for things the registry
   * doesn't know about (toast, navigate, etc.).
   */
  handler?: (args: string, ctx: SlashCommandContext) => void | Promise<void>;
  /** When true, the command is shown only when a conversation is active. */
  requiresConversation?: boolean;
}

export interface SlashCommandContext {
  conversationId: string | null;
  /** Hosts may pass extra capabilities the registry doesn't know about. */
  host?: Record<string, unknown>;
}

/** Parsed result of `parseSlashCommand`. */
export interface ParsedSlashCommand {
  /** The command name (without leading slash), lowercased. */
  name: string;
  /** Trailing argument string (may be empty). */
  args: string;
}

/**
 * Detect whether `input` begins with a slash command and split it into
 * `(name, args)`. Returns null when the input is not a slash command.
 *
 * Recognises:
 *   - `'/rewind'`            → `{ name: 'rewind', args: '' }`
 *   - `'/rewind 12'`         → `{ name: 'rewind', args: '12' }`
 *   - `'/plan write code'`   → `{ name: 'plan', args: 'write code' }`
 *
 * Does NOT recognise (returns null):
 *   - `'/'`                   (no name)
 *   - `' /rewind'`            (whitespace before)
 *   - `'/say /hi'` arg-only   (still recognises `'say'` with args `'/hi'`)
 *   - `'no slash'`
 */
export function parseSlashCommand(input: string): ParsedSlashCommand | null {
  if (!input.startsWith('/')) return null;
  const body = input.slice(1).trim();
  if (body.length === 0) return null;
  const firstSpace = body.indexOf(' ');
  if (firstSpace === -1) {
    return { name: body.toLowerCase(), args: '' };
  }
  return {
    name: body.slice(0, firstSpace).toLowerCase(),
    args: body.slice(firstSpace + 1),
  };
}

// ── Registry ─────────────────────────────────────────────────────────────────

const registry = new Map<string, SlashCommand>();

export function registerSlashCommand(cmd: SlashCommand): void {
  registry.set(cmd.name.toLowerCase(), cmd);
}

export function getSlashCommand(name: string): SlashCommand | undefined {
  return registry.get(name.toLowerCase());
}

export function listSlashCommands(filter?: {
  conversationActive: boolean;
  query?: string;
}): SlashCommand[] {
  const out: SlashCommand[] = [];
  for (const cmd of registry.values()) {
    if (filter?.conversationActive === false && cmd.requiresConversation) continue;
    if (filter?.query) {
      const q = filter.query.toLowerCase();
      if (!cmd.name.includes(q) && !cmd.description.toLowerCase().includes(q)) continue;
    }
    out.push(cmd);
  }
  // Stable sort by category, then name.
  out.sort((a, b) => {
    const ca = a.category ?? '';
    const cb = b.category ?? '';
    if (ca !== cb) return ca.localeCompare(cb);
    return a.name.localeCompare(b.name);
  });
  return out;
}

/** Reset the registry — primarily for tests. */
export function clearSlashCommands(): void {
  registry.clear();
}

// ── Built-ins ────────────────────────────────────────────────────────────────

/**
 * Register the canonical built-in slash commands. Idempotent — safe to call
 * multiple times. Hosts call this once at chat init.
 */
export function registerBuiltinSlashCommands(): void {
  registerSlashCommand({
    name: 'rewind',
    description: 'Open the rewind timeline to fork from a prior message',
    argsHint: '[messageId]',
    category: 'control-flow',
    requiresConversation: true,
    handler: (args, ctx) => {
      const host = ctx.host as { openRewindTimeline?: (messageId?: string) => void } | undefined;
      const trimmed = args.trim();
      host?.openRewindTimeline?.(trimmed.length > 0 ? trimmed : undefined);
    },
  });

  registerSlashCommand({
    name: 'plan',
    description: 'Toggle plan-first mode (agent proposes a plan before executing)',
    category: 'control-flow',
    handler: (_args, ctx) => {
      const host = ctx.host as { togglePlanMode?: () => void } | undefined;
      host?.togglePlanMode?.();
    },
  });

  registerSlashCommand({
    name: 'clear',
    description: 'Clear the current conversation',
    category: 'control-flow',
    requiresConversation: true,
    handler: (_args, ctx) => {
      const host = ctx.host as { clearConversation?: (id: string | null) => void } | undefined;
      host?.clearConversation?.(ctx.conversationId);
    },
  });

  registerSlashCommand({
    name: 'model',
    description: 'Switch the active model',
    argsHint: '<model-id>',
    category: 'control-flow',
    handler: (args, ctx) => {
      const host = ctx.host as { setModel?: (modelId: string) => void } | undefined;
      const modelId = args.trim();
      if (modelId.length > 0) host?.setModel?.(modelId);
    },
  });

  registerSlashCommand({
    name: 'memory',
    description: 'Open the memory viewer',
    category: 'memory',
    handler: (_args, ctx) => {
      const host = ctx.host as { openMemoryView?: () => void } | undefined;
      host?.openMemoryView?.();
    },
  });

  registerSlashCommand({
    name: 'help',
    description: 'List all slash commands',
    category: 'view',
    handler: (_args, ctx) => {
      const host = ctx.host as { showHelp?: () => void } | undefined;
      host?.showHelp?.();
    },
  });
}

import type { SlashCommandSummary } from '@agiworkforce/types/protocol';

export interface SurfaceMenuItem {
  id: string;
  label: string;
  icon: string;
  command: string;
}

export const SURFACE_MENU_ITEMS: readonly SurfaceMenuItem[] = [
  {
    id: 'sessions',
    label: 'Sessions',
    icon: 'history',
    command: 'agi-workforce.showSessionsHistory',
  },
  {
    id: 'projects',
    label: 'Projects',
    icon: 'folder-library',
    command: 'agi-workforce.showProjects',
  },
  {
    id: 'artifacts',
    label: 'Artifacts',
    icon: 'file-code',
    command: 'agi-workforce.showArtifacts',
  },
  { id: 'work', label: 'Work', icon: 'cloud', command: 'agi-workforce.showWork' },
  { id: 'connectors', label: 'Connectors', icon: 'plug', command: 'agi-workforce.showConnectors' },
  { id: 'memory', label: 'Memory', icon: 'book', command: 'agi-workforce.memory' },
  {
    id: 'personalization',
    label: 'Personalization',
    icon: 'person',
    command: 'agi-workforce.personalize',
  },
  { id: 'skills', label: 'Skills', icon: 'lightbulb', command: 'agi-workforce.showSkills' },
  { id: 'plugins', label: 'Plugins', icon: 'extensions', command: 'agi-workforce.showPlugins' },
  { id: 'mcp', label: 'MCP servers', icon: 'server', command: 'agi-workforce.showMcpServers' },
  { id: 'hooks', label: 'Hooks', icon: 'symbol-event', command: 'agi-workforce.showHooks' },
  {
    id: 'instructions',
    label: 'Instructions',
    icon: 'law',
    command: 'agi-workforce.showInstructions',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: 'settings-gear',
    command: 'agi-workforce.openSettings',
  },
  { id: 'account', label: 'Account', icon: 'account', command: 'agi-workforce.showAccountUsage' },
  { id: 'help', label: 'Help', icon: 'question', command: 'agi-workforce.showHelp' },
];

export const ACCOUNT_SURFACE_COMMANDS: Readonly<Record<string, string>> = {
  signIn: 'agi-workforce.signIn',
  signOut: 'agi-workforce.signOut',
};

export function commandForSurface(surfaceId: string): string | undefined {
  return (
    SURFACE_MENU_ITEMS.find((item) => item.id === surfaceId)?.command ??
    ACCOUNT_SURFACE_COMMANDS[surfaceId]
  );
}

export interface SlashCommandItem {
  name: string;
  description: string;
  command: string;
  aliases?: readonly string[];
}

export const BUILT_IN_SLASH_COMMANDS: readonly SlashCommandItem[] = [
  {
    name: '/model',
    description: 'Choose the model for this session',
    command: 'agi-workforce.selectModel',
    aliases: ['m', 'models', 'providers'],
  },
  {
    name: '/effort',
    description: 'Choose how hard the model reasons',
    command: 'agi-workforce.setAgentEffort',
  },
  {
    name: '/plan',
    description: 'Choose plan mode or another agent mode',
    command: 'agi-workforce.setAgentMode',
  },
  {
    name: '/compact',
    description: 'Summarize this session to free context',
    command: 'agi-workforce.compactConversation',
  },
  {
    name: '/status',
    description: 'Session, model, context and plan usage',
    command: 'agi-workforce.showSessionStatus',
    aliases: ['context', 'ctx'],
  },
  {
    name: '/resume',
    description: 'Resume a developer session',
    command: 'agi-workforce.showSessionsHistory',
    aliases: ['sessions', 'history'],
  },
  {
    name: '/fork',
    description: 'Copy a session into a new one',
    command: 'agi-workforce.forkConversation',
    aliases: ['branch'],
  },
  {
    name: '/export',
    description: 'Copy or save this session as Markdown',
    command: 'agi-workforce.exportConversation',
  },
  {
    name: '/rewind',
    description: 'Go back to an earlier prompt: code, conversation or both',
    command: 'agi-workforce.showCheckpoints',
  },
  {
    name: '/worktree',
    description: 'Start a session in a new Git worktree',
    command: 'agi-workforce.newSessionInWorktree',
    aliases: ['wt'],
  },
  {
    name: '/cloud',
    description: 'Continue this session in the cloud',
    command: 'agi-workforce.continueInCloud',
  },
  {
    name: '/usage',
    description: 'Plan limits and usage for your account',
    command: 'agi-workforce.showAccountUsage',
    aliases: ['cost', 'extra-usage', 'pricing'],
  },
  {
    name: '/upgrade',
    description: 'Compare plans and upgrade',
    command: 'agi-workforce.openUpgrade',
  },
  {
    name: '/memory',
    description: 'Your account memory',
    command: 'agi-workforce.memory',
    aliases: ['mem'],
  },
  {
    name: '/personalize',
    description: 'How replies address you and read',
    command: 'agi-workforce.personalize',
  },
  { name: '/skills', description: 'Skills the CLI loads', command: 'agi-workforce.showSkills' },
  {
    name: '/plugins',
    description: 'Installed plugins',
    command: 'agi-workforce.showPlugins',
    aliases: ['plugin', 'marketplace', 'market'],
  },
  { name: '/mcp', description: 'MCP servers', command: 'agi-workforce.showMcpServers' },
  { name: '/hooks', description: 'Hooks the CLI runs', command: 'agi-workforce.showHooks' },
  {
    name: '/permissions',
    description: 'What the agent may do: mode, tools, rules and trusted folders',
    command: 'agi-workforce.showSavedApprovals',
    aliases: ['perms', 'approvals'],
  },
  {
    name: '/schedule',
    description: 'Routines that run on a schedule',
    command: 'agi-workforce.showSchedules',
    aliases: ['routines'],
  },
  {
    name: '/remote-control',
    description: "Continue this window's sessions from your phone",
    command: 'agi-workforce.remoteControl',
  },
  {
    name: '/settings',
    description: 'Extension and runtime settings',
    command: 'agi-workforce.openSettings',
    aliases: ['config'],
  },
  {
    name: '/doctor',
    description: 'Check the AGI CLI this window runs',
    command: 'agi-workforce.checkCli',
    aliases: ['diagnose', 'health'],
  },
  {
    name: '/feedback',
    description: 'Send feedback or report a problem',
    command: 'agi-workforce.sendFeedback',
    aliases: ['bug'],
  },
  { name: '/login', description: 'Sign in to AGI', command: 'agi-workforce.signIn' },
  { name: '/logout', description: 'Sign out of AGI', command: 'agi-workforce.signOut' },
  {
    name: '/help',
    description: 'Help and keyboard shortcuts',
    command: 'agi-workforce.showHelp',
    aliases: ['h', '?'],
  },
  {
    name: '/clear',
    description: 'Start a new chat',
    command: 'agi-workforce.newConversation',
    aliases: ['new'],
  },
];

export type SlashMenuAction =
  { kind: 'command'; command: string } | { kind: 'prompt' } | { kind: 'skill' } | { kind: 'cli' };

export interface SlashMenuEntry {
  name: string;
  description: string;
  action: SlashMenuAction;
}

function bareName(name: string): string {
  return name.replace(/^\//u, '').toLowerCase();
}

function extensionCommandFor(
  names: readonly string[],
  extensionCommands: readonly SlashCommandItem[],
): SlashCommandItem | undefined {
  const wanted = new Set(names.map(bareName));
  return extensionCommands.find(
    (item) =>
      wanted.has(bareName(item.name)) || (item.aliases ?? []).some((alias) => wanted.has(alias)),
  );
}

export function slashMenuEntries(
  listed: readonly SlashCommandSummary[],
  extensionCommands: readonly SlashCommandItem[] = BUILT_IN_SLASH_COMMANDS,
): SlashMenuEntry[] {
  const entries = new Map<string, SlashMenuEntry>();
  for (const command of listed) {
    const name = `/${bareName(command.name)}`;
    const served = extensionCommandFor([command.name, ...command.aliases], extensionCommands);
    if (served !== undefined) {
      const servedName = `/${bareName(served.name)}`;
      if (!entries.has(servedName)) {
        entries.set(servedName, {
          name: servedName,
          description: served.description,
          action: { kind: 'command', command: served.command },
        });
      }
      continue;
    }
    const action: SlashMenuAction | undefined =
      command.prompt === true
        ? { kind: 'prompt' }
        : command.source === 'skill' && !command.runnable
          ? { kind: 'skill' }
          : command.runnable
            ? { kind: 'cli' }
            : undefined;
    if (action === undefined || entries.has(name)) continue;
    entries.set(name, { name, description: command.description, action });
  }
  for (const item of extensionCommands) {
    const name = `/${bareName(item.name)}`;
    if (entries.has(name)) continue;
    entries.set(name, {
      name,
      description: item.description,
      action: { kind: 'command', command: item.command },
    });
  }
  return [...entries.values()].sort((left, right) => left.name.localeCompare(right.name));
}

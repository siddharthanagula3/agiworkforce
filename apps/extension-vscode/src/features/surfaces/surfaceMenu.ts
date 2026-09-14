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
];

export interface SlashCommandItem {
  name: string;
  description: string;
  command: string;
}

export const BUILT_IN_SLASH_COMMANDS: readonly SlashCommandItem[] = [
  {
    name: '/model',
    description: 'Choose the model for this session',
    command: 'agi-workforce.selectModel',
  },
  {
    name: '/resume',
    description: 'Resume a developer session',
    command: 'agi-workforce.showSessionsHistory',
  },
  { name: '/memory', description: 'Workspace memory facts', command: 'agi-workforce.memory' },
  { name: '/skills', description: 'Skills the CLI loads', command: 'agi-workforce.showSkills' },
  { name: '/plugins', description: 'Installed plugins', command: 'agi-workforce.showPlugins' },
  { name: '/mcp', description: 'MCP servers', command: 'agi-workforce.showMcpServers' },
  { name: '/hooks', description: 'Hooks the CLI runs', command: 'agi-workforce.showHooks' },
  {
    name: '/settings',
    description: 'Extension and runtime settings',
    command: 'agi-workforce.openSettings',
  },
  { name: '/clear', description: 'Start a new chat', command: 'agi-workforce.newConversation' },
];

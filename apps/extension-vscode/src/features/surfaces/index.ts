import * as vscode from 'vscode';
import {
  composeSurfaceSections,
  showCapabilityQuickPick,
  showSurfaceQuickPick,
  type SurfaceRowAction,
  type SurfaceTitleAction,
} from './treeQuickPick';
import {
  CLI_CAPABILITY_REQUIREMENT,
  CliCapabilityAdapter,
  type CliCapability,
} from './cliCapabilities';

export {
  buildSurfaceRows,
  composeSurfaceSections,
  showSurfaceQuickPick,
  surfaceSectionItem,
  treeItemDetail,
  treeItemLabel,
  SURFACE_SECTION_CONTEXT,
} from './treeQuickPick';
export {
  CLI_CAPABILITY_METHODS,
  CLI_CAPABILITY_REQUIREMENT,
  CliCapabilityAdapter,
  normalizeCapabilityEntries,
} from './cliCapabilities';
export type {
  CliAccountStatus,
  CliCapability,
  CliCapabilityEntry,
  CliCapabilityResult,
  CliLoginChallenge,
} from './cliCapabilities';
export {
  ACCOUNT_SURFACE_COMMANDS,
  BUILT_IN_SLASH_COMMANDS,
  SURFACE_MENU_ITEMS,
  commandForSurface,
} from './surfaceMenu';
export type { SlashCommandItem, SurfaceMenuItem } from './surfaceMenu';
export { formatSessionAge, mergeSessionRows } from './sessionRows';
export type { SessionOrigin, SessionRow, SessionRowInput, SessionSource } from './sessionRows';

type TreeSource = Pick<vscode.TreeDataProvider<vscode.TreeItem>, 'getChildren'> & {
  onDidChangeTreeData?: vscode.Event<vscode.TreeItem | undefined | null | void>;
};

function exact(...values: readonly string[]): (contextValue: string) => boolean {
  return (contextValue) => values.includes(contextValue);
}

function matching(pattern: RegExp): (contextValue: string) => boolean {
  return (contextValue) => pattern.test(contextValue);
}

export const CONVERSATION_ROW_ACTIONS: readonly SurfaceRowAction[] = [
  {
    command: 'agi-workforce.deleteConversation',
    icon: 'trash',
    tooltip: 'Archive this session',
    matches: exact('conversation'),
  },
];

export const PROJECT_ROW_ACTIONS: readonly SurfaceRowAction[] = [
  {
    command: 'agi-workforce.useProjectInChat',
    icon: 'rocket',
    tooltip: 'Use this project in the chat',
    matches: matching(/^project(Archived)?$/u),
  },
  {
    command: 'agi-workforce.deleteProject',
    icon: 'trash',
    tooltip: 'Delete this project',
    matches: matching(/^project(Archived)?$/u),
  },
];

export const ARTIFACT_ROW_ACTIONS: readonly SurfaceRowAction[] = [
  {
    command: 'agi-workforce.saveArtifactToWorkspace',
    icon: 'save',
    tooltip: 'Save into the workspace',
    matches: matching(/^artifact(Published)?$/u),
  },
  {
    command: 'agi-workforce.openArtifactOnWeb',
    icon: 'globe',
    tooltip: 'Open the published artifact',
    matches: exact('artifactPublished'),
  },
];

export const CLOUD_TASK_ROW_ACTIONS: readonly SurfaceRowAction[] = [
  {
    command: 'agi-workforce.approveCloudTask',
    icon: 'check',
    tooltip: 'Approve this run',
    matches: exact('cloudRunPendingApproval'),
  },
  {
    command: 'agi-workforce.rejectCloudTask',
    icon: 'x',
    tooltip: 'Reject this run',
    matches: exact('cloudRunPendingApproval'),
  },
];

export const SCHEDULE_ROW_ACTIONS: readonly SurfaceRowAction[] = [
  {
    command: 'agi-workforce.runScheduleNow',
    icon: 'play-circle',
    tooltip: 'Run now',
    matches: matching(/^schedule(Active|Paused)$/u),
  },
  {
    command: 'agi-workforce.pauseSchedule',
    icon: 'debug-pause',
    tooltip: 'Pause this schedule',
    matches: exact('scheduleActive'),
  },
  {
    command: 'agi-workforce.resumeSchedule',
    icon: 'debug-start',
    tooltip: 'Resume this schedule',
    matches: exact('schedulePaused'),
  },
  {
    command: 'agi-workforce.showScheduleRuns',
    icon: 'history',
    tooltip: 'Show recent runs',
    matches: matching(/^schedule(Active|Paused)$/u),
  },
];

export const CONNECTOR_ROW_ACTIONS: readonly SurfaceRowAction[] = [
  {
    command: 'agi-workforce.manageConnectors',
    icon: 'link-external',
    tooltip: 'Manage on web',
    matches: matching(/^connector(NeedsReauthorization)?$/u),
  },
];

export const MEMORY_ROW_ACTIONS: readonly SurfaceRowAction[] = [
  {
    command: 'agi-workforce.memory.edit',
    icon: 'edit',
    tooltip: 'Edit this fact',
    matches: exact('memoryFact'),
  },
  {
    command: 'agi-workforce.memory.delete',
    icon: 'trash',
    tooltip: 'Delete this fact',
    matches: exact('memoryFact'),
  },
];

export const CONTEXT_ROW_ACTIONS: readonly SurfaceRowAction[] = [
  {
    command: 'agi-workforce.mentionFileInChat',
    icon: 'mention',
    tooltip: 'Mention this file in chat',
    matches: exact('pinnedFile', 'autoFile'),
  },
  {
    command: 'agi-workforce.removeFromContext',
    icon: 'pinned-dirty',
    tooltip: 'Unpin this file',
    matches: exact('pinnedFile'),
  },
];

export const CONVERSATION_TITLE_ACTIONS: readonly SurfaceTitleAction[] = [
  { command: 'agi-workforce.refreshConversations', icon: 'refresh', tooltip: 'Refresh sessions' },
  { command: 'agi-workforce.newConversation', icon: 'add', tooltip: 'New chat', closes: true },
];

export const PROJECT_TITLE_ACTIONS: readonly SurfaceTitleAction[] = [
  { command: 'agi-workforce.refreshProjects', icon: 'refresh', tooltip: 'Refresh projects' },
  {
    command: 'agi-workforce.createProject',
    icon: 'new-folder',
    tooltip: 'New project',
    closes: true,
  },
  {
    command: 'agi-workforce.openProjectsOnWeb',
    icon: 'link-external',
    tooltip: 'Open projects on web',
    closes: true,
  },
];

export const ARTIFACT_TITLE_ACTIONS: readonly SurfaceTitleAction[] = [
  { command: 'agi-workforce.refreshArtifacts', icon: 'refresh', tooltip: 'Refresh artifacts' },
  {
    command: 'agi-workforce.openArtifactsOnWeb',
    icon: 'link-external',
    tooltip: 'Open artifacts on web',
    closes: true,
  },
];

export const CLOUD_TASK_TITLE_ACTIONS: readonly SurfaceTitleAction[] = [
  { command: 'agi-workforce.refreshCloudTasks', icon: 'refresh', tooltip: 'Refresh cloud tasks' },
  {
    command: 'agi-workforce.openCloudTasksOnWeb',
    icon: 'link-external',
    tooltip: 'Open tasks on web',
    closes: true,
  },
];

export const SCHEDULE_TITLE_ACTIONS: readonly SurfaceTitleAction[] = [
  { command: 'agi-workforce.refreshSchedules', icon: 'refresh', tooltip: 'Refresh schedules' },
  {
    command: 'agi-workforce.openSchedulesOnWeb',
    icon: 'link-external',
    tooltip: 'Open schedules on web',
    closes: true,
  },
];

export const CONNECTOR_TITLE_ACTIONS: readonly SurfaceTitleAction[] = [
  { command: 'agi-workforce.refreshConnectors', icon: 'refresh', tooltip: 'Refresh connectors' },
  {
    command: 'agi-workforce.manageConnectors',
    icon: 'link-external',
    tooltip: 'Manage connectors on web',
    closes: true,
  },
];

export const MEMORY_TITLE_ACTIONS: readonly SurfaceTitleAction[] = [
  {
    command: 'agi-workforce.memory.create',
    icon: 'add',
    tooltip: 'Add a memory fact',
    closes: true,
  },
  {
    command: 'agi-workforce.memory.toggle',
    icon: 'circle-slash',
    tooltip: 'Turn memory on or off',
  },
];

export const CONTEXT_TITLE_ACTIONS: readonly SurfaceTitleAction[] = [
  { command: 'agi-workforce.refreshContext', icon: 'refresh', tooltip: 'Refresh context' },
  { command: 'agi-workforce.addToContext', icon: 'pin', tooltip: 'Pin the active file' },
  { command: 'agi-workforce.clearContext', icon: 'clear-all', tooltip: 'Clear pinned files' },
];

export function openConversationsSurface(provider: TreeSource): Promise<void> {
  return showSurfaceQuickPick({
    title: 'AGI Workforce, Sessions',
    placeholder: 'Resume a developer session…',
    provider,
    rowActions: CONVERSATION_ROW_ACTIONS,
    titleActions: CONVERSATION_TITLE_ACTIONS,
  });
}

export function openProjectsSurface(provider: TreeSource): Promise<void> {
  return showSurfaceQuickPick({
    title: 'AGI Workforce, Projects',
    placeholder: 'Open a project…',
    provider,
    rowActions: PROJECT_ROW_ACTIONS,
    titleActions: PROJECT_TITLE_ACTIONS,
  });
}

export function openArtifactsSurface(provider: TreeSource): Promise<void> {
  return showSurfaceQuickPick({
    title: 'AGI Workforce, Artifacts',
    placeholder: 'Open an artifact…',
    provider,
    rowActions: ARTIFACT_ROW_ACTIONS,
    titleActions: ARTIFACT_TITLE_ACTIONS,
  });
}

export function openCloudTasksSurface(provider: TreeSource): Promise<void> {
  return showSurfaceQuickPick({
    title: 'AGI Workforce, Cloud tasks',
    placeholder: 'Open a cloud task…',
    provider,
    rowActions: CLOUD_TASK_ROW_ACTIONS,
    titleActions: CLOUD_TASK_TITLE_ACTIONS,
  });
}

export function openSchedulesSurface(provider: TreeSource): Promise<void> {
  return showSurfaceQuickPick({
    title: 'AGI Workforce, Schedules',
    placeholder: 'Open a scheduled task…',
    provider,
    rowActions: SCHEDULE_ROW_ACTIONS,
    titleActions: SCHEDULE_TITLE_ACTIONS,
  });
}

export function openWorkSurface(cloudTasks: TreeSource, schedules: TreeSource): Promise<void> {
  return showSurfaceQuickPick({
    title: 'AGI Workforce, Work',
    placeholder: 'Cloud tasks and schedules…',
    provider: composeSurfaceSections([
      { label: 'Cloud tasks', provider: cloudTasks },
      { label: 'Schedules', provider: schedules },
    ]),
    rowActions: [...CLOUD_TASK_ROW_ACTIONS, ...SCHEDULE_ROW_ACTIONS],
    titleActions: CLOUD_TASK_TITLE_ACTIONS,
  });
}

export function openConnectorsSurface(provider: TreeSource): Promise<void> {
  return showSurfaceQuickPick({
    title: 'AGI Workforce, Connectors',
    placeholder: 'Review a connector…',
    provider,
    rowActions: CONNECTOR_ROW_ACTIONS,
    titleActions: CONNECTOR_TITLE_ACTIONS,
  });
}

export function openMemorySurface(provider: TreeSource): Promise<void> {
  return showSurfaceQuickPick({
    title: 'AGI Workforce, Memory',
    placeholder: 'Workspace memory facts…',
    provider,
    rowActions: MEMORY_ROW_ACTIONS,
    titleActions: MEMORY_TITLE_ACTIONS,
  });
}

export function openContextSurface(provider: TreeSource): Promise<void> {
  return showSurfaceQuickPick({
    title: 'AGI Workforce, Context',
    placeholder: 'Files in this conversation’s context…',
    provider,
    rowActions: CONTEXT_ROW_ACTIONS,
    titleActions: CONTEXT_TITLE_ACTIONS,
  });
}

const CAPABILITY_TITLES: Record<string, { title: string; placeholder: string; empty: string }> = {
  skills: {
    title: 'AGI Workforce, Skills',
    placeholder: 'Skills the AGI CLI loads…',
    empty: 'No skills are loaded in this workspace',
  },
  plugins: {
    title: 'AGI Workforce, Plugins',
    placeholder: 'Installed plugins…',
    empty: 'No plugins are installed',
  },
  mcpServers: {
    title: 'AGI Workforce, MCP servers',
    placeholder: 'Configured MCP servers…',
    empty: 'No MCP servers are configured',
  },
  hooks: {
    title: 'AGI Workforce, Hooks',
    placeholder: 'Hooks the AGI CLI runs…',
    empty: 'No hooks are configured',
  },
  instructions: {
    title: 'AGI Workforce, Instructions',
    placeholder: 'Instruction files the AGI CLI loads…',
    empty: 'The CLI loads no instruction files in this workspace',
  },
};

export async function openCapabilitySurface(
  adapter: CliCapabilityAdapter,
  capability: Extract<
    CliCapability,
    'skills' | 'plugins' | 'mcpServers' | 'hooks' | 'instructions'
  >,
): Promise<void> {
  const copy = CAPABILITY_TITLES[capability];
  if (copy === undefined) return;
  const result = await adapter.listEntries(capability);
  if (result.status === 'ok') {
    await showCapabilityQuickPick({
      title: copy.title,
      placeholder: copy.placeholder,
      rows: result.value,
      emptyLabel: copy.empty,
    });
    return;
  }
  await showCapabilityQuickPick({
    title: copy.title,
    placeholder: copy.placeholder,
    rows: [],
    emptyLabel:
      result.status === 'unavailable' && result.reason === CLI_CAPABILITY_REQUIREMENT
        ? `${CLI_CAPABILITY_REQUIREMENT} to list ${copy.title.split(', ')[1]?.toLowerCase() ?? capability}`
        : result.reason,
  });
}

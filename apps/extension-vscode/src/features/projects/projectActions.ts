import * as vscode from 'vscode';
import type {
  ManagedCloudConversation,
  ManagedCloudProject,
  ManagedCloudProjectKnowledgeFile,
} from '@agiworkforce/cloud-contracts';
import {
  describeProjectFailure,
  formatTimestamp,
  isRecoverableProjectFailure,
  knowledgeFileDetail,
  knowledgeFileLabel,
  projectDeleteConsequence,
  projectDescription,
  projectTitle,
} from './projectPresentation';
import {
  clearActiveCloudProject,
  getActiveCloudProject,
  setActiveCloudProject,
} from './activeProject';
import type { ProjectsWorkspace } from './projectsClient';

export const CREATE_PROJECT_COMMAND = 'agi-workforce.createProject';
export const DELETE_PROJECT_COMMAND = 'agi-workforce.deleteProject';
export const USE_PROJECT_IN_CHAT_COMMAND = 'agi-workforce.useProjectInChat';
export const CLEAR_ACTIVE_PROJECT_COMMAND = 'agi-workforce.clearActiveProject';

const DELETE_CONFIRMATION = 'Delete project';
const RETRY_ACTION = 'Retry';
const PROJECT_CONVERSATION_PAGE_LIMIT = 10;
const MAX_PROJECT_NAME_CHARS = 200;
const MAX_PROJECT_INSTRUCTION_CHARS = 10_000;

export interface ProjectActionHost {
  onChanged: () => void;
}

export type ProjectDetailAction = 'use-in-chat' | 'open-web' | 'delete';

export interface ProjectDetailItem extends vscode.QuickPickItem {
  action?: ProjectDetailAction;
}

export function projectWebUrl(projectId: string, webOrigin: string): string {
  return `${webOrigin}/projects/${encodeURIComponent(projectId)}?from=vscode-extension`;
}

export function projectsWebUrl(webOrigin: string): string {
  return `${webOrigin}/projects?from=vscode-extension`;
}

export function buildProjectDetailItems(input: {
  project: ManagedCloudProject;
  knowledgeFiles: readonly ManagedCloudProjectKnowledgeFile[];
  conversations: readonly ManagedCloudConversation[];
  knowledgeError?: string;
  conversationsError?: string;
  isActive: boolean;
}): ProjectDetailItem[] {
  const items: ProjectDetailItem[] = [];

  const description = input.project.description?.trim();
  const instructions = input.project.instructions?.trim();
  if (
    (description !== undefined && description !== '') ||
    (instructions !== undefined && instructions !== '')
  ) {
    items.push({ label: 'About', kind: vscode.QuickPickItemKind.Separator });
    if (description !== undefined && description !== '') {
      items.push({ label: `$(info) ${description}` });
    }
    if (instructions !== undefined && instructions !== '') {
      items.push({ label: '$(note) Instructions', detail: instructions });
    }
  }

  items.push({ label: 'Knowledge files', kind: vscode.QuickPickItemKind.Separator });
  if (input.knowledgeError !== undefined) {
    items.push({ label: `$(warning) ${input.knowledgeError}` });
  } else if (input.knowledgeFiles.length === 0) {
    items.push({ label: '$(circle-slash) No knowledge files in this project' });
  } else {
    for (const file of input.knowledgeFiles) {
      items.push({
        label: `$(file) ${knowledgeFileLabel(file)}`,
        description: knowledgeFileDetail(file),
      });
    }
  }

  items.push({ label: 'Recent conversations', kind: vscode.QuickPickItemKind.Separator });
  if (input.conversationsError !== undefined) {
    items.push({ label: `$(warning) ${input.conversationsError}` });
  } else if (input.conversations.length === 0) {
    items.push({ label: '$(circle-slash) No conversations in this project yet' });
  } else {
    for (const conversation of input.conversations) {
      items.push({
        label: `$(comment-discussion) ${conversation.title.trim() || 'Untitled conversation'}`,
        description: formatTimestamp(conversation.updatedAt),
      });
    }
  }

  items.push({ label: 'Actions', kind: vscode.QuickPickItemKind.Separator });
  items.push({
    label: input.isActive ? '$(check) Used in this chat' : '$(rocket) Use in this chat',
    description: input.isActive
      ? 'Select to stop using it'
      : 'Adds this project and its instructions to VS Code turns',
    action: 'use-in-chat',
  });
  items.push({
    label: '$(link-external) Open on web',
    description: 'Knowledge files and project settings are edited there',
    action: 'open-web',
  });
  items.push({ label: '$(trash) Delete project', action: 'delete' });
  return items;
}

async function readProjectDetail(
  workspace: ProjectsWorkspace,
  projectId: string,
): Promise<{
  project: ManagedCloudProject;
  knowledgeFiles: ManagedCloudProjectKnowledgeFile[];
  conversations: ManagedCloudConversation[];
  knowledgeError?: string;
  conversationsError?: string;
}> {
  const project = await workspace.projects.getProject(projectId);
  const [knowledge, conversations] = await Promise.all([
    workspace.knowledge
      .listKnowledgeFiles(projectId)
      .then((files) => ({ files }))
      .catch((error: unknown) => ({ error: describeProjectFailure(error) })),
    workspace.chat
      .listConversations({ projectId, limit: PROJECT_CONVERSATION_PAGE_LIMIT })
      .then((page) => ({ conversations: page.conversations }))
      .catch((error: unknown) => ({ error: describeProjectFailure(error) })),
  ]);

  return {
    project,
    knowledgeFiles: 'files' in knowledge ? knowledge.files : [],
    conversations: 'conversations' in conversations ? conversations.conversations : [],
    ...('error' in knowledge ? { knowledgeError: knowledge.error } : {}),
    ...('error' in conversations ? { conversationsError: conversations.error } : {}),
  };
}

export interface ProjectDetailHost extends ProjectActionHost {
  webOrigin: string;
  workspaceState: Pick<vscode.Memento, 'get' | 'update'>;
}

export async function showProjectDetail(
  workspace: ProjectsWorkspace,
  projectId: string,
  host: ProjectDetailHost,
): Promise<void> {
  let detail: Awaited<ReturnType<typeof readProjectDetail>>;
  try {
    detail = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'AGI Workforce: opening project…' },
      () => readProjectDetail(workspace, projectId),
    );
  } catch (error) {
    void vscode.window.showErrorMessage(
      `AGI Workforce: this project could not be opened, ${describeProjectFailure(error)}`,
    );
    return;
  }

  const active = getActiveCloudProject(host.workspaceState);
  const picked = await vscode.window.showQuickPick(
    buildProjectDetailItems({ ...detail, isActive: active?.id === detail.project.id }),
    {
      title: projectTitle(detail.project),
      placeHolder: projectDescription(detail.project),
    },
  );
  if (picked?.action === undefined) return;

  if (picked.action === 'open-web') {
    await vscode.env.openExternal(
      vscode.Uri.parse(projectWebUrl(detail.project.id, host.webOrigin)),
    );
    return;
  }

  if (picked.action === 'use-in-chat') {
    await applyProjectToChat(detail.project, host);
    return;
  }

  await deleteProjectInteractively(workspace, detail.project, host);
}

export async function applyProjectToChat(
  project: ManagedCloudProject,
  host: ProjectDetailHost,
): Promise<void> {
  const active = getActiveCloudProject(host.workspaceState);
  if (active?.id === project.id) {
    await clearActiveCloudProject(host.workspaceState);
    void vscode.window.showInformationMessage(
      `AGI Workforce: turns in this workspace no longer use "${projectTitle(project)}".`,
    );
    host.onChanged();
    return;
  }

  const instructions = project.instructions?.trim() ?? '';
  await setActiveCloudProject(host.workspaceState, {
    id: project.id,
    name: projectTitle(project),
    instructions,
  });
  void vscode.window.showInformationMessage(
    instructions === ''
      ? `AGI Workforce: turns in this workspace now name "${projectTitle(project)}". It has no instructions to apply.`
      : `AGI Workforce: turns in this workspace now apply "${projectTitle(project)}" and its instructions.`,
  );
  host.onChanged();
}

export async function createProjectInteractively(
  workspace: ProjectsWorkspace,
  host: ProjectActionHost,
): Promise<ManagedCloudProject | undefined> {
  const name = await vscode.window.showInputBox({
    title: 'AGI Workforce, New Project',
    prompt:
      'A project keeps instructions, knowledge files and chats together. It is created on your AGI Cloud account and appears in the web app, the CLI and mobile.',
    placeHolder: 'Example: Payments service',
    ignoreFocusOut: true,
    validateInput: (value) => {
      const trimmed = value.trim();
      if (trimmed === '') return 'A project needs a name.';
      if (trimmed.length > MAX_PROJECT_NAME_CHARS) {
        return `Keep the name under ${MAX_PROJECT_NAME_CHARS} characters.`;
      }
      return undefined;
    },
  });
  if (name === undefined || name.trim() === '') return undefined;

  const instructions = await vscode.window.showInputBox({
    title: `AGI Workforce, Instructions for "${name.trim()}"`,
    prompt:
      'Applied to every chat in this project, on every client. Leave empty to add them later on the web.',
    placeHolder: 'Example: Prefer TypeScript, and always show the migration before the code.',
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.length > MAX_PROJECT_INSTRUCTION_CHARS
        ? `Keep instructions under ${MAX_PROJECT_INSTRUCTION_CHARS} characters.`
        : undefined,
  });
  if (instructions === undefined) return undefined;

  try {
    const created = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'AGI Workforce: creating project…' },
      () =>
        workspace.projects.createProject({
          name: name.trim(),
          ...(instructions.trim() === '' ? {} : { instructions: instructions.trim() }),
        }),
    );
    void vscode.window.showInformationMessage(
      `AGI Workforce: "${projectTitle(created)}" is on your account, on every client.`,
    );
    return created;
  } catch (error) {
    void vscode.window.showErrorMessage(
      `AGI Workforce: the project was not created, ${describeProjectFailure(error)}`,
    );
    return undefined;
  } finally {
    host.onChanged();
  }
}

export async function deleteProjectInteractively(
  workspace: ProjectsWorkspace,
  project: ManagedCloudProject,
  host: ProjectDetailHost,
): Promise<void> {
  const confirmed = await vscode.window.showWarningMessage(
    `Delete "${projectTitle(project)}"?`,
    { modal: true, detail: projectDeleteConsequence(project) },
    DELETE_CONFIRMATION,
  );
  if (confirmed !== DELETE_CONFIRMATION) return;

  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'AGI Workforce: deleting project…' },
      () => workspace.projects.deleteProject(project.id),
    );
    if (getActiveCloudProject(host.workspaceState)?.id === project.id) {
      await clearActiveCloudProject(host.workspaceState);
    }
    void vscode.window.showInformationMessage(
      `AGI Workforce: "${projectTitle(project)}" was deleted from your account.`,
    );
  } catch (error) {
    const message = `AGI Workforce: the project was not deleted, ${describeProjectFailure(error)}`;
    const answer = isRecoverableProjectFailure(error)
      ? await vscode.window.showErrorMessage(message, RETRY_ACTION)
      : await vscode.window.showErrorMessage(message);
    if (answer === RETRY_ACTION) {
      await deleteProjectInteractively(workspace, project, host);
      return;
    }
  } finally {
    host.onChanged();
  }
}

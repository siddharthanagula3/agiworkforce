import type * as vscode from 'vscode';

export const ACTIVE_CLOUD_PROJECT_KEY = 'agiWorkforce.activeCloudProject';
export const MAX_ACTIVE_PROJECT_INSTRUCTION_CHARS = 8_000;

export interface ActiveCloudProject {
  id: string;
  name: string;
  instructions: string;
}

type ProjectMemento = Pick<vscode.Memento, 'get' | 'update'>;

function isActiveCloudProject(value: unknown): value is ActiveCloudProject {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['id'] === 'string' &&
    candidate['id'] !== '' &&
    typeof candidate['name'] === 'string' &&
    typeof candidate['instructions'] === 'string'
  );
}

export function getActiveCloudProject(memento: ProjectMemento): ActiveCloudProject | undefined {
  const stored = memento.get<unknown>(ACTIVE_CLOUD_PROJECT_KEY);
  return isActiveCloudProject(stored) ? stored : undefined;
}

export async function setActiveCloudProject(
  memento: ProjectMemento,
  project: { id: string; name: string; instructions?: string | null },
): Promise<ActiveCloudProject> {
  const stored: ActiveCloudProject = {
    id: project.id,
    name: project.name.trim() || 'Untitled project',
    instructions: (project.instructions ?? '').slice(0, MAX_ACTIVE_PROJECT_INSTRUCTION_CHARS),
  };
  await memento.update(ACTIVE_CLOUD_PROJECT_KEY, stored);
  return stored;
}

export async function clearActiveCloudProject(memento: ProjectMemento): Promise<void> {
  await memento.update(ACTIVE_CLOUD_PROJECT_KEY, undefined);
}

/**
 * Names only what this surface actually sends. The project's knowledge files
 * are not uploaded with a VS Code turn, so the prelude must not imply they are.
 */
export function formatActiveProjectPrelude(project: ActiveCloudProject | undefined): string {
  if (project === undefined) return '';
  const instructions = project.instructions.trim();
  const escaped = instructions.replace(/<\/project_instructions>/giu, (match) =>
    match.replace(/</gu, '&lt;').replace(/>/gu, '&gt;'),
  );
  const header =
    `## Active AGI Cloud project: ${project.name}\n` +
    'This developer turn belongs to that project. Its knowledge files are not attached here, ask for anything you need from the workspace instead.';
  return instructions === ''
    ? header
    : `${header}\n\n<project_instructions>\n${escaped}\n</project_instructions>`;
}

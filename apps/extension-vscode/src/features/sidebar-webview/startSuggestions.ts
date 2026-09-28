import type * as vscode from 'vscode';
import type { SkillListResponse } from '@agiworkforce/types/protocol';
import { resolveProjectsWorkspace } from '../projects/projectsClient';
import { projectTitle } from '../projects/projectPresentation';
import { resolveConnectorsClient } from '../connectors/connectorsClient';
import { connectorHealth, connectorTitle } from '../connectors/connectorPresentation';
import type { CliCapabilityAdapter } from '../surfaces/cliCapabilities';

const START_SUGGESTION_LIMIT = 3;

export interface StartSuggestions {
  projects: Array<{ id: string; name: string }>;
  skills: Array<{ name: string; description: string }>;
  connectors: Array<{ name: string }>;
}

async function recentProjects(
  secrets: vscode.SecretStorage,
): Promise<StartSuggestions['projects']> {
  const resolution = await resolveProjectsWorkspace(secrets);
  if (resolution.status === 'signed-out') return [];
  const projects = await resolution.workspace.projects
    .listProjects({ limit: START_SUGGESTION_LIMIT, offset: 0 })
    .catch(() => []);
  return projects.map((project) => ({ id: project.id, name: projectTitle(project) }));
}

async function enabledSkills(adapter: CliCapabilityAdapter): Promise<StartSuggestions['skills']> {
  const result = await adapter.call<SkillListResponse>('skills');
  if (result.status !== 'ok') return [];
  return result.value.skills
    .filter((skill) => skill.enabled && skill.consented)
    .slice(0, START_SUGGESTION_LIMIT)
    .map((skill) => ({ name: skill.name, description: skill.description }));
}

async function connectedApps(
  secrets: vscode.SecretStorage,
): Promise<StartSuggestions['connectors']> {
  const resolution = await resolveConnectorsClient(secrets);
  if (resolution.status === 'signed-out') return [];
  const directory = await resolution.client.listConnectors().catch(() => ({ connectors: [] }));
  return directory.connectors
    .filter((connector) => connectorHealth(connector) === 'connected')
    .slice(0, START_SUGGESTION_LIMIT)
    .map((connector) => ({ name: connectorTitle(connector) }));
}

export async function resolveStartSuggestions(
  secrets: vscode.SecretStorage,
  adapter: CliCapabilityAdapter,
): Promise<StartSuggestions> {
  const [projects, skills, connectors] = await Promise.all([
    recentProjects(secrets),
    enabledSkills(adapter),
    connectedApps(secrets),
  ]);
  return { projects, skills, connectors };
}

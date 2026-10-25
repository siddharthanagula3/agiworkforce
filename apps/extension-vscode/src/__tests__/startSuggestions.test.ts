import { describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { resolveStartSuggestions } from '../features/sidebar-webview/startSuggestions';
import type { CliCapabilityAdapter } from '../features/surfaces/cliCapabilities';

type ProjectsClientModule = typeof import('../features/projects/projectsClient');
type ConnectorsClientModule = typeof import('../features/connectors/connectorsClient');

vi.mock('../features/projects/projectsClient', async (importOriginal) => ({
  ...(await importOriginal<ProjectsClientModule>()),
  resolveProjectsWorkspace: vi.fn().mockResolvedValue({ status: 'signed-out' }),
}));
vi.mock('../features/connectors/connectorsClient', async (importOriginal) => ({
  ...(await importOriginal<ConnectorsClientModule>()),
  resolveConnectorsClient: vi.fn().mockResolvedValue({ status: 'signed-out' }),
}));

function skill(name: string, scope: 'project' | 'user' | 'plugin') {
  return {
    name,
    description: `${name} skill`,
    scope,
    path: `/skills/${name}/SKILL.md`,
    enabled: true,
    consented: true,
    requiredTools: [],
    requiredEnvVars: [],
    missingTools: [],
    missingEnvVars: [],
  };
}

describe('empty state suggestions in a code workspace', () => {
  it('offers the workspace skills, not account-wide marketing skills', async () => {
    const adapter = {
      call: vi.fn().mockResolvedValue({
        status: 'ok',
        value: {
          skills: [
            skill('ab-testing', 'user'),
            skill('ads', 'user'),
            skill('ai-seo', 'user'),
            skill('release-checklist', 'project'),
            skill('db-migrations', 'project'),
          ],
        },
      }),
    } as unknown as CliCapabilityAdapter;

    const suggestions = await resolveStartSuggestions({} as vscode.SecretStorage, adapter, {
      connectors: false,
    });

    expect(suggestions.skills.map((entry) => entry.name)).toEqual([
      'release-checklist',
      'db-migrations',
    ]);
  });
});

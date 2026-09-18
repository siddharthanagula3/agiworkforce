import { describe, expect, it } from 'vitest';
import { contextSource } from '@agiworkforce/context';
import { resolveContext, OPEN_ORGANIZATION_CONTEXT_POLICY } from '@agiworkforce/context-engine';
import { projectContextLoaders } from '../scheduled-agent-executor';
import type { LoadedProjectContext } from '../project-context-service';

const PROJECT_ID = 'project-1';

const CONTEXT: LoadedProjectContext = {
  projectId: PROJECT_ID,
  name: 'Launch Plan',
  description: null,
  instructions: 'Answer tersely.',
  knowledgeFiles: [
    {
      fileId: 'file-1',
      fileName: 'pricing.md',
      summary: 'Pricing',
      extractedText: 'Credits are sold at 50 per dollar.',
    },
  ],
  siblingChats: [{ title: 'Pricing thread', preview: 'We settled on credits.' }],
  sources: [
    contextSource({
      sourceClass: 'project_instruction',
      locator: `user_projects/${PROJECT_ID}`,
      projectId: PROJECT_ID,
      ownerUserId: 'user-1',
    }),
    contextSource({
      sourceClass: 'project_knowledge_file',
      locator: 'project_knowledge_files/file-1',
      projectId: PROJECT_ID,
      ownerUserId: 'user-1',
    }),
    contextSource({
      sourceClass: 'project_sibling_chat',
      locator: 'web_conversations/conversation-1',
      projectId: PROJECT_ID,
      ownerUserId: 'user-1',
    }),
  ],
};

describe('projectContextLoaders', () => {
  it('gives each project source class its own loader and its own budget', () => {
    const loaders = projectContextLoaders(CONTEXT);
    expect(loaders.map((loader) => loader.sourceClass)).toEqual([
      'project_instruction',
      'project_knowledge_file',
      'project_sibling_chat',
    ]);
    expect(new Set(loaders.map((loader) => loader.budgetChars)).size).toBe(3);
  });

  it('records what each source contributed to an unattended run', async () => {
    const resolution = await resolveContext({
      turnId: 'schedule-run-1',
      actor: { userId: 'user-1', organizationId: null, projectId: PROJECT_ID },
      policy: OPEN_ORGANIZATION_CONTEXT_POLICY,
      loaders: projectContextLoaders(CONTEXT),
    });

    expect(resolution.manifest.entries.map((entry) => entry.includedCount)).toEqual([1, 1, 1]);
    expect(resolution.manifest.entries.every((entry) => entry.scope === 'project')).toBe(true);
    expect(resolution.itemsOf('project_knowledge_file')[0]?.text).toContain('50 per dollar');
    expect(resolution.itemsOf('project_sibling_chat')[0]?.text).toBe('We settled on credits.');
  });

  it('keeps a project another account owns out of the run', async () => {
    const resolution = await resolveContext({
      turnId: 'schedule-run-2',
      actor: { userId: 'user-2', organizationId: null, projectId: PROJECT_ID },
      policy: OPEN_ORGANIZATION_CONTEXT_POLICY,
      loaders: projectContextLoaders(CONTEXT),
    });

    expect(resolution.items).toHaveLength(0);
    expect(resolution.manifest.entries[0]?.excluded).toEqual([
      { reason: 'permission_denied', count: 1 },
    ]);
  });
});

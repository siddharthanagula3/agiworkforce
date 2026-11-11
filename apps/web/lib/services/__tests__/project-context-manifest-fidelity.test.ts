import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { contextSource } from '@agiworkforce/context';
import { OPEN_ORGANIZATION_CONTEXT_POLICY, resolveContext } from '@agiworkforce/context-engine';

import {
  projectContextLoaders,
  renderProjectContextBlocks,
  type LoadedProjectContext,
} from '../project-context-service';
import { selectKnowledgePassages } from '../project-knowledge-passages';

const PROJECT_ID = 'project-1';
const FILE_CHARS = 16_000;
const FILE_BUDGET_CHARS = 48_000;

function body(label: string): string {
  return label + 'x'.repeat(FILE_CHARS - label.length);
}

function fileSource(fileId: string) {
  return contextSource({
    sourceClass: 'project_knowledge_file',
    locator: `project_knowledge_files/${fileId}`,
    projectId: PROJECT_ID,
    ownerUserId: 'user-1',
  });
}

function knowledgeFile(fileId: string, budgetChars: number) {
  const extractedText = body(fileId);
  return {
    fileId,
    fileName: `${fileId}.txt`,
    summary: null,
    extractedText,
    selection: selectKnowledgePassages({ content: extractedText, query: 'alpha', budgetChars }),
  };
}

function overBudgetContext(): LoadedProjectContext {
  return {
    projectId: PROJECT_ID,
    name: 'Launch Plan',
    description: null,
    instructions: null,
    knowledgeFiles: [
      knowledgeFile('fileA', FILE_CHARS),
      knowledgeFile('fileB', FILE_CHARS),
      knowledgeFile('fileC', FILE_CHARS),
      knowledgeFile('fileD', 0),
    ],
    siblingChats: [],
    sources: ['fileD', 'fileA', 'fileB', 'fileC'].map(fileSource),
  };
}

async function resolve(context: LoadedProjectContext) {
  return resolveContext({
    turnId: 'turn-1',
    actor: { userId: 'user-1', organizationId: null, projectId: PROJECT_ID },
    policy: OPEN_ORGANIZATION_CONTEXT_POLICY,
    loaders: projectContextLoaders(context),
  });
}

describe('projectContextLoaders against what the prompt renders', () => {
  it('records the files the prompt carries when a lower-ranked file was added first', async () => {
    const context = overBudgetContext();
    const resolution = await resolve(context);

    const entry = resolution.manifest.entries.find(
      (candidate) => candidate.sourceClass === 'project_knowledge_file',
    );
    const recorded = resolution
      .itemsOf('project_knowledge_file')
      .map((item) => item.source.provenance.locator);

    expect(recorded).toEqual([
      'project_knowledge_files/fileA',
      'project_knowledge_files/fileB',
      'project_knowledge_files/fileC',
    ]);
    expect(entry?.excludedSourceIds).toEqual([]);
    expect(entry?.budgetUsedChars).toBe(FILE_BUDGET_CHARS);

    const rendered = renderProjectContextBlocks(context)
      .blocks.filter((block) => block.sourceClass === 'project_knowledge_file')
      .map((block) => block.text)
      .join('\n');
    for (const label of ['fileA', 'fileB', 'fileC']) {
      expect(rendered).toContain(body(label));
    }
    expect(rendered).not.toContain(body('fileD'));
  });

  it('does not count a file whose selection is empty as a candidate', async () => {
    const resolution = await resolve(overBudgetContext());

    const texts = resolution.itemsOf('project_knowledge_file').map((item) => item.text);

    expect(texts).toHaveLength(3);
    expect(texts).not.toContain(body('fileD'));
  });

  it('still contributes the extracted text of a file that carries no selection', async () => {
    const context: LoadedProjectContext = {
      ...overBudgetContext(),
      knowledgeFiles: [
        {
          fileId: 'fileA',
          fileName: 'fileA.txt',
          summary: null,
          extractedText: body('fileA'),
        },
      ],
      sources: [fileSource('fileA')],
    };

    const resolution = await resolve(context);

    expect(resolution.itemsOf('project_knowledge_file').map((item) => item.text)).toEqual([
      body('fileA'),
    ]);
  });
});

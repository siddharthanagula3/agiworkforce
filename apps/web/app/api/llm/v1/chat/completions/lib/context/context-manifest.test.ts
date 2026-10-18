import { contextSource } from '@agiworkforce/context';
import { describe, expect, it } from 'vitest';
import { assertNoExternalInstructions, fenceContextSource } from './context-manifest';

const memory = contextSource({
  sourceClass: 'account_memory',
  locator: 'user_memories/mem-1',
  recordId: 'mem-1',
});
const knowledgeFile = contextSource({
  sourceClass: 'project_knowledge_file',
  locator: 'project_knowledge_files/file-1',
  projectId: 'project-1',
});
const projectInstruction = contextSource({
  sourceClass: 'project_instruction',
  locator: 'user_projects/project-1',
  projectId: 'project-1',
});

describe('fenceContextSource', () => {
  it('fences data under the tag its class declares', () => {
    const fenced = fenceContextSource(knowledgeFile, 'Pro costs $20.', 'reference data');
    expect(fenced).toContain('<project_knowledge>');
    expect(fenced).toContain('<!-- reference data -->');
    expect(fenced).toContain('Pro costs $20.');
  });

  it('refuses to fence content the taxonomy trusts as instruction', () => {
    expect(() => fenceContextSource(projectInstruction, 'Answer tersely.', 'x')).toThrow(
      /never fenced/,
    );
  });
});

describe('assertNoExternalInstructions', () => {
  it('passes for the classes the taxonomy defines', () => {
    expect(() =>
      assertNoExternalInstructions([memory, knowledgeFile, projectInstruction]),
    ).not.toThrow();
  });

  it('rejects a source that claims to be external and instruction at once', () => {
    const forged = {
      ...knowledgeFile,
      trust: { ...knowledgeFile.trust, isInstruction: true },
    };
    expect(() => assertNoExternalInstructions([forged])).toThrow(
      /cannot be trusted as instruction/,
    );
  });
});

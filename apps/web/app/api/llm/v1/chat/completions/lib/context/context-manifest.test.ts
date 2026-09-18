import { contextSource } from '@agiworkforce/context';
import { describe, expect, it } from 'vitest';
import {
  assertNoExternalInstructions,
  buildContextManifest,
  contextSourcesById,
  fenceContextSource,
} from './context-manifest';

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

describe('buildContextManifest', () => {
  it('answers what may be exported, retrieved, remembered and instructed from', () => {
    const manifest = buildContextManifest([memory, knowledgeFile], [projectInstruction], undefined);

    expect(manifest.sources).toHaveLength(3);
    expect(manifest.classes).toEqual([
      'account_memory',
      'project_knowledge_file',
      'project_instruction',
    ]);
    expect(manifest.memoryEligible.map((source) => source.id)).toEqual([memory.id]);
    expect(manifest.external.map((source) => source.id)).toEqual([knowledgeFile.id]);
    expect(manifest.instructions.map((source) => source.id)).toEqual([projectInstruction.id]);
    expect(manifest.exportable).toHaveLength(3);
    expect(manifest.retrievable).toHaveLength(3);
  });

  it('keeps one entry per source id when a source is loaded twice', () => {
    const manifest = buildContextManifest([memory], [memory]);
    expect(manifest.sources).toHaveLength(1);
    expect(contextSourcesById(manifest.sources).get(memory.id)).toEqual(memory);
  });
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

import { describe, expect, it } from 'vitest';

import {
  formatProjectSystemPrompt,
  type ProjectContext,
} from '@/lib/services/project-context-service';

function makeContext(files: ProjectContext['knowledgeFiles']): ProjectContext {
  return {
    projectId: 'proj-1',
    name: 'Launch Plan',
    description: null,
    instructions: null,
    knowledgeFiles: files,
    siblingChats: [],
  };
}

describe('formatProjectSystemPrompt knowledge excerpts', () => {
  it('labels a truncated file as a bounded excerpt instead of cutting it silently', () => {
    const extractedText = `${'a'.repeat(19_999)}Z`;
    const prompt = formatProjectSystemPrompt(
      makeContext([{ fileName: 'contract.pdf', summary: null, extractedText }]),
    );

    expect(prompt).toContain('excerptOf');
    expect(prompt).toContain('first 16000 of 20000 extracted characters');
    expect(prompt).toContain('say the file was truncated');
    expect(prompt).not.toContain('Z');
  });

  it('adds no excerpt marker when the whole file fits', () => {
    const prompt = formatProjectSystemPrompt(
      makeContext([
        { fileName: 'pricing.md', summary: null, extractedText: 'Pro costs $20 per month.' },
      ]),
    );

    expect(prompt).toContain('Pro costs $20 per month.');
    expect(prompt).not.toContain('excerptOf');
    expect(prompt).not.toContain('say the file was truncated');
  });

  it('names files whose extracted text was dropped entirely by the total budget', () => {
    const files = ['a', 'b', 'c', 'd'].map((letter, index) => ({
      fileName: `doc-${index + 1}.txt`,
      summary: null,
      extractedText: letter.repeat(16_000),
    }));

    const prompt = formatProjectSystemPrompt(makeContext(files));

    expect(prompt).toContain('doc-4.txt');
    expect(prompt).toContain('did not fit in this turn and was not included at all');
    expect(prompt).not.toContain('d'.repeat(100));
  });
});

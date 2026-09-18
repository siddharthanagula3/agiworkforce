import { describe, expect, it } from 'vitest';

import {
  activeInstructionBlocks,
  firstActiveInstruction,
  isInstructionScope,
  readInstructionBlock,
} from '../instruction-preferences';

describe('reading an instruction block', () => {
  it('is enabled when nothing says otherwise, so instructions written before the flag keep applying', () => {
    expect(readInstructionBlock({ instructions: 'Be brief.' }, 'account')).toEqual({
      scope: 'account',
      text: 'Be brief.',
      enabled: true,
    });
  });

  it('keeps the text when the block is switched off', () => {
    expect(
      readInstructionBlock({ instructions: 'Be brief.', instructionsEnabled: false }, 'account'),
    ).toEqual({ scope: 'account', text: 'Be brief.', enabled: false });
  });

  it('treats whitespace as no instruction at all', () => {
    expect(readInstructionBlock({ instructions: '   ' }, 'project').text).toBeNull();
  });

  it('truncates rather than storing an unbounded instruction', () => {
    expect(readInstructionBlock({ instructions: 'x'.repeat(5000) }, 'account').text).toHaveLength(
      2000,
    );
  });
});

describe('which blocks reach the model', () => {
  const account = { scope: 'account' as const, text: 'Cite sources.', enabled: true };
  const project = { scope: 'project' as const, text: 'Use TypeScript.', enabled: true };
  const workspace = { scope: 'workspace' as const, text: 'British English.', enabled: true };

  it('orders account, then workspace, then project', () => {
    expect(activeInstructionBlocks([project, account, workspace]).map((b) => b.scope)).toEqual([
      'account',
      'workspace',
      'project',
    ]);
  });

  it('drops a block that is switched off even though it has text', () => {
    expect(activeInstructionBlocks([{ ...account, enabled: false }, project])).toEqual([project]);
  });

  it('drops a block that is enabled but empty', () => {
    expect(activeInstructionBlocks([{ ...account, text: null }])).toEqual([]);
  });

  it('answers with the broadest active instruction', () => {
    expect(firstActiveInstruction([project, account])).toBe('Cite sources.');
    expect(firstActiveInstruction([{ ...account, enabled: false }, project])).toBe(
      'Use TypeScript.',
    );
    expect(firstActiveInstruction([])).toBeNull();
  });
});

describe('the scope vocabulary', () => {
  it('names account, workspace and project and nothing else', () => {
    expect(isInstructionScope('account')).toBe(true);
    expect(isInstructionScope('workspace')).toBe(true);
    expect(isInstructionScope('project')).toBe(true);
    expect(isInstructionScope('general')).toBe(false);
    expect(isInstructionScope('personalization')).toBe(false);
  });
});

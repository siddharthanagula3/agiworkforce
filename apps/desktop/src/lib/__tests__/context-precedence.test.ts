import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_INSTRUCTION,
  CONTEXT_PRECEDENCE,
  CURRENT_REQUEST,
  isInstructionEntry,
  orderLocalPromptBlocks,
  precedenceRank,
  type LocalPromptBlock,
} from '../context-precedence';

describe('the local prompt reads the shared precedence order', () => {
  it('puts the security policy above the current request', () => {
    expect(precedenceRank('security_policy')).toBeLessThan(precedenceRank(CURRENT_REQUEST));
  });

  it('puts the current request above every stored instruction', () => {
    for (const entry of [
      'project_instruction',
      'template_instruction',
      ACCOUNT_INSTRUCTION,
    ] as const)
      expect(precedenceRank(CURRENT_REQUEST)).toBeLessThan(precedenceRank(entry));
  });

  it('puts fetched material last, since it is the only kind an attacker writes', () => {
    const last = CONTEXT_PRECEDENCE[CONTEXT_PRECEDENCE.length - 1];
    expect(last).toBe('web_result');
    expect(isInstructionEntry('web_result')).toBe(false);
    expect(isInstructionEntry('connector_result')).toBe(false);
  });

  it('orders a shuffled set the same way every time', () => {
    const blocks: LocalPromptBlock[] = [
      { entry: 'web_result', text: 'a fetched page' },
      { entry: ACCOUNT_INSTRUCTION, text: 'answer briefly' },
      { entry: 'security_policy', text: 'the policy' },
      { entry: CURRENT_REQUEST, text: 'explain this in full' },
    ];
    expect(orderLocalPromptBlocks(blocks).map((block) => block.entry)).toEqual([
      'security_policy',
      CURRENT_REQUEST,
      ACCOUNT_INSTRUCTION,
      'web_result',
    ]);
  });

  it('keeps material rather than dropping it, so the caller can fence it', () => {
    const ordered = orderLocalPromptBlocks([{ entry: 'user_upload', text: 'a file' }]);
    expect(ordered).toHaveLength(1);
  });
});

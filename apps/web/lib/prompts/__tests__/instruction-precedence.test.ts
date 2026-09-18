import { describe, expect, it } from 'vitest';

import {
  CONTEXT_ONLY_INSTRUCTION_LAYERS,
  INSTRUCTION_LAYERS,
  instructionLayerRank,
  instructionOrderProblems,
  isContextOnlyInstructionLayer,
  isInstructionLayer,
  orderInstructionBlocks,
} from '../instruction-precedence';

describe('instruction precedence', () => {
  it('ranks system above developer above project above personalized', () => {
    expect(INSTRUCTION_LAYERS.slice(0, 4)).toEqual([
      'system',
      'developer',
      'project',
      'personalized',
    ]);
    expect(instructionLayerRank('system')).toBeLessThan(instructionLayerRank('developer'));
    expect(instructionLayerRank('developer')).toBeLessThan(instructionLayerRank('project'));
    expect(instructionLayerRank('project')).toBeLessThan(instructionLayerRank('personalized'));
  });

  it('separates memory and connected-tool context from the instruction layers', () => {
    expect(CONTEXT_ONLY_INSTRUCTION_LAYERS).toEqual(['memory', 'untrusted_context']);
    expect(isContextOnlyInstructionLayer('memory')).toBe(true);
    expect(isContextOnlyInstructionLayer('personalized')).toBe(false);
    for (const layer of CONTEXT_ONLY_INSTRUCTION_LAYERS) {
      expect(instructionLayerRank(layer)).toBeGreaterThan(instructionLayerRank('personalized'));
    }
  });

  it('accepts only the layers it declares', () => {
    expect(isInstructionLayer('system')).toBe(true);
    expect(isInstructionLayer('user')).toBe(false);
    expect(isInstructionLayer('toString')).toBe(false);
  });

  it('passes an order that honours the hierarchy and names every inversion', () => {
    expect(instructionOrderProblems([...INSTRUCTION_LAYERS])).toEqual([]);
    expect(instructionOrderProblems(['system', 'system', 'memory'])).toEqual([]);
    expect(instructionOrderProblems(['memory', 'system'])).toEqual([
      'memory is assembled ahead of system, which outranks it',
    ]);
    expect(instructionOrderProblems(['personalized', 'project', 'developer'])).toHaveLength(3);
  });

  it('orders blocks by rank and keeps one layer in the order it was built', () => {
    const ordered = orderInstructionBlocks([
      { layer: 'memory', text: 'remembered' },
      { layer: 'system', text: 'first' },
      { layer: 'system', text: 'second' },
      { layer: 'personalized', text: 'custom' },
    ]);

    expect(ordered.map((block) => block.text)).toEqual(['first', 'second', 'custom', 'remembered']);
  });
});

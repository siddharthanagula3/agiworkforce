import {
  CONTEXT_SOURCE_CLASSES,
  contextSourceClassPolicy,
  contextTrustLevel,
  INSTRUCTION_CONFLICTS as CONTRACT_CONFLICTS,
  INSTRUCTION_LAYERS as CONTRACT_LAYERS,
} from '@agiworkforce/context';
import { describe, expect, it } from 'vitest';

import {
  CONTEXT_ONLY_INSTRUCTION_LAYERS,
  INSTRUCTION_CONFLICTS,
  INSTRUCTION_LAYERS,
  instructionLayerForContextClass,
  instructionLayerRank,
  instructionLayerTrust,
  instructionLayerTrustMismatches,
  instructionOrderProblems,
  isContextOnlyInstructionLayer,
  isInstructionLayer,
  orderInstructionBlocks,
  resolveInstructionConflict,
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

describe('the web app resolves conflicts from the shared contract', () => {
  it('serves the same layers and the same conflict table the contract declares', () => {
    expect([...INSTRUCTION_LAYERS]).toEqual([...CONTRACT_LAYERS]);
    expect(INSTRUCTION_CONFLICTS).toBe(CONTRACT_CONFLICTS);
  });

  it('gives every pair of layers one documented winner and one documented outcome', () => {
    for (const [index, winner] of INSTRUCTION_LAYERS.entries()) {
      for (const loser of INSTRUCTION_LAYERS.slice(index + 1)) {
        const rule = resolveInstructionConflict(loser, winner);
        expect(rule.winner, `${winner} vs ${loser}`).toBe(winner);
        expect(rule.loser).toBe(loser);
        expect(rule.loserBecomes).toBe(
          instructionLayerTrust(loser) === 'instruction'
            ? 'narrowed'
            : instructionLayerTrust(loser) === 'reference'
              ? 'ignored'
              : 'quoted',
        );
      }
    }
  });

  it('never promotes a retrieved document or a tool result into an instruction layer', () => {
    expect(instructionLayerTrustMismatches()).toEqual([]);
    for (const sourceClass of CONTEXT_SOURCE_CLASSES) {
      const layer = instructionLayerForContextClass(sourceClass);
      expect(instructionLayerTrust(layer), sourceClass).toBe(
        contextTrustLevel(contextSourceClassPolicy(sourceClass)),
      );
      if (contextSourceClassPolicy(sourceClass).isExternal) {
        expect(isContextOnlyInstructionLayer(layer), sourceClass).toBe(true);
      }
    }
    expect(instructionLayerForContextClass('connector_result')).toBe('untrusted_context');
    expect(instructionLayerForContextClass('web_result')).toBe('untrusted_context');
  });
});

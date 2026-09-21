import { describe, expect, it } from 'vitest';

import {
  CONTEXT_BUDGET_PRIORITY,
  CONTEXT_SOURCE_CLASSES,
  CONTEXT_SOURCE_PRECEDENCE,
  contextSourceClassPolicy,
  contextTrustLevel,
  type ContextSourceClass,
} from '../context-source';
import {
  CONTEXT_ONLY_INSTRUCTION_LAYERS,
  INSTRUCTION_CONFLICTS,
  INSTRUCTION_LAYERS,
  contextClassesInInstructionLayer,
  describeInstructionConflictOutcome,
  describeInstructionLayer,
  instructionLayerForContextClass,
  instructionLayerForTrust,
  instructionLayerRank,
  instructionLayerTrust,
  instructionLayerTrustMismatches,
  instructionOrderProblems,
  isContextOnlyInstructionLayer,
  isInstructionLayer,
  orderInstructionBlocks,
  precedenceDisagreements,
  resolveInstructionConflict,
  type InstructionConflictOutcome,
  type InstructionLayer,
} from '../instruction-precedence';

const OUTCOME_FOR_TRUST: Readonly<Record<string, InstructionConflictOutcome>> = {
  instruction: 'narrowed',
  reference: 'ignored',
  untrusted: 'quoted',
};

describe('instruction layers', () => {
  it('recognises its own layers and nothing else', () => {
    for (const layer of INSTRUCTION_LAYERS) expect(isInstructionLayer(layer)).toBe(true);
    expect(isInstructionLayer('tool_result')).toBe(false);
    expect(isInstructionLayer(7)).toBe(false);
  });

  it('ranks every layer and describes it', () => {
    const ranks = INSTRUCTION_LAYERS.map((layer) => instructionLayerRank(layer));
    expect(ranks).toEqual([...ranks].sort((left, right) => left - right));
    expect(new Set(ranks).size).toBe(INSTRUCTION_LAYERS.length);
    for (const layer of INSTRUCTION_LAYERS) {
      expect(describeInstructionLayer(layer).length).toBeGreaterThan(0);
    }
  });

  it('treats exactly the non-instruction layers as context only', () => {
    for (const layer of INSTRUCTION_LAYERS) {
      expect(isContextOnlyInstructionLayer(layer), layer).toBe(
        instructionLayerTrust(layer) !== 'instruction',
      );
    }
    expect([...CONTEXT_ONLY_INSTRUCTION_LAYERS]).toEqual(['memory', 'untrusted_context']);
  });

  it('groups the layers by the trust level they carry', () => {
    expect(instructionLayerForTrust('untrusted')).toEqual(['untrusted_context']);
    expect(instructionLayerForTrust('reference')).toEqual(['memory']);
    expect(instructionLayerForTrust('instruction')).toEqual([
      'system',
      'developer',
      'project',
      'personalized',
    ]);
  });
});

describe('every context class lands in the layer its trust allows', () => {
  it('maps all of them, with no trust mismatch', () => {
    expect(instructionLayerTrustMismatches()).toEqual([]);
    for (const sourceClass of CONTEXT_SOURCE_CLASSES) {
      const layer = instructionLayerForContextClass(sourceClass);
      expect(isInstructionLayer(layer), sourceClass).toBe(true);
      expect(instructionLayerTrust(layer), sourceClass).toBe(
        contextTrustLevel(contextSourceClassPolicy(sourceClass)),
      );
    }
  });

  it('never lets externally authored material reach an instruction layer', () => {
    for (const sourceClass of CONTEXT_SOURCE_CLASSES) {
      const policy = contextSourceClassPolicy(sourceClass);
      if (!policy.isExternal) continue;
      expect(instructionLayerForContextClass(sourceClass), sourceClass).toBe('untrusted_context');
    }
  });

  it('accounts for every class exactly once across the layers', () => {
    const grouped = INSTRUCTION_LAYERS.flatMap((layer) => contextClassesInInstructionLayer(layer));
    expect([...grouped].sort()).toEqual([...CONTEXT_SOURCE_CLASSES].sort());
  });
});

describe('assembly order', () => {
  it('reports each lower layer placed ahead of a higher one', () => {
    expect(instructionOrderProblems(['system', 'developer', 'memory'])).toEqual([]);
    expect(instructionOrderProblems(['untrusted_context', 'developer', 'memory'])).toEqual([
      'untrusted_context is assembled ahead of developer, which outranks it',
      'untrusted_context is assembled ahead of memory, which outranks it',
    ]);
  });

  it('sorts by rank and keeps a layer’s own sections in the order they were built', () => {
    const ordered = orderInstructionBlocks([
      { layer: 'memory', text: 'recalled' },
      { layer: 'developer', text: 'second developer block' },
      { layer: 'system', text: 'product prompt' },
      { layer: 'untrusted_context', text: 'connector page' },
    ]);
    expect(ordered.map((block) => block.layer)).toEqual([
      'system',
      'developer',
      'memory',
      'untrusted_context',
    ]);
    expect(instructionOrderProblems(ordered.map((block) => block.layer))).toEqual([]);
  });

  it('keeps two blocks of one layer in their original order', () => {
    const ordered = orderInstructionBlocks([
      { layer: 'developer', text: 'first' },
      { layer: 'developer', text: 'second' },
    ]);
    expect(ordered.map((block) => block.text)).toEqual(['first', 'second']);
  });
});

describe('conflict table', () => {
  it('holds every ordered pair of distinct layers exactly once', () => {
    const expected = INSTRUCTION_LAYERS.flatMap((winner, index) =>
      INSTRUCTION_LAYERS.slice(index + 1).map((loser) => `${winner}>${loser}`),
    );
    expect(INSTRUCTION_CONFLICTS.map((rule) => `${rule.winner}>${rule.loser}`)).toEqual(expected);
  });

  it('always gives the pair to the higher-ranked layer', () => {
    for (const rule of INSTRUCTION_CONFLICTS) {
      expect(instructionLayerRank(rule.winner), `${rule.winner} vs ${rule.loser}`).toBeLessThan(
        instructionLayerRank(rule.loser),
      );
    }
  });

  it('decides what the loser becomes from the trust the losing layer carries', () => {
    for (const rule of INSTRUCTION_CONFLICTS) {
      expect(rule.loserBecomes, `${rule.winner} vs ${rule.loser}`).toBe(
        OUTCOME_FOR_TRUST[instructionLayerTrust(rule.loser)],
      );
      expect(describeInstructionConflictOutcome(rule.loserBecomes).length).toBeGreaterThan(0);
    }
  });

  it('resolves a pair given in either order', () => {
    const forward = resolveInstructionConflict('project', 'memory');
    const backward = resolveInstructionConflict('memory', 'project');
    expect(forward).toEqual(backward);
    expect(forward.winner).toBe('project');
    expect(forward.loserBecomes).toBe('ignored');
  });

  it('refuses a pair it has no rule for', () => {
    expect(() => resolveInstructionConflict('system', 'system' as InstructionLayer)).toThrowError(
      /No conflict rule/u,
    );
  });
});

describe('two declared orders', () => {
  it('finds nothing when they agree on every shared pair', () => {
    expect(precedenceDisagreements(['a', 'b', 'c'], ['a', 'b', 'c', 'd'])).toEqual([]);
    expect(precedenceDisagreements(['a', 'b'], ['x', 'a', 'y', 'b'])).toEqual([]);
  });

  it('names each pair the two orders rank oppositely', () => {
    expect(precedenceDisagreements(['a', 'b', 'c'], ['c', 'b', 'a'])).toEqual([
      { first: 'a', second: 'b' },
      { first: 'a', second: 'c' },
      { first: 'b', second: 'c' },
    ]);
  });
});

describe('the source order and the layer ranks are one hierarchy', () => {
  const observed = CONTEXT_SOURCE_PRECEDENCE.map((sourceClass) =>
    instructionLayerForContextClass(sourceClass),
  );

  it('assembles the classes in this order', () => {
    expect([...CONTEXT_SOURCE_PRECEDENCE]).toEqual([
      'security_policy',
      'agent_instruction',
      'template_instruction',
      'current_task_state',
      'project_instruction',
      'local_repository_instruction',
      'account_memory',
      'project_sibling_chat',
      'past_chat',
      'library_file',
      'user_upload',
      'project_knowledge_file',
      'connector_result',
      'web_result',
    ]);
  });

  it('never reads a lower layer before a higher one', () => {
    expect(instructionOrderProblems(observed)).toEqual([]);
  });

  it('gives up the least trusted material first when the budget runs out', () => {
    const dropOrder = [...CONTEXT_SOURCE_PRECEDENCE].reverse();
    const firstInstruction = dropOrder.findIndex(
      (sourceClass) => contextSourceClassPolicy(sourceClass).isInstruction,
    );
    const lastData = dropOrder.reduce(
      (last, sourceClass, index) =>
        contextSourceClassPolicy(sourceClass).isInstruction ? last : index,
      -1,
    );
    expect(lastData).toBeLessThan(firstInstruction);
  });
});

describe('what is kept when the turn does not fit', () => {
  it('keeps them in this order', () => {
    expect([...CONTEXT_BUDGET_PRIORITY]).toEqual([
      'security_policy',
      'agent_instruction',
      'template_instruction',
      'project_instruction',
      'local_repository_instruction',
      'current_task_state',
      'user_upload',
      'account_memory',
      'project_knowledge_file',
      'project_sibling_chat',
      'past_chat',
      'library_file',
      'connector_result',
      'web_result',
    ]);
  });

  it('gives up nothing the account or the workspace wrote while material is still there', () => {
    const lastInstruction = CONTEXT_BUDGET_PRIORITY.reduce(
      (last, sourceClass, index) =>
        contextSourceClassPolicy(sourceClass).isInstruction ? index : last,
      -1,
    );
    const firstMaterial = CONTEXT_BUDGET_PRIORITY.findIndex(
      (sourceClass) => !contextSourceClassPolicy(sourceClass).isInstruction,
    );
    expect(lastInstruction).toBeLessThan(firstMaterial);
  });
});

describe('the two orders are tied to each other', () => {
  // Every pair the two orders are allowed to rank differently, and why. A pair
  // that is not here means one list was edited and the other was dragged along.
  const MAY_DIFFER: ReadonlyArray<readonly [ContextSourceClass, ContextSourceClass]> = [
    // Material supplied for this turn is read last because nobody vouches for
    // it, and given up last because it is what the question is about.
    ['account_memory', 'user_upload'],
    ['project_sibling_chat', 'user_upload'],
    ['past_chat', 'user_upload'],
    ['library_file', 'user_upload'],
    ['project_sibling_chat', 'project_knowledge_file'],
    ['past_chat', 'project_knowledge_file'],
    ['library_file', 'project_knowledge_file'],
    // What the running task says about this step wins a conflict with the
    // standing project instructions, and is the first of the three to go.
    ['current_task_state', 'project_instruction'],
    ['current_task_state', 'local_repository_instruction'],
  ];

  const asKey = (first: string, second: string) => `${first} vs ${second}`;

  it('ranks the same classes', () => {
    expect([...CONTEXT_BUDGET_PRIORITY].sort()).toEqual([...CONTEXT_SOURCE_PRECEDENCE].sort());
  });

  it('puts instruction ahead of material in both', () => {
    for (const order of [CONTEXT_SOURCE_PRECEDENCE, CONTEXT_BUDGET_PRIORITY]) {
      const lastInstruction = order.reduce(
        (last, sourceClass, index) =>
          contextSourceClassPolicy(sourceClass).isInstruction ? index : last,
        -1,
      );
      const firstMaterial = order.findIndex(
        (sourceClass) => !contextSourceClassPolicy(sourceClass).isInstruction,
      );
      expect(lastInstruction).toBeLessThan(firstMaterial);
    }
  });

  it('differs on exactly the pairs named above and on no other', () => {
    const observed = precedenceDisagreements(CONTEXT_SOURCE_PRECEDENCE, CONTEXT_BUDGET_PRIORITY)
      .map((pair) => asKey(pair.first, pair.second))
      .sort();
    expect(observed).toEqual(MAY_DIFFER.map(([first, second]) => asKey(first, second)).sort());
  });

  it('starts both lists with the same class and ends both with the same class', () => {
    expect(CONTEXT_BUDGET_PRIORITY[0]).toBe(CONTEXT_SOURCE_PRECEDENCE[0]);
    const last = CONTEXT_SOURCE_PRECEDENCE.length - 1;
    expect(CONTEXT_BUDGET_PRIORITY[last]).toBe(CONTEXT_SOURCE_PRECEDENCE[last]);
  });
});

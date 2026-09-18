/**
 * The canonical order of the instruction layers a turn assembles.
 *
 * Assembly order used to be pinned by one test and stated nowhere, so "which
 * instruction wins" was whatever the request processor happened to concatenate
 * first. The hierarchy below is the product rule: a layer may only appear ahead
 * of layers that rank lower than it, and the two layers at the bottom are
 * context rather than instructions.
 */

export const INSTRUCTION_LAYERS = [
  'system',
  'developer',
  'project',
  'personalized',
  'memory',
  'untrusted_context',
] as const;

export type InstructionLayer = (typeof INSTRUCTION_LAYERS)[number];

/** Layers the model must treat as reference material, never as commands. */
export const CONTEXT_ONLY_INSTRUCTION_LAYERS: readonly InstructionLayer[] = [
  'memory',
  'untrusted_context',
];

const LAYER_DESCRIPTIONS: Readonly<Record<InstructionLayer, string>> = {
  system: 'the product system prompt, which no other layer may override',
  developer: 'developer and product instructions supplied with the request',
  project: 'instructions attached to the workspace or project',
  personalized: 'the account holder personalized instructions',
  memory: 'recalled account memory and past chats',
  untrusted_context: 'content pulled in from connected tools and documents',
};

export function isInstructionLayer(value: unknown): value is InstructionLayer {
  return typeof value === 'string' && (INSTRUCTION_LAYERS as readonly string[]).includes(value);
}

export function instructionLayerRank(layer: InstructionLayer): number {
  return INSTRUCTION_LAYERS.indexOf(layer);
}

export function describeInstructionLayer(layer: InstructionLayer): string {
  return LAYER_DESCRIPTIONS[layer];
}

export function isContextOnlyInstructionLayer(layer: InstructionLayer): boolean {
  return CONTEXT_ONLY_INSTRUCTION_LAYERS.includes(layer);
}

export interface InstructionBlock {
  readonly layer: InstructionLayer;
  readonly text: string;
}

/**
 * Every place a lower-precedence layer was assembled ahead of a higher one.
 * Empty means the observed order honours the hierarchy.
 */
export function instructionOrderProblems(observed: readonly InstructionLayer[]): string[] {
  const problems: string[] = [];
  for (const [index, layer] of observed.entries()) {
    for (const earlier of observed.slice(0, index)) {
      if (instructionLayerRank(earlier) > instructionLayerRank(layer)) {
        problems.push(`${earlier} is assembled ahead of ${layer}, which outranks it`);
      }
    }
  }
  return problems;
}

/**
 * Stable sort by rank: blocks of one layer keep the order the caller built them
 * in, so ordering never silently reshuffles a layer's own sections.
 */
export function orderInstructionBlocks(
  blocks: readonly InstructionBlock[],
): readonly InstructionBlock[] {
  return blocks
    .map((block, index) => ({ block, index }))
    .sort(
      (left, right) =>
        instructionLayerRank(left.block.layer) - instructionLayerRank(right.block.layer) ||
        left.index - right.index,
    )
    .map((entry) => entry.block);
}

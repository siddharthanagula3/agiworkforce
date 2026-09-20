import {
  CONTEXT_SOURCE_CLASSES,
  contextSourceClassPolicy,
  contextTrustLevel,
  type ContextSourceClass,
  type ContextTrustLevel,
} from './context-source';

// The layers a turn's system message is assembled from, highest authority first.
// Every surface orders by this and nothing else decides which instruction wins.
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

const LAYER_TRUST: Readonly<Record<InstructionLayer, ContextTrustLevel>> = {
  system: 'instruction',
  developer: 'instruction',
  project: 'instruction',
  personalized: 'instruction',
  memory: 'reference',
  untrusted_context: 'untrusted',
};

// Which layer a loaded context class lands in. The taxonomy's own trust level
// forces the choice, so a retrieved document can never reach an instruction layer.
const CLASS_LAYERS: { readonly [K in ContextSourceClass]: InstructionLayer } = {
  security_policy: 'system',
  agent_instruction: 'developer',
  template_instruction: 'developer',
  current_task_state: 'developer',
  project_instruction: 'project',
  local_repository_instruction: 'project',
  account_memory: 'memory',
  past_chat: 'memory',
  project_sibling_chat: 'memory',
  library_file: 'memory',
  project_knowledge_file: 'untrusted_context',
  user_upload: 'untrusted_context',
  connector_result: 'untrusted_context',
  web_result: 'untrusted_context',
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

export function instructionLayerTrust(layer: InstructionLayer): ContextTrustLevel {
  return LAYER_TRUST[layer];
}

export function isContextOnlyInstructionLayer(layer: InstructionLayer): boolean {
  return CONTEXT_ONLY_INSTRUCTION_LAYERS.includes(layer);
}

export function instructionLayerForContextClass(sourceClass: ContextSourceClass): InstructionLayer {
  return CLASS_LAYERS[sourceClass];
}

export function contextClassesInInstructionLayer(
  layer: InstructionLayer,
): readonly ContextSourceClass[] {
  return CONTEXT_SOURCE_CLASSES.filter((sourceClass) => CLASS_LAYERS[sourceClass] === layer);
}

/** The layer a class of context may never be promoted above. */
export function instructionLayerForTrust(trust: ContextTrustLevel): readonly InstructionLayer[] {
  return INSTRUCTION_LAYERS.filter((layer) => LAYER_TRUST[layer] === trust);
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

/**
 * What happens to the losing layer's text, which is the part a rank alone never
 * says: a narrowed instruction still applies elsewhere, an ignored one does not.
 */
export type InstructionConflictOutcome = 'narrowed' | 'ignored' | 'quoted';

export interface InstructionConflictRule {
  readonly winner: InstructionLayer;
  readonly loser: InstructionLayer;
  readonly loserBecomes: InstructionConflictOutcome;
}

const CONFLICT_OUTCOMES: Readonly<Record<InstructionConflictOutcome, string>> = {
  narrowed: 'kept, and applied only where it does not contradict the winning layer',
  ignored: 'dropped for the contested subject; a recalled fact never sets a directive',
  quoted: 'never followed; the text is reported as data the turn read',
};

export const INSTRUCTION_CONFLICTS: readonly InstructionConflictRule[] = [
  { winner: 'system', loser: 'developer', loserBecomes: 'narrowed' },
  { winner: 'system', loser: 'project', loserBecomes: 'narrowed' },
  { winner: 'system', loser: 'personalized', loserBecomes: 'narrowed' },
  { winner: 'system', loser: 'memory', loserBecomes: 'ignored' },
  { winner: 'system', loser: 'untrusted_context', loserBecomes: 'quoted' },
  { winner: 'developer', loser: 'project', loserBecomes: 'narrowed' },
  { winner: 'developer', loser: 'personalized', loserBecomes: 'narrowed' },
  { winner: 'developer', loser: 'memory', loserBecomes: 'ignored' },
  { winner: 'developer', loser: 'untrusted_context', loserBecomes: 'quoted' },
  { winner: 'project', loser: 'personalized', loserBecomes: 'narrowed' },
  { winner: 'project', loser: 'memory', loserBecomes: 'ignored' },
  { winner: 'project', loser: 'untrusted_context', loserBecomes: 'quoted' },
  { winner: 'personalized', loser: 'memory', loserBecomes: 'ignored' },
  { winner: 'personalized', loser: 'untrusted_context', loserBecomes: 'quoted' },
  { winner: 'memory', loser: 'untrusted_context', loserBecomes: 'quoted' },
];

export function describeInstructionConflictOutcome(outcome: InstructionConflictOutcome): string {
  return CONFLICT_OUTCOMES[outcome];
}

export function resolveInstructionConflict(
  left: InstructionLayer,
  right: InstructionLayer,
): InstructionConflictRule {
  const rule = INSTRUCTION_CONFLICTS.find(
    (candidate) =>
      (candidate.winner === left && candidate.loser === right) ||
      (candidate.winner === right && candidate.loser === left),
  );
  if (!rule) {
    throw new Error(`No conflict rule pairs ${left} with ${right}`);
  }
  return rule;
}

export interface PrecedenceDisagreement {
  readonly first: string;
  readonly second: string;
}

/**
 * Pairs two declared orders and returns every pair they rank oppositely. Two
 * modules that each call themselves the one order have to return nothing here.
 */
export function precedenceDisagreements(
  left: readonly string[],
  right: readonly string[],
): readonly PrecedenceDisagreement[] {
  const shared = left.filter((entry) => right.includes(entry));
  const disagreements: PrecedenceDisagreement[] = [];
  for (const [index, first] of shared.entries()) {
    for (const second of shared.slice(index + 1)) {
      if (right.indexOf(first) > right.indexOf(second)) {
        disagreements.push({ first, second });
      }
    }
  }
  return disagreements;
}

/** Every context class whose trust level does not permit the layer it maps to. */
export function instructionLayerTrustMismatches(): readonly string[] {
  return CONTEXT_SOURCE_CLASSES.filter((sourceClass) => {
    const trust = contextTrustLevel(contextSourceClassPolicy(sourceClass));
    return LAYER_TRUST[CLASS_LAYERS[sourceClass]] !== trust;
  });
}

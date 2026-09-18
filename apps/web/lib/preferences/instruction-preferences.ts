export const INSTRUCTION_SCOPES = ['account', 'workspace', 'project'] as const;
export type InstructionScope = (typeof INSTRUCTION_SCOPES)[number];

export const MAX_INSTRUCTION_LENGTH = 2000;

export interface InstructionBlock {
  scope: InstructionScope;
  text: string | null;
  enabled: boolean;
}

export function isInstructionScope(value: unknown): value is InstructionScope {
  return typeof value === 'string' && (INSTRUCTION_SCOPES as readonly string[]).includes(value);
}

function normalizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

/**
 * Reads one instruction block out of a stored settings namespace.
 *
 * `enabled` defaults to true so every instruction written before this field
 * existed keeps applying. Clearing the text and switching the block off are
 * different acts: a user who turns their instructions off for one piece of work
 * must get them back unchanged, which is impossible if the only way to stop
 * them is to delete them.
 */
export function readInstructionBlock(
  namespace: Record<string, unknown>,
  scope: InstructionScope,
  keys: { text?: string; enabled?: string } = {},
): InstructionBlock {
  const textKey = keys.text ?? 'instructions';
  const enabledKey = keys.enabled ?? 'instructionsEnabled';
  return {
    scope,
    text: normalizeText(namespace[textKey], MAX_INSTRUCTION_LENGTH),
    enabled: namespace[enabledKey] !== false,
  };
}

export function isInstructionBlockActive(block: InstructionBlock): boolean {
  return block.enabled && block.text !== null;
}

/**
 * The blocks that reach the model, narrowest scope last so a project
 * instruction is read after the account one it refines.
 */
export function activeInstructionBlocks(blocks: readonly InstructionBlock[]): InstructionBlock[] {
  return blocks
    .filter(isInstructionBlockActive)
    .sort((a, b) => INSTRUCTION_SCOPES.indexOf(a.scope) - INSTRUCTION_SCOPES.indexOf(b.scope));
}

export function firstActiveInstruction(blocks: readonly InstructionBlock[]): string | null {
  return activeInstructionBlocks(blocks)[0]?.text ?? null;
}

/**
 * Local and BYOK turns build their prompt on the device, outside the managed
 * route, so they had no share in the ordering the server applies. This is that
 * ordering.
 *
 * apps/web/lib/context/precedence.ts derives this order from the context
 * contract, and apps/web/lib/context/__tests__/precedence.test.ts fails if the
 * two lists diverge. This package does not depend on @agiworkforce/context, so
 * the list is written out and that test is what keeps it honest.
 */

export const CURRENT_REQUEST = 'current_request';
export const ACCOUNT_INSTRUCTION = 'account_instruction';

export const CONTEXT_PRECEDENCE = [
  'security_policy',
  CURRENT_REQUEST,
  'agent_instruction',
  'template_instruction',
  'current_task_state',
  'project_instruction',
  'local_repository_instruction',
  ACCOUNT_INSTRUCTION,
  'account_memory',
  'project_sibling_chat',
  'past_chat',
  'library_file',
  'user_upload',
  'project_knowledge_file',
  'connector_result',
  'web_result',
] as const;

export type PrecedenceEntry = (typeof CONTEXT_PRECEDENCE)[number];

/** Classes that carry instruction. Everything else is quoted material. */
const INSTRUCTION_ENTRIES: readonly PrecedenceEntry[] = [
  'security_policy',
  CURRENT_REQUEST,
  'agent_instruction',
  'current_task_state',
  'local_repository_instruction',
  'project_instruction',
  'template_instruction',
  ACCOUNT_INSTRUCTION,
];

export function precedenceRank(entry: PrecedenceEntry): number {
  return CONTEXT_PRECEDENCE.indexOf(entry);
}

export function isInstructionEntry(entry: PrecedenceEntry): boolean {
  return INSTRUCTION_ENTRIES.includes(entry);
}

export interface LocalPromptBlock {
  entry: PrecedenceEntry;
  text: string;
}

/**
 * Orders the blocks a local prompt is assembled from. Material is kept, it is
 * simply read after every instruction, and the caller fences it.
 */
export function orderLocalPromptBlocks(blocks: readonly LocalPromptBlock[]): LocalPromptBlock[] {
  return [...blocks].sort((a, b) => precedenceRank(a.entry) - precedenceRank(b.entry));
}

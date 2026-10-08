import {
  orderInstructionBlocks,
  type InstructionBlock,
} from '@/lib/prompts/instruction-precedence';

export interface FreeQuotaSystemMessage {
  role: 'system';
  content: string;
}

export function freeQuotaSystemMessages(input: {
  preamble: string;
  studyInstruction?: string | null;
  personal: readonly InstructionBlock[];
}): FreeQuotaSystemMessage[] {
  return orderInstructionBlocks([
    { layer: 'system', text: input.preamble },
    { layer: 'developer', text: input.studyInstruction ?? '' },
    ...input.personal,
  ])
    .filter((block) => block.text.length > 0)
    .map((block) => ({ role: 'system', content: block.text }));
}

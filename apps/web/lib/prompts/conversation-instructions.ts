export const CONVERSATION_INSTRUCTION_HEADING =
  'Instructions the person gave this conversation only. Follow them in every reply here:';

export function conversationInstructionBlock(
  instructions: string | null | undefined,
): string | null {
  const text = instructions?.trim();
  return text ? `${CONVERSATION_INSTRUCTION_HEADING}\n${text}` : null;
}

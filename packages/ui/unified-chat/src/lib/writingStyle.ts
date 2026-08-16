export type WritingStyle = 'formal' | 'casual' | 'concise' | 'detailed';

const WRITING_STYLE_INSTRUCTIONS: Readonly<Record<WritingStyle, string>> = Object.freeze({
  formal: 'Use a formal, professional tone with precise language and complete sentences.',
  casual: 'Use a natural, conversational tone while remaining clear and respectful.',
  concise: 'Answer concisely. Include only the information needed to complete the request.',
  detailed: 'Give a thorough answer with useful context, concrete examples, and clear structure.',
});

export function getWritingStyleInstruction(style?: WritingStyle): string | null {
  return style ? WRITING_STYLE_INSTRUCTIONS[style] : null;
}

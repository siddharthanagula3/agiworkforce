import { normalizeEditInstruction } from '../artifact-edit-request';
import { MAX_INLINE_DOCUMENT_CHARS } from '../artifact-selection-request';

export const REWRITE_SLIDE_INSTRUCTION =
  'Rewrite this slide so it is clearer and more persuasive, keeping its point and length.';

function fence(value: string): string[] {
  return ['```markdown', value.replace(/`{3,}/g, '``'), '```'];
}

export function buildSlideEditRequest(input: {
  title: string;
  slideIndex: number;
  slideCount: number;
  slide: string;
  instruction: string;
  currentDeck?: string;
}): string {
  const lines = [
    `Edit the presentation "${input.title}". Change only slide ${input.slideIndex + 1} of ${input.slideCount} as described and keep every other slide exactly as it is, including the title and the slide order.`,
    '',
    `Slide ${input.slideIndex + 1} now reads:`,
    ...fence(input.slide),
  ];
  if (input.currentDeck && input.currentDeck.length <= MAX_INLINE_DOCUMENT_CHARS) {
    lines.push(
      '',
      'The presentation was edited since you last wrote it. Start from this current version:',
      ...fence(input.currentDeck),
    );
  }
  lines.push(
    '',
    `Requested change: ${normalizeEditInstruction(input.instruction)}`,
    '',
    'Reply with the complete updated presentation in one fenced block with the artifact marker on its first line, slides separated by --- lines.',
  );
  return lines.join('\n');
}

import type { UserInput } from '@agiworkforce/types';

/**
 * A text input the extension attaches to a turn rather than one the user
 * typed: one text element spans all of it, the way a chip is sent. The CLI
 * gives such text to the model with the turn's context, so a reopened
 * transcript shows the prompt as it was typed.
 */
export type TextInput = Extract<UserInput, { type: 'text' }>;

export function attachedTextInput(text: string): TextInput {
  return {
    type: 'text',
    text,
    text_elements: [
      { byte_range: { start: 0, end: Buffer.byteLength(text, 'utf8') }, placeholder: null },
    ],
  };
}

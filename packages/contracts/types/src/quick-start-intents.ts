
export type QuickStartIntent = 'code' | 'write' | 'research' | 'image' | 'video' | 'computer';

export interface QuickStartIntentCopy {
  label: string;
  prompt: string;
  accessibleLabel: string;
}

export const QUICK_START_INTENTS: readonly QuickStartIntent[] = Object.freeze([
  'code',
  'write',
  'research',
  'image',
  'video',
  'computer',
]);

export const QUICK_START_INTENT_COPY: Readonly<Record<QuickStartIntent, QuickStartIntentCopy>> =
  Object.freeze({
    code: {
      label: 'Code',
      prompt: 'Help me write code for ',
      accessibleLabel: 'Start a coding task',
    },
    write: {
      label: 'Write',
      prompt: 'Help me write ',
      accessibleLabel: 'Start a writing task',
    },
    research: {
      label: 'Research',
      prompt: 'Research this for me: ',
      accessibleLabel: 'Start a research task',
    },
    image: {
      label: 'Image',
      prompt: 'Create an image of ',
      accessibleLabel: 'Generate an image',
    },
    video: {
      label: 'Video',
      prompt: 'Create a video of ',
      accessibleLabel: 'Generate a video',
    },
    computer: {
      label: 'Computer',
      prompt: 'Use the browser to ',
      accessibleLabel: 'Start a browser task',
    },
  });

export function quickStartIntentLabel(intent: QuickStartIntent): string {
  return QUICK_START_INTENT_COPY[intent].label;
}

export function quickStartIntentPrompt(intent: QuickStartIntent): string {
  return QUICK_START_INTENT_COPY[intent].prompt;
}

export function availableQuickStartIntents(
  supported: Partial<Record<QuickStartIntent, boolean>> = {},
): readonly QuickStartIntent[] {
  return QUICK_START_INTENTS.filter((intent) => supported[intent] !== false);
}

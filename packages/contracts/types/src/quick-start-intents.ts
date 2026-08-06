/**
 * quick-start-intents.ts — the shared vocabulary for the new-chat screen.
 *
 * Three surfaces greet a user with an empty chat, and all three offered a
 * different set of starting points:
 *
 *   web      "Code · Write · Learn · Life stuff · AGI's pick" — chips that
 *            PREFILL the composer with a sentence stem.
 *   desktop  "Code · Write · Research · Image · Video · Computer" — chips that
 *            TOGGLE a mode in the unified-chat store.
 *   mobile   starter cards, different again.
 *
 * So the first screen of the product introduced itself differently depending on
 * where you opened it, and two of the sets did not even overlap.
 *
 * This module fixes the VOCABULARY, not the interaction. That distinction is
 * deliberate: web and desktop keep separate chat stores, so rendering desktop's
 * mode-toggling component on web would produce a chip that looks live and
 * silently toggles a store web never reads — worse than the inconsistency it
 * replaced. Each surface therefore binds its own action to a shared set of
 * intents, exactly as the managed-usage vocabulary does.
 *
 * Kept free of React so mobile can import it too.
 */

/** The intents offered on an empty chat, in presentation order. */
export type QuickStartIntent = 'code' | 'write' | 'research' | 'image' | 'video' | 'computer';

export interface QuickStartIntentCopy {
  /** Chip label. One word wherever possible — these sit in a tight row. */
  label: string;
  /**
   * Composer stem for surfaces that PREFILL rather than toggle a mode.
   * Ends with a trailing space where the user is expected to continue typing.
   */
  prompt: string;
  /** Spoken description for assistive tech, since the label alone is terse. */
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

/**
 * The intents a surface should offer, given what it can actually do.
 *
 * A surface must not advertise an intent it cannot honour — offering "Video" on
 * a plan or surface without video generation produces a chip that leads
 * straight to a refusal, which is the failure this whole vocabulary exists to
 * avoid. Callers pass what they support; order is preserved.
 */
export function availableQuickStartIntents(
  supported: Partial<Record<QuickStartIntent, boolean>> = {},
): readonly QuickStartIntent[] {
  return QUICK_START_INTENTS.filter((intent) => supported[intent] !== false);
}

export type WritingStyle = 'formal' | 'casual' | 'concise' | 'detailed';

const WRITING_STYLE_INSTRUCTIONS: Readonly<Record<WritingStyle, string>> = Object.freeze({
  formal: 'Use a formal, professional tone with precise language and complete sentences.',
  casual: 'Use a natural, conversational tone while remaining clear and respectful.',
  concise: 'Answer concisely. Include only the information needed to complete the request.',
  detailed: 'Give a thorough answer with useful context, concrete examples, and clear structure.',
});

// Styles arrive from device storage and from host shells, so the value is
// re-checked here despite the type. An inherited key such as 'constructor'
// resolves to `Object` and would be stringified into the system prompt.
export function getWritingStyleInstruction(style?: WritingStyle): string | null {
  return isWritingStyle(style) ? WRITING_STYLE_INSTRUCTIONS[style] : null;
}

const WRITING_STYLE_KEYS: ReadonlySet<string> = new Set(Object.keys(WRITING_STYLE_INSTRUCTIONS));

export function isWritingStyle(value: unknown): value is WritingStyle {
  return typeof value === 'string' && WRITING_STYLE_KEYS.has(value);
}

export const WRITING_STYLE_STORAGE_KEY = 'agi-composer-writing-style';

/**
 * The shared composer held the chosen style in plain component state, so
 * "Use style → concise" reverted on the next remount or app restart while the
 * control still read as a persistent setting. Device-scoped storage is the
 * honest floor: it survives a reload, and it does not pretend to be an
 * account-scoped preference that no endpoint stores yet.
 */
export function loadWritingStyle(): WritingStyle | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(WRITING_STYLE_STORAGE_KEY);
    return isWritingStyle(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function saveWritingStyle(style: WritingStyle | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (style === null) window.localStorage.removeItem(WRITING_STYLE_STORAGE_KEY);
    else window.localStorage.setItem(WRITING_STYLE_STORAGE_KEY, style);
  } catch {
    // A blocked or full storage must not break sending a message.
  }
}

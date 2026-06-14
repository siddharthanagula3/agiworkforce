/**
 * personalizationToPrompt
 *
 * Converts a PersonalizationPreferences snapshot to a compact natural-language
 * guidance block that is prepended to mergedCustomInstructions before each send.
 *
 * Emit rules (keeps the block short and avoids noise on neutral settings):
 *   - name / occupation / bio: emitted when non-empty
 *   - formality (1-5): emit guidance only at strong ends (<=2 or >=4)
 *   - warmth   (1-5): emit guidance only at strong ends (<=2 or >=4)
 *   - detail   (1-5): emit guidance only at strong ends (<=2 or >=4)
 *   - emojiUsage: emit only for 'never' or 'often' (skip 'sometimes' = default)
 *
 * Returns an empty string when the profile would produce no guidance lines,
 * so the caller can skip prepending altogether.
 */
import type { PersonalizationPreferences } from '../../stores/settingsStore';

export function personalizationToPrompt(p: PersonalizationPreferences): string {
  const lines: string[] = [];

  if (p.name?.trim()) {
    lines.push(`The user's name is ${p.name.trim()}.`);
  }
  if (p.occupation?.trim()) {
    lines.push(`They work as: ${p.occupation.trim()}.`);
  }
  if (p.bio?.trim()) {
    lines.push(`About them: ${p.bio.trim()}`);
  }

  // Formality
  if (p.formality <= 2) {
    lines.push('Keep responses casual and conversational — avoid stiff or formal language.');
  } else if (p.formality >= 4) {
    lines.push('Use a formal, professional tone in all responses.');
  }

  // Warmth
  if (p.warmth <= 2) {
    lines.push('Be direct and concise — skip pleasantries and emotional language.');
  } else if (p.warmth >= 4) {
    lines.push('Be warm and encouraging in responses.');
  }

  // Detail level
  if (p.detail <= 2) {
    lines.push('Keep answers concise and to the point — avoid over-explaining.');
  } else if (p.detail >= 4) {
    lines.push('Provide thorough, detailed explanations when answering questions.');
  }

  // Emoji usage
  if (p.emojiUsage === 'never') {
    lines.push('Do not use emoji in any response.');
  } else if (p.emojiUsage === 'often') {
    lines.push('Feel free to use emoji liberally to add expressiveness to responses.');
  }

  if (lines.length === 0) return '';

  return `<personalization>\n${lines.join('\n')}\n</personalization>`;
}

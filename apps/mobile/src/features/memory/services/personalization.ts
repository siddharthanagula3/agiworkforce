/**
 * renderPersonalizationBlock — turns the user's Personalization settings into a
 * compact system-prompt instruction block.
 *
 * The settings (name, occupation, custom instructions, and four 0–100 style
 * sliders) are collected on the Personalization screen and persisted, but were
 * never injected into the model prompt. This pure function encodes them as
 * natural-language guidance so the local/cloud model actually adapts to them.
 *
 * Design:
 *   - Emit a line only when a field is meaningfully set, so a default profile
 *     produces an empty string (caller then injects nothing).
 *   - Sliders default to 50 (neutral); only the strong ends (>=75 / <=25)
 *     produce guidance, matching the screen's range labels
 *     (Cold/Warm, Neutral/Enthusiastic, Prose/Structured, None/Frequent).
 *   - No store/IO access — fully unit-testable.
 */
import type { Personalization } from '@/stores/settingsStore';

const HIGH = 75;
const LOW = 25;

function sliderLine(value: number, highText: string, lowText: string): string | null {
  if (value >= HIGH) return highText;
  if (value <= LOW) return lowText;
  return null;
}

export function renderPersonalizationBlock(p: Personalization): string {
  const lines: string[] = [];

  const name = p.nickname.trim() || p.fullName.trim();
  if (name) lines.push(`The user's name is ${name}; address them by it when natural.`);

  const occupation = p.occupation.trim();
  if (occupation) lines.push(`The user works as: ${occupation}. Tailor examples accordingly.`);

  const warmth = sliderLine(
    p.warmth,
    'Be warm, friendly, and empathetic in tone.',
    'Keep the tone neutral and matter-of-fact.',
  );
  if (warmth) lines.push(warmth);

  const enthusiasm = sliderLine(
    p.enthusiasm,
    'Be energetic and enthusiastic.',
    'Stay measured and calm; avoid exclamation.',
  );
  if (enthusiasm) lines.push(enthusiasm);

  const structure = sliderLine(
    p.headersLists,
    'Prefer structured replies with headers and bullet lists.',
    'Prefer flowing prose; avoid headers and bullet lists unless asked.',
  );
  if (structure) lines.push(structure);

  const emoji = sliderLine(
    p.emoji,
    'Use emoji freely where they add clarity or warmth.',
    'Do not use emoji.',
  );
  if (emoji) lines.push(emoji);

  const instructions = p.instructions.trim();
  if (instructions) lines.push(`Custom instructions from the user: ${instructions}`);

  if (lines.length === 0) return '';

  return [
    'User personalization (apply to your response style):',
    ...lines.map((l) => `- ${l}`),
  ].join('\n');
}

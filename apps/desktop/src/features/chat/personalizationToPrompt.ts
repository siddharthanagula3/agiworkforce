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

  if (p.formality <= 2) {
    lines.push('Keep responses casual and conversational, avoid stiff or formal language.');
  } else if (p.formality >= 4) {
    lines.push('Use a formal, professional tone in all responses.');
  }

  if (p.warmth <= 2) {
    lines.push('Be direct and concise, skip pleasantries and emotional language.');
  } else if (p.warmth >= 4) {
    lines.push('Be warm and encouraging in responses.');
  }

  if (p.detail <= 2) {
    lines.push('Keep answers concise and to the point, avoid over-explaining.');
  } else if (p.detail >= 4) {
    lines.push('Provide thorough, detailed explanations when answering questions.');
  }

  if (p.emojiUsage === 'never') {
    lines.push('Do not use emoji in any response.');
  } else if (p.emojiUsage === 'often') {
    lines.push('Feel free to use emoji liberally to add expressiveness to responses.');
  }

  if (lines.length === 0) return '';

  return `<personalization>\n${lines.join('\n')}\n</personalization>`;
}

export interface VoicePreset {
  id: string;
  name: string;
  description: string;
  /** Keywords to match against system voice names */
  voiceKeywords: string[];
  /** Fallback speech rate if no matching voice found */
  rate: number;
  pitch: number;
}

export const VOICE_PRESETS: VoicePreset[] = [
  {
    id: 'aurora',
    name: 'Aurora',
    description: 'Warm and clear',
    voiceKeywords: ['samantha', 'karen', 'moira', 'tessa'],
    rate: 1.0,
    pitch: 1.05,
  },
  {
    id: 'nova',
    name: 'Nova',
    description: 'Confident and articulate',
    voiceKeywords: ['alex', 'daniel', 'aaron', 'oliver'],
    rate: 1.05,
    pitch: 0.95,
  },
  {
    id: 'sage',
    name: 'Sage',
    description: 'Calm and thoughtful',
    voiceKeywords: ['fiona', 'kate', 'serena', 'victoria'],
    rate: 0.95,
    pitch: 1.0,
  },
  {
    id: 'ember',
    name: 'Ember',
    description: 'Energetic and friendly',
    voiceKeywords: ['zoe', 'nicky', 'allison', 'ava'],
    rate: 1.1,
    pitch: 1.1,
  },
  {
    id: 'atlas',
    name: 'Atlas',
    description: 'Deep and resonant',
    voiceKeywords: ['tom', 'lee', 'ralph', 'fred'],
    rate: 0.95,
    pitch: 0.85,
  },
];

/**
 * Find the best system voice match for a preset.
 * Searches available voices for keyword matches in voice name.
 */
export function findVoiceForPreset(
  preset: VoicePreset,
  availableVoices: Array<{ identifier: string; name: string; language: string }>,
): string | null {
  // Only consider English voices
  const englishVoices = availableVoices.filter((v) => v.language.startsWith('en'));

  for (const keyword of preset.voiceKeywords) {
    const match = englishVoices.find((v) => v.name.toLowerCase().includes(keyword.toLowerCase()));
    if (match) return match.identifier;
  }

  // Fallback to first English voice
  return englishVoices[0]?.identifier ?? null;
}

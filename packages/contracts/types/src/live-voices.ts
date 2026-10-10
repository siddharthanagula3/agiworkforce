export interface LiveVoiceOption {
  voiceURI: string;
  name: string;
  lang: string;
}

export const LIVE_DEFAULT_VOICE = 'marin';

export const LIVE_VOICES: readonly LiveVoiceOption[] = [
  { voiceURI: 'marin', name: 'Marin', lang: 'English' },
  { voiceURI: 'meridian', name: 'Meridian', lang: 'English, North American' },
  { voiceURI: 'gleam', name: 'Gleam', lang: 'English, North American' },
  { voiceURI: 'quartz', name: 'Quartz', lang: 'English, Australian' },
  { voiceURI: 'ripple', name: 'Ripple', lang: 'English, Australian' },
  { voiceURI: 'vesper', name: 'Vesper', lang: 'English, British' },
  { voiceURI: 'willow', name: 'Willow', lang: 'English, Irish' },
  { voiceURI: 'stone', name: 'Stone', lang: 'English, Irish' },
  { voiceURI: 'delta', name: 'Delta', lang: 'English, Southern US' },
  { voiceURI: 'cinder', name: 'Cinder', lang: 'English, Southern US' },
  { voiceURI: 'beacon', name: 'Beacon', lang: 'English, Filipino' },
  { voiceURI: 'bossa', name: 'Bossa', lang: 'Portuguese, Brazilian' },
  { voiceURI: 'tempo', name: 'Tempo', lang: 'Portuguese, Brazilian' },
];

export function isLiveVoice(value: string | null | undefined): value is string {
  return LIVE_VOICES.some((voice) => voice.voiceURI === value);
}

const LIVE_VOICE_NATURAL_PACE = 1;

export function liveVoiceLanguageInstruction(language: string | null): string {
  return language
    ? `Speak and transcribe in ${language}. Keep to it even when the user's audio is ambiguous.`
    : 'Speak in the language the user speaks, and switch when they do.';
}

export function liveVoicePaceInstruction(pace: number): string | null {
  if (!Number.isFinite(pace) || pace === LIVE_VOICE_NATURAL_PACE) return null;
  return `Speak at about ${pace} times your natural speaking pace.`;
}

export const LIVE_VOICE_REASONING = {
  instant: 'instant',
  thinking: 'thinking',
} as const;

export type LiveVoiceReasoning = (typeof LIVE_VOICE_REASONING)[keyof typeof LIVE_VOICE_REASONING];

export const LIVE_VOICE_REASONING_LEVELS: readonly LiveVoiceReasoning[] = [
  LIVE_VOICE_REASONING.instant,
  LIVE_VOICE_REASONING.thinking,
];

export function isLiveVoiceReasoning(value: unknown): value is LiveVoiceReasoning {
  return LIVE_VOICE_REASONING_LEVELS.includes(value as LiveVoiceReasoning);
}

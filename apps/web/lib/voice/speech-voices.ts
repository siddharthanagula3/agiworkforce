export const SPEECH_VOICES = [
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'nova',
  'onyx',
  'sage',
  'shimmer',
  'verse',
  'marin',
  'cedar',
] as const;

export type SpeechVoice = (typeof SPEECH_VOICES)[number];

export const DEFAULT_SPEECH_VOICE: SpeechVoice = 'marin';

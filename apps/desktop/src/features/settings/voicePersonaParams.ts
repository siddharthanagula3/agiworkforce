/**
 * Voice persona → Web Speech parameters.
 *
 * Single source of truth for how each voice persona sounds, shared by the
 * settings Preview button (VoicePersonaSelector) and real response TTS (useTTS)
 * so the persisted persona selection actually shapes spoken responses instead of
 * being written to localStorage and ignored.
 */
export const VOICE_PERSONA_STORAGE_KEY = 'agiworkforce-voice-persona';

export interface VoicePersonaParams {
  rate: number;
  pitch: number;
  volume: number;
}

/** Rate/pitch/volume for a persona id. Unknown/absent → the 'professional' default. */
export function getVoicePersonaParams(personaId: string | null | undefined): VoicePersonaParams {
  switch (personaId) {
    case 'friendly':
      return { rate: 1.05, pitch: 1.15, volume: 1.0 };
    case 'calm':
      return { rate: 0.85, pitch: 0.95, volume: 0.9 };
    case 'energetic':
      return { rate: 1.2, pitch: 1.2, volume: 1.0 };
    case 'storyteller':
      return { rate: 0.9, pitch: 1.05, volume: 0.95 };
    case 'technical':
      return { rate: 1.0, pitch: 0.9, volume: 1.0 };
    case 'professional':
    default:
      return { rate: 0.95, pitch: 1.0, volume: 1.0 };
  }
}

/** Read the persisted persona params (SSR/no-localStorage safe). */
export function getPersistedVoicePersonaParams(): VoicePersonaParams {
  const personaId =
    typeof localStorage !== 'undefined' ? localStorage.getItem(VOICE_PERSONA_STORAGE_KEY) : null;
  return getVoicePersonaParams(personaId);
}

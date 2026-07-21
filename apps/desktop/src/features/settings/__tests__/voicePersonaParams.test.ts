import { afterEach, describe, expect, it } from 'vitest';
import {
  VOICE_PERSONA_STORAGE_KEY,
  getVoicePersonaParams,
  getPersistedVoicePersonaParams,
} from '../voicePersonaParams';

describe('voicePersonaParams', () => {
  afterEach(() => localStorage.removeItem(VOICE_PERSONA_STORAGE_KEY));

  it('returns distinct rate/pitch per known persona', () => {
    expect(getVoicePersonaParams('energetic')).toEqual({ rate: 1.2, pitch: 1.2, volume: 1.0 });
    expect(getVoicePersonaParams('calm')).toEqual({ rate: 0.85, pitch: 0.95, volume: 0.9 });
    expect(getVoicePersonaParams('technical').pitch).toBe(0.9);
  });

  it('falls back to the professional default for unknown or absent ids', () => {
    const professional = { rate: 0.95, pitch: 1.0, volume: 1.0 };
    expect(getVoicePersonaParams('professional')).toEqual(professional);
    expect(getVoicePersonaParams('nonexistent')).toEqual(professional);
    expect(getVoicePersonaParams(null)).toEqual(professional);
    expect(getVoicePersonaParams(undefined)).toEqual(professional);
  });

  it('reads the persisted persona so real TTS honors the picker', () => {
    localStorage.setItem(VOICE_PERSONA_STORAGE_KEY, 'energetic');
    expect(getPersistedVoicePersonaParams()).toEqual({ rate: 1.2, pitch: 1.2, volume: 1.0 });
  });

  it('defaults when nothing is persisted', () => {
    expect(getPersistedVoicePersonaParams()).toEqual({ rate: 0.95, pitch: 1.0, volume: 1.0 });
  });
});

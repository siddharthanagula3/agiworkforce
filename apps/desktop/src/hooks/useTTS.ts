import { useCallback, useEffect } from 'react';
import {
  voiceTtsSpeakLocal,
  voiceTtsSpeakWithBargeIn,
  voiceTtsStop,
  type VoiceCapabilities,
} from '../api/voice';
import { getPersistedVoicePersonaParams } from '../features/settings/voicePersonaParams';
import { isTauri } from '../lib/tauri-mock';
import { useVoiceModeStore } from '../stores/settings/voice';

export function stripMarkdownForSpeech(text: string): string {
  return (
    text
      // Remove fenced code blocks entirely (don't read raw code)
      .replace(/```[\s\S]*?```/g, 'code block omitted.')
      // Remove inline code
      .replace(/`[^`]+`/g, '')
      // Remove Markdown headings markers
      .replace(/^#{1,6}\s+/gm, '')
      // Remove bold/italic markers
      .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
      // Remove blockquote markers
      .replace(/^>\s+/gm, '')
      // Remove link syntax, keep label text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove image syntax
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      // Remove horizontal rules
      .replace(/^[-*_]{3,}\s*$/gm, '')
      // Collapse multiple blank lines
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

export type NativeSpeechEngine = 'configured' | 'local';

export function nativeSpeechEngine(
  capabilities: VoiceCapabilities | null | undefined,
): NativeSpeechEngine | null {
  if (!capabilities) return null;
  if (capabilities.ttsAvailable) return 'configured';
  if (capabilities.localTtsAvailable) return 'local';
  return null;
}

export function browserSpeechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speakInBrowser(text: string): Promise<void> {
  if (!browserSpeechAvailable()) return Promise.resolve();
  const persona = getPersistedVoicePersonaParams();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = persona.rate;
  utterance.pitch = persona.pitch;
  utterance.volume = persona.volume;
  return new Promise<void>((resolve) => {
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

export async function speakNatively(text: string): Promise<boolean> {
  if (!isTauri) return false;
  const store = useVoiceModeStore.getState();
  const engine = nativeSpeechEngine(store.capabilities ?? (await store.fetchCapabilities()));
  if (engine === 'configured') {
    await voiceTtsSpeakWithBargeIn(text);
    return true;
  }
  if (engine === 'local') {
    const persona = getPersistedVoicePersonaParams();
    await voiceTtsSpeakLocal(text, persona.rate, persona.volume);
    return true;
  }
  return false;
}

export interface UseTTSReturn {
  speakWithBargeIn: (text: string) => Promise<void>;
  stopNative: () => Promise<void>;
}

export function useTTS(): UseTTSReturn {
  const speakWithBargeIn = useCallback(async (text: string) => {
    const clean = stripMarkdownForSpeech(text);
    if (!clean) return;
    try {
      if (await speakNatively(clean)) return;
    } catch (err) {
      console.warn('[useTTS] native speech failed', err);
    }
    await speakInBrowser(clean);
  }, []);

  const stopNative = useCallback(async () => {
    if (browserSpeechAvailable()) window.speechSynthesis.cancel();
    try {
      await voiceTtsStop();
    } catch (err) {
      console.warn('[useTTS] voiceTtsStop failed', err);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (browserSpeechAvailable()) window.speechSynthesis.cancel();
      voiceTtsStop().catch((err: unknown) => {
        console.warn('[useTTS] voiceTtsStop on unmount failed', err);
      });
    };
  }, []);

  return { speakWithBargeIn, stopNative };
}

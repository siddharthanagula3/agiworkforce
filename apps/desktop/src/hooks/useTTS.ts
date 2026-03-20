/**
 * useTTS — Text-to-Speech hook using the browser's SpeechSynthesis API.
 *
 * Features:
 * - Strips Markdown/code blocks so the AI reads clean prose
 * - Tracks speaking state for UI feedback
 * - Cancels on unmount so no zombie utterances linger
 * - Falls back gracefully when SpeechSynthesis is unavailable (e.g., Tauri on some platforms)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  voiceTtsSpeak,
  voiceTtsSpeakWithBargeIn,
  voiceTtsStop,
  voiceTtsIsPlaying,
} from '../api/voice';

function stripMarkdown(text: string): string {
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

export interface UseTTSReturn {
  isSpeaking: boolean;
  isSupported: boolean;
  speak: (text: string) => void;
  speakNative: (text: string) => Promise<void>;
  /** Speak with barge-in support (interrupts if user starts talking) */
  speakWithBargeIn: (text: string) => Promise<void>;
  stop: () => void;
  /** Stop backend TTS playback */
  stopNative: () => Promise<void>;
  /** Check if backend TTS is currently playing */
  isNativePlaying: () => Promise<boolean>;
}

export function useTTS(): UseTTSReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const stop = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    utteranceRef.current = null;
  }, [isSupported]);

  const speak = useCallback(
    (text: string) => {
      if (!isSupported) return;

      // If already speaking the same content, toggle off
      if (isSpeaking) {
        stop();
        return;
      }

      const clean = stripMarkdown(text);
      if (!clean) return;

      // Cancel any previous utterance
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.rate = 1.05;
      utterance.pitch = 1;
      utterance.volume = 1;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        utteranceRef.current = null;
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        utteranceRef.current = null;
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [isSupported, isSpeaking, stop],
  );

  const speakNative = useCallback(
    async (text: string) => {
      const clean = stripMarkdown(text);
      if (!clean) return;
      setIsSpeaking(true);
      try {
        await voiceTtsSpeak(clean);
      } catch {
        // Fallback to browser TTS when native is unavailable
        speak(clean);
      } finally {
        setIsSpeaking(false);
      }
    },
    [speak],
  );

  const speakWithBargeIn = useCallback(
    async (text: string) => {
      const clean = stripMarkdown(text);
      if (!clean) return;
      setIsSpeaking(true);
      try {
        await voiceTtsSpeakWithBargeIn(clean);
      } catch {
        // Fallback to regular native TTS
        try {
          await voiceTtsSpeak(clean);
        } catch {
          // Fallback to browser TTS
          speak(clean);
        }
      } finally {
        setIsSpeaking(false);
      }
    },
    [speak],
  );

  const stopNative = useCallback(async () => {
    try {
      await voiceTtsStop();
    } catch {
      // Ignore errors -- backend may not have an active session
    }
    setIsSpeaking(false);
  }, []);

  const isNativePlaying = useCallback(async (): Promise<boolean> => {
    try {
      return await voiceTtsIsPlaying();
    } catch {
      return false;
    }
  }, []);

  // Cancel on unmount
  useEffect(() => {
    return () => {
      if (isSupported) window.speechSynthesis.cancel();
      // Also stop backend TTS
      voiceTtsStop().catch(() => {});
    };
  }, [isSupported]);

  return {
    isSpeaking,
    isSupported,
    speak,
    speakNative,
    speakWithBargeIn,
    stop,
    stopNative,
    isNativePlaying,
  };
}

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { invoke } from '../lib/tauri-mock';

type VoiceMode = 'idle' | 'listening' | 'transcribing';

interface VoiceInputState {
  mode: VoiceMode;
  transcript: string;
  error: string | null;
  // Wispr Flow settings
  hotkey: 'option' | 'ctrl+space' | 'ctrl+shift+v';
  provider: 'local_whisper' | 'deepgram' | 'openai_whisper';
  language: string;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  setHotkey: (hotkey: VoiceInputState['hotkey']) => void;
  setProvider: (provider: VoiceInputState['provider']) => void;
  setLanguage: (language: string) => void;
  clearTranscript: () => void;
}

export const useVoiceInputStore = create<VoiceInputState>()(
  devtools(
    (set, get) => ({
      mode: 'idle',
      transcript: '',
      error: null,
      hotkey: 'option',
      provider: 'local_whisper',
      language: 'en',

      startListening: async () => {
        set({ mode: 'listening', transcript: '', error: null });
        try {
          await invoke('speech_start_recording', { provider: get().provider });
        } catch (e) {
          set({ mode: 'idle', error: String(e) });
        }
      },

      stopListening: async () => {
        set({ mode: 'transcribing' });
        try {
          const result = await invoke<{ text: string; confidence: number }>(
            'speech_stop_and_transcribe',
            {
              provider: get().provider,
              language: get().language,
            },
          );
          set({ mode: 'idle', transcript: result.text });
        } catch (e) {
          set({ mode: 'idle', error: String(e) });
        }
      },

      setHotkey: (hotkey) => set({ hotkey }),
      setProvider: (provider) => set({ provider }),
      setLanguage: (language) => set({ language }),
      clearTranscript: () => set({ transcript: '' }),
    }),
    { name: 'voice-input-store' },
  ),
);

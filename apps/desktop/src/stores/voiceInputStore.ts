import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { invoke } from '../lib/tauri-mock';
import { storageFallback } from '../lib/storageFallback';

type VoiceMode = 'idle' | 'listening' | 'transcribing' | 'processing';

export type PostProcessingMode = 'ai' | 'basic' | 'none';

/**
 * Filler words and phrases removed in 'basic' fallback mode.
 * Ordered longest-first so multi-word phrases match before single words.
 */
const FILLER_WORD_PATTERN =
  /\b(you know|sort of|kind of|basically|literally|actually|um+|uh+|er+|like)\b,?\s*/gi;

/**
 * Command prefixes that trigger Command Mode.
 * When the transcript starts with one of these phrases, it should EDIT
 * the current composer text rather than being appended.
 */
const COMMAND_PREFIXES = [
  'make this more formal',
  'make this more casual',
  'make this shorter',
  'make this longer',
  'make it more formal',
  'make it more casual',
  'make it shorter',
  'make it longer',
  'fix the grammar',
  'fix the spelling',
  'fix the punctuation',
  'translate to',
  'summarize this',
  'summarize the',
  'rewrite this',
  'rewrite the',
  'edit this',
  'edit the',
  'change the tone',
  'change the style',
  'make this',
  'make it',
  'fix this',
  'fix the',
  'more formal',
  'more casual',
  'shorter',
  'longer',
] as const;

/**
 * Returns true when the transcript is a voice command aimed at editing
 * existing text in the composer (not new dictation to append).
 */
export function detectVoiceCommand(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return COMMAND_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * Basic (non-AI) filler-word removal + whitespace normalisation.
 * Used as the fallback when AI cleanup is off or the LLM call fails.
 */
function basicCleanup(raw: string): string {
  return raw.replace(FILLER_WORD_PATTERN, ' ').replace(/\s+/g, ' ').trim();
}

interface LLMSendMessageRequest {
  messages: Array<{ role: string; content: string }>;
  model: string | null;
  provider: string | null;
  max_tokens: number;
}

interface LLMResponse {
  content: string;
}

interface TranscriptResult {
  text: string;
  /** true when the text is a voice command to apply to the current composer text */
  isCommand: boolean;
}

interface VoiceInputState {
  mode: VoiceMode;
  transcript: string;
  /** When true the last transcript was a voice command, not dictation to append */
  lastTranscriptIsCommand: boolean;
  error: string | null;

  // Wispr Flow settings
  hotkey: 'option' | 'ctrl+space' | 'ctrl+shift+v';
  provider: 'local_whisper' | 'deepgram' | 'openai_whisper';
  language: string;

  // Post-processing settings
  /** 'ai' = LLM cleanup (default), 'basic' = regex only, 'none' = raw transcript */
  postProcessingMode: PostProcessingMode;

  // Actions
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  setHotkey: (hotkey: VoiceInputState['hotkey']) => void;
  setProvider: (provider: VoiceInputState['provider']) => void;
  setLanguage: (language: string) => void;
  setPostProcessingMode: (mode: PostProcessingMode) => void;
  clearTranscript: () => void;

  /**
   * Run AI-powered (or basic fallback) cleanup on a raw transcript.
   * Returns a TranscriptResult with cleaned text + command detection.
   *
   * This is called automatically inside stopListening — exposed here so
   * callers can also invoke it independently if needed.
   */
  processTranscript: (rawTranscript: string) => Promise<TranscriptResult>;
}

export const useVoiceInputStore = create<VoiceInputState>()(
  devtools(
    persist(
      (set, get) => ({
        mode: 'idle',
        transcript: '',
        lastTranscriptIsCommand: false,
        error: null,
        hotkey: 'option',
        provider: 'local_whisper',
        language: 'en',
        postProcessingMode: 'ai',

        startListening: async () => {
          set({ mode: 'listening', transcript: '', error: null, lastTranscriptIsCommand: false });
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

            // Run post-processing while showing the 'processing' spinner
            const { processTranscript } = get();
            const { text: cleanText, isCommand } = await processTranscript(result.text);

            set({
              mode: 'idle',
              transcript: cleanText,
              lastTranscriptIsCommand: isCommand,
            });
          } catch (e) {
            set({ mode: 'idle', error: String(e) });
          }
        },

        processTranscript: async (rawTranscript: string): Promise<TranscriptResult> => {
          const raw = rawTranscript.trim();

          // Short-circuit: nothing useful to clean
          if (raw.length < 3) {
            return { text: raw, isCommand: false };
          }

          const isCommand = detectVoiceCommand(raw);
          const { postProcessingMode } = get();

          // 'none' mode: return raw transcript as-is
          if (postProcessingMode === 'none') {
            return { text: raw, isCommand };
          }

          // 'basic' mode: regex-only cleanup, skip LLM
          if (postProcessingMode === 'basic') {
            return { text: basicCleanup(raw), isCommand };
          }

          // 'ai' mode: run transcript through the current LLM
          set({ mode: 'processing' });

          try {
            // Dynamically import to avoid circular dep at module init time
            const { useModelStore } = await import('./modelStore');
            const { selectedModel, selectedProvider } = useModelStore.getState();

            const systemPrompt = isCommand
              ? `You are a voice command interpreter. The user has dictated a command to apply to text.
Interpret the command and output ONLY the instruction (e.g. "Rewrite this text in a formal tone.").
Remove filler words, fix the phrasing. Output only the cleaned command, no explanation.`
              : `You are a voice transcription editor. Clean up the following voice dictation by:
1. Removing filler words: um, uh, er, like, you know, sort of, kind of, basically, literally, actually (when used as filler)
2. Handling course corrections: "meet tomorrow no wait Friday instead" → "meet Friday"
3. Adding natural punctuation (periods, commas, question marks)
4. Fixing run-on sentences with appropriate pauses
5. Capitalising the first word and proper nouns

Output ONLY the cleaned text. No explanations, no quotes, no markdown. If the input is already clean, return it unchanged.`;

            const request: LLMSendMessageRequest = {
              messages: [
                {
                  role: 'user',
                  content: raw,
                },
              ],
              model: selectedModel ?? 'claude-haiku-4.5',
              provider: selectedProvider ?? 'anthropic',
              max_tokens: 500,
            };

            const response = await invoke<LLMResponse>('llm_send_message', request);
            const cleaned = response?.content?.trim() ?? '';

            if (!cleaned) {
              return { text: basicCleanup(raw), isCommand };
            }

            return { text: cleaned, isCommand };
          } catch {
            // Graceful fallback: basic regex cleanup so the user still gets something
            return { text: basicCleanup(raw), isCommand };
          }
        },

        setHotkey: (hotkey) => set({ hotkey }),
        setProvider: (provider) => set({ provider }),
        setLanguage: (language) => set({ language }),
        setPostProcessingMode: (mode) => set({ postProcessingMode: mode }),
        clearTranscript: () => set({ transcript: '', lastTranscriptIsCommand: false }),
      }),
      {
        name: 'agiworkforce-voice-input',
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        // Only persist user preferences, not transient runtime state
        partialize: (state) => ({
          hotkey: state.hotkey,
          provider: state.provider,
          language: state.language,
          postProcessingMode: state.postProcessingMode,
        }),
      },
    ),
    { name: 'voice-input-store' },
  ),
);

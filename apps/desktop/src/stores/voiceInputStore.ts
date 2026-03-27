import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { cleanupVoiceDictation, detectVoiceCommand } from '@agiworkforce/utils';
import { invoke } from '../lib/tauri-mock';
import { voiceTranscribeBlob } from '../api/voice';
import { storageFallback } from '../lib/storageFallback';

type VoiceMode = 'idle' | 'listening' | 'transcribing' | 'processing' | 'preview';

export type PostProcessingMode = 'ai' | 'basic' | 'none';
export { detectVoiceCommand };

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
  /** Cleaned transcript held in 'preview' mode before insertion into the composer */
  pendingTranscript: string;
  /** When true the last transcript was a voice command, not dictation to append */
  lastTranscriptIsCommand: boolean;
  error: string | null;

  // Wispr Flow settings
  hotkey: 'option' | 'ctrl+space' | 'ctrl+shift+v' | 'caps_lock';
  provider: 'local_whisper' | 'deepgram' | 'openai_whisper';
  language: string;

  // Post-processing settings
  /** 'ai' = LLM cleanup (default), 'basic' = regex only, 'none' = raw transcript */
  postProcessingMode: PostProcessingMode;

  // MediaRecorder runtime state (not persisted)
  _mediaStream: MediaStream | null;
  _recorder: MediaRecorder | null;
  _audioChunks: Blob[];
  _startAborted: boolean;

  // Actions
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  /** Commit the pending preview transcript to the composer and return to idle */
  confirmTranscript: () => void;
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
        pendingTranscript: '',
        lastTranscriptIsCommand: false,
        error: null,
        hotkey: 'option',
        provider: 'local_whisper',
        language: 'en',
        postProcessingMode: 'ai',
        _mediaStream: null,
        _recorder: null,
        _audioChunks: [],
        _startAborted: false,

        startListening: async () => {
          set({
            mode: 'listening',
            transcript: '',
            error: null,
            lastTranscriptIsCommand: false,
            _startAborted: false,
          });
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Check if stopListening was called while we were awaiting
            if (get()._startAborted) {
              stream.getTracks().forEach((t) => t.stop());
              set({ mode: 'idle', _startAborted: false });
              return;
            }

            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
              ? 'audio/webm;codecs=opus'
              : MediaRecorder.isTypeSupported('audio/webm')
                ? 'audio/webm'
                : 'audio/mp4';
            const recorder = new MediaRecorder(stream, { mimeType });
            const chunks: Blob[] = [];
            recorder.ondataavailable = (e) => {
              if (e.data.size > 0) chunks.push(e.data);
            };
            recorder.start(100);
            set({ _mediaStream: stream, _recorder: recorder, _audioChunks: chunks });
          } catch (e) {
            const err = e as Error;
            const msg =
              err.name === 'NotAllowedError'
                ? 'Microphone access denied. Allow mic access in System Preferences → Privacy → Microphone.'
                : err.name === 'NotFoundError'
                  ? 'No microphone found. Connect a mic and try again.'
                  : String(e);
            set({ mode: 'idle', error: msg });
          }
        },

        stopListening: async () => {
          const { mode, _recorder, _mediaStream } = get();
          if (mode !== 'listening') {
            return;
          }
          if (!_recorder) {
            // getUserMedia still pending — signal abort
            set({ _startAborted: true, mode: 'idle' });
            return;
          }
          set({ mode: 'transcribing' });

          await new Promise<void>((resolve) => {
            _recorder.onstop = () => resolve();
            _recorder.stop();
          });
          _mediaStream?.getTracks().forEach((t) => t.stop());

          // Read chunks AFTER onstop fires (all ondataavailable events have flushed)
          const { _audioChunks } = get();

          try {
            const blob = new Blob(_audioChunks, {
              type: _audioChunks[0]?.type ?? 'audio/webm',
            });

            if (blob.size === 0) {
              set({
                mode: 'idle',
                _recorder: null,
                _mediaStream: null,
                _audioChunks: [],
                _startAborted: false,
              });
              return;
            }

            const arrayBuffer = await blob.arrayBuffer();
            const audioData = Array.from(new Uint8Array(arrayBuffer));
            const format = (blob.type.includes('mp4') ? 'mp4' : 'webm') as string;
            const { provider, language } = get();

            const result = await voiceTranscribeBlob(audioData, format, provider, language);

            const rawText = result?.text?.trim() ?? '';
            if (!rawText) {
              set({
                mode: 'idle',
                _recorder: null,
                _mediaStream: null,
                _audioChunks: [],
                _startAborted: false,
              });
              return;
            }

            if (get().postProcessingMode === 'ai') {
              set({ mode: 'processing' });
            }
            const { processTranscript } = get();
            const { text: cleanText, isCommand } = await processTranscript(rawText);

            set({
              mode: 'preview',
              pendingTranscript: cleanText,
              lastTranscriptIsCommand: isCommand,
              _recorder: null,
              _mediaStream: null,
              _audioChunks: [],
              _startAborted: false,
            });
          } catch (e) {
            set({
              mode: 'idle',
              error: String(e),
              _recorder: null,
              _mediaStream: null,
              _audioChunks: [],
              _startAborted: false,
            });
          }
        },

        confirmTranscript: () => {
          const { pendingTranscript, lastTranscriptIsCommand } = get();
          set({
            mode: 'idle',
            transcript: pendingTranscript,
            pendingTranscript: '',
            lastTranscriptIsCommand,
          });
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
            return { text: cleanupVoiceDictation(raw), isCommand };
          }

          // 'ai' mode: run transcript through the current LLM
          try {
            // Dynamically import to avoid circular dep at module init time
            const { useModelStore } = await import('./modelStore');
            const { selectedModel, selectedProvider } = useModelStore.getState();

            const systemContent = isCommand
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

            // LLMSendMessageRequest is serialised as a plain object by Tauri's serde layer.
            // We cast via `as Record<string, unknown>` to satisfy the invoke signature.
            const invokeArgs: Record<string, unknown> = {
              messages: [
                { role: 'system', content: systemContent },
                { role: 'user', content: raw },
              ],
              model: selectedModel ?? 'auto-economy',
              provider: selectedProvider ?? 'anthropic',
              max_tokens: 500,
              prefer_cloud_credits: false,
            };

            const response = await invoke<LLMResponse>('llm_send_message', invokeArgs);
            const cleaned = response?.content?.trim() ?? '';

            if (!cleaned) {
              return { text: cleanupVoiceDictation(raw), isCommand };
            }

            return { text: cleaned, isCommand };
          } catch {
            // Graceful fallback: basic regex cleanup so the user still gets something
            return { text: cleanupVoiceDictation(raw), isCommand };
          }
        },

        setHotkey: (hotkey) => set({ hotkey }),
        setProvider: (provider) => set({ provider }),
        setLanguage: (language) => set({ language }),
        setPostProcessingMode: (mode) => set({ postProcessingMode: mode }),
        clearTranscript: () =>
          set({ transcript: '', pendingTranscript: '', lastTranscriptIsCommand: false }),
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

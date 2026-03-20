/**
 * Voice Mode Store
 *
 * Manages the full voice interaction loop:
 *   idle -> listening -> processing -> speaking -> idle
 *
 * Orchestrates recording (via MediaRecorder), transcription (via Rust backend),
 * LLM response generation, and TTS playback to create a hands-free
 * conversational experience similar to ChatGPT voice mode.
 *
 * Wires 15+ critical Rust voice commands:
 *   - Transcription: voice_transcribe_blob
 *   - TTS: voice_tts_speak, voice_tts_speak_with_barge_in, voice_tts_stop, voice_tts_is_playing,
 *          voice_tts_list_voices, voice_tts_configure, voice_tts_speak_local
 *   - Capabilities: voice_get_capabilities
 *   - Wake word: voice_wake_enable, voice_wake_disable, voice_wake_status, voice_wake_configure
 *   - PTT: voice_ptt_configure, voice_ptt_state, voice_ptt_key_down, voice_ptt_key_up
 *   - Global PTT: voice_start_global_ptt, voice_stop_global_ptt, voice_inject_text
 *   - Deepgram: voice_deepgram_configure, voice_start_deepgram_stream, voice_stop_deepgram_stream,
 *              voice_deepgram_send_audio, voice_deepgram_status
 *   - Barge-in: voice_enable_barge_in, voice_get_barge_in_status, voice_configure_barge_in,
 *              voice_start_barge_in_monitoring, voice_stop_barge_in_monitoring
 *   - Speech recording: speech_start_recording, speech_stop_and_transcribe
 *   - Settings: voice_get_settings, voice_configure
 *   - Local models: voice_list_local_models, voice_download_whisper_model, voice_list_whisper_models,
 *                   voice_set_whisper_model, voice_download_piper_voice, voice_list_piper_voices,
 *                   voice_set_piper_voice
 */

import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { storageFallback } from '../lib/storageFallback';
import { invoke } from '../lib/tauri-mock';
import {
  voiceGetCapabilities,
  voiceGetSettings,
  voiceConfigure,
  voiceTtsSpeak,
  voiceTtsSpeakWithBargeIn,
  voiceTtsStop,
  voiceTtsIsPlaying,
  voiceTtsListVoices,
  voiceTtsConfigure,
  voiceTtsSpeakLocal,
  voiceWakeEnable,
  voiceWakeDisable,
  voiceWakeStatus,
  voiceWakeConfigure,
  voicePttConfigure,
  voicePttState,
  voicePttKeyDown,
  voicePttKeyUp,
  voiceStartGlobalPtt,
  voiceStopGlobalPtt,
  voiceInjectText,
  voiceDeepgramConfigure,
  voiceStartDeepgramStream,
  voiceStopDeepgramStream,
  voiceDeepgramSendAudio,
  voiceDeepgramStatus,
  voiceEnableBargeIn,
  voiceGetBargeInStatus,
  voiceConfigureBargeIn,
  voiceStartBargeInMonitoring,
  voiceStopBargeInMonitoring,
  speechStartRecording,
  speechStopAndTranscribe,
  voiceListLocalModels,
  voiceDownloadWhisperModel,
  voiceListWhisperModels,
  voiceSetWhisperModel,
  voiceDownloadPiperVoice,
  voiceListPiperVoices,
  voiceSetPiperVoice,
  voiceTranscribeBlob,
} from '../api/voice';

// Re-export types from the canonical API layer so existing consumers
// (e.g. VoiceSettings.tsx, VoiceMode.tsx) can keep importing from this module.
import type {
  VoiceCapabilities,
  VoiceSettings,
  TtsVoice,
  WakeWordConfig,
  PttConfig,
  DeepgramConfig,
  DeepgramStreamStatus,
  DeepgramStreamingStats,
  BargeInStatus,
  BargeInStats,
  BargeInConfig,
  SpeechTranscriptResult,
  WhisperModelInfo,
  PiperVoiceInfo,
  LocalModelsInfo,
  TtsConfig,
} from '../api/voice';

export type {
  VoiceCapabilities,
  TtsVoice,
  WakeWordConfig,
  PttConfig,
  DeepgramConfig,
  DeepgramStreamStatus,
  DeepgramStreamingStats,
  BargeInStatus,
  BargeInStats,
  BargeInConfig,
  SpeechTranscriptResult,
  WhisperModelInfo,
  PiperVoiceInfo,
  LocalModelsInfo,
  TtsConfig,
};

/** VoiceSettings from the API layer, aliased for clarity in store method signatures. */
export type VoiceSettingsBackend = VoiceSettings;

/**
 * Voice mode lifecycle phases:
 *  - idle: Waiting for user to start speaking
 *  - listening: Recording audio from microphone
 *  - processing: Transcribing audio + generating LLM response
 *  - speaking: TTS is reading the AI response aloud
 */
export type VoiceModePhase = 'idle' | 'listening' | 'processing' | 'speaking';

/** A single turn in the voice conversation */
export interface VoiceTurn {
  id: string;
  userText: string;
  aiText: string;
  timestamp: number;
}

interface LLMResponse {
  content: string;
}

interface VoiceModeState {
  /** Whether the full-screen voice overlay is open */
  isOpen: boolean;
  /** Current phase in the voice loop */
  phase: VoiceModePhase;
  /** The user's transcribed text for the current turn */
  userTranscript: string;
  /** The AI's response text for the current turn */
  aiResponse: string;
  /** Error message, if any */
  error: string | null;
  /** Conversation history for the current voice session */
  turns: VoiceTurn[];
  /** Audio level (0-1) for waveform visualization */
  audioLevel: number;
  /** Voice capabilities fetched from backend */
  capabilities: VoiceCapabilities | null;
  /** Wake word listening status */
  wakeWordActive: boolean;
  /** Global PTT active */
  globalPttActive: boolean;
  /** Deepgram streaming status */
  deepgramStreaming: boolean;
  /** Barge-in enabled */
  bargeInEnabled: boolean;

  // -- Internal runtime refs (not persisted) --
  _mediaStream: MediaStream | null;
  _recorder: MediaRecorder | null;
  _audioChunks: Blob[];
  _analyser: AnalyserNode | null;
  _audioContext: AudioContext | null;
  _animFrameId: number | null;
  _isSpeaking: boolean;

  // -- Core voice loop actions --
  open: () => void;
  close: () => void;
  startListening: () => Promise<void>;
  stopListeningAndProcess: (onSend?: (text: string) => void) => Promise<void>;
  stopSpeaking: () => Promise<void>;
  reset: () => void;

  // -- Backend voice command wrappers --

  /** Fetch voice capabilities from Rust backend */
  fetchCapabilities: () => Promise<VoiceCapabilities | null>;
  /** Get voice settings from Rust backend */
  getBackendSettings: () => Promise<VoiceSettingsBackend | null>;
  /** Configure voice settings on Rust backend */
  configureBackend: (provider?: string, model?: string, language?: string) => Promise<void>;

  // TTS commands
  /** Speak text using backend TTS with barge-in support */
  speakWithBargeIn: (text: string) => Promise<void>;
  /** Stop TTS playback via backend */
  stopTts: () => Promise<boolean>;
  /** Check if TTS is currently playing */
  isTtsPlaying: () => Promise<boolean>;
  /** List available TTS voices */
  listTtsVoices: () => Promise<TtsVoice[]>;
  /** Configure TTS settings */
  configureTts: (config: TtsConfig) => Promise<void>;
  /** Speak text using local Piper TTS */
  speakLocal: (text: string, rate?: number, volume?: number) => Promise<void>;

  // Wake word commands
  /** Enable wake word detection */
  enableWakeWord: (config?: WakeWordConfig) => Promise<void>;
  /** Disable wake word detection */
  disableWakeWord: () => Promise<void>;
  /** Get wake word status */
  getWakeWordStatus: () => Promise<boolean>;
  /** Configure wake word */
  configureWakeWord: (config: WakeWordConfig) => Promise<void>;

  // PTT commands
  /** Configure push-to-talk */
  configurePtt: (config: PttConfig) => Promise<void>;
  /** Get PTT state */
  getPttState: () => Promise<string>;
  /** Simulate PTT key down */
  pttKeyDown: () => Promise<void>;
  /** Simulate PTT key up */
  pttKeyUp: () => Promise<number | null>;

  // Global PTT commands
  /** Start global fn-key PTT listener */
  startGlobalPtt: () => Promise<void>;
  /** Stop global PTT listener */
  stopGlobalPtt: () => Promise<void>;
  /** Inject text into focused field via OS input */
  injectText: (text: string) => Promise<void>;

  // Deepgram streaming commands
  /** Configure Deepgram streaming settings */
  configureDeepgram: (config: DeepgramConfig) => Promise<void>;
  /** Start Deepgram streaming transcription */
  startDeepgramStream: () => Promise<void>;
  /** Stop Deepgram streaming transcription */
  stopDeepgramStream: () => Promise<DeepgramStreamingStats | null>;
  /** Send audio data to active Deepgram stream */
  sendDeepgramAudio: (audioData: number[]) => Promise<void>;
  /** Get Deepgram streaming status */
  getDeepgramStatus: () => Promise<DeepgramStreamStatus | null>;

  // Barge-in commands
  /** Enable or disable barge-in detection */
  enableBargeIn: (enabled: boolean) => Promise<boolean>;
  /** Get barge-in status */
  getBargeInStatus: () => Promise<BargeInStatus | null>;
  /** Configure barge-in parameters */
  configureBargeIn: (
    sensitivity?: number,
    minSpeechMs?: number,
    consecutiveFramesThreshold?: number,
  ) => Promise<BargeInConfig | null>;
  /** Start barge-in monitoring */
  startBargeInMonitoring: () => Promise<boolean>;
  /** Stop barge-in monitoring */
  stopBargeInMonitoring: () => Promise<boolean>;

  // Native speech recording commands (Wispr Flow)
  /** Start native audio recording via cpal */
  startNativeRecording: (provider?: string) => Promise<void>;
  /** Stop native recording and get transcription */
  stopNativeRecordingAndTranscribe: (
    provider?: string,
    language?: string,
  ) => Promise<SpeechTranscriptResult | null>;

  // Local model management
  /** List all local voice models (Whisper + Piper) */
  listLocalModels: () => Promise<LocalModelsInfo | null>;
  /** Download a Whisper model */
  downloadWhisperModel: (modelSize: string) => Promise<string | null>;
  /** List available Whisper models */
  listWhisperModels: () => Promise<WhisperModelInfo[]>;
  /** Set active Whisper model */
  setWhisperModel: (modelSize: string) => Promise<void>;
  /** Download a Piper voice */
  downloadPiperVoice: (voiceId: string) => Promise<string | null>;
  /** List available Piper voices */
  listPiperVoices: () => Promise<PiperVoiceInfo[]>;
  /** Set active Piper voice */
  setPiperVoice: (voiceId: string) => Promise<void>;
}

/** Generate a simple unique ID */
function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useVoiceModeStore = create<VoiceModeState>()(
  devtools(
    persist(
      (set, get) => ({
        isOpen: false,
        phase: 'idle',
        userTranscript: '',
        aiResponse: '',
        error: null,
        turns: [],
        audioLevel: 0,
        capabilities: null,
        wakeWordActive: false,
        globalPttActive: false,
        deepgramStreaming: false,
        bargeInEnabled: false,

        _mediaStream: null,
        _recorder: null,
        _audioChunks: [],
        _analyser: null,
        _audioContext: null,
        _animFrameId: null,
        _isSpeaking: false,

        open: () => {
          set({ isOpen: true, phase: 'idle', error: null, userTranscript: '', aiResponse: '' });
          // Fetch capabilities on open
          get()
            .fetchCapabilities()
            .catch(() => {});
        },

        close: () => {
          const { _mediaStream, _recorder, _audioContext, _animFrameId } = get();

          // Stop backend TTS if speaking
          if (get()._isSpeaking) {
            voiceTtsStop().catch(() => {});
          }

          // Clean up any active recording
          if (_recorder && _recorder.state !== 'inactive') {
            try {
              _recorder.stop();
            } catch {
              // ignore
            }
          }
          _mediaStream?.getTracks().forEach((t) => t.stop());
          if (_animFrameId !== null) {
            cancelAnimationFrame(_animFrameId);
          }
          if (_audioContext) {
            try {
              _audioContext.close();
            } catch {
              // ignore
            }
          }

          set({
            isOpen: false,
            phase: 'idle',
            userTranscript: '',
            aiResponse: '',
            error: null,
            audioLevel: 0,
            _mediaStream: null,
            _recorder: null,
            _audioChunks: [],
            _analyser: null,
            _audioContext: null,
            _animFrameId: null,
            _isSpeaking: false,
          });
        },

        startListening: async () => {
          const state = get();
          if (state.phase === 'listening') return;

          set({
            phase: 'listening',
            userTranscript: '',
            aiResponse: '',
            error: null,
            audioLevel: 0,
          });

          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 16000,
              },
            });

            // Set up audio analysis for waveform visualization
            let audioContext: AudioContext | null = null;
            let analyser: AnalyserNode | null = null;
            let frameId: number | null = null;

            try {
              audioContext = new AudioContext();
              const source = audioContext.createMediaStreamSource(stream);
              analyser = audioContext.createAnalyser();
              analyser.fftSize = 256;
              analyser.smoothingTimeConstant = 0.8;
              source.connect(analyser);

              const dataArray = new Uint8Array(analyser.frequencyBinCount);

              const updateLevel = () => {
                if (get().phase !== 'listening') return;
                if (!analyser) return;
                analyser.getByteFrequencyData(dataArray);
                // Compute RMS volume
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                  const val = dataArray[i] ?? 0;
                  sum += val * val;
                }
                const rms = Math.sqrt(sum / dataArray.length) / 255;
                set({ audioLevel: Math.min(1, rms * 2.5) });
                const id = requestAnimationFrame(updateLevel);
                set({ _animFrameId: id });
              };

              frameId = requestAnimationFrame(updateLevel);
            } catch {
              // AudioContext creation can fail in restricted environments
              audioContext = null;
              analyser = null;
            }

            // Set up MediaRecorder
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

            set({
              _mediaStream: stream,
              _recorder: recorder,
              _audioChunks: chunks,
              _analyser: analyser,
              _audioContext: audioContext,
              _animFrameId: frameId,
            });
          } catch (e) {
            const err = e as Error;
            const msg =
              err.name === 'NotAllowedError'
                ? 'Microphone access denied. Allow mic access in System Preferences.'
                : err.name === 'NotFoundError'
                  ? 'No microphone found. Connect a mic and try again.'
                  : String(e);
            set({ phase: 'idle', error: msg });
          }
        },

        stopListeningAndProcess: async (onSend?: (text: string) => void) => {
          const { phase, _recorder, _mediaStream, _audioContext, _animFrameId } = get();

          if (phase !== 'listening' || !_recorder) {
            return;
          }

          // Stop audio analysis
          if (_animFrameId !== null) {
            cancelAnimationFrame(_animFrameId);
          }

          set({ phase: 'processing', audioLevel: 0, _animFrameId: null });

          // Stop recording and collect audio
          await new Promise<void>((resolve) => {
            _recorder.onstop = () => resolve();
            _recorder.stop();
          });

          _mediaStream?.getTracks().forEach((t) => t.stop());
          if (_audioContext) {
            try {
              _audioContext.close();
            } catch {
              // ignore
            }
          }

          const { _audioChunks } = get();

          try {
            const blob = new Blob(_audioChunks, {
              type: _audioChunks[0]?.type ?? 'audio/webm',
            });

            if (blob.size === 0) {
              set({
                phase: 'idle',
                _recorder: null,
                _mediaStream: null,
                _audioChunks: [],
                _analyser: null,
                _audioContext: null,
              });
              return;
            }

            const arrayBuffer = await blob.arrayBuffer();
            const audioData = Array.from(new Uint8Array(arrayBuffer));
            const format = blob.type.includes('mp4') ? 'mp4' : 'webm';

            // Step 1: Transcribe the audio via Rust backend
            const transcriptionResult = await voiceTranscribeBlob(
              audioData,
              format,
              'local_whisper',
              'en',
            );

            const userText = transcriptionResult?.text?.trim() ?? '';

            if (!userText) {
              set({
                phase: 'idle',
                _recorder: null,
                _mediaStream: null,
                _audioChunks: [],
                _analyser: null,
                _audioContext: null,
              });
              return;
            }

            set({ userTranscript: userText });

            // Also send to chat if callback provided
            onSend?.(userText);

            // Step 2: Get LLM response
            const { useModelStore } = await import('./modelStore');
            const { selectedModel, selectedProvider } = useModelStore.getState();

            // Build conversation context from recent turns
            const { turns } = get();
            const contextMessages: Array<{ role: string; content: string }> = [
              {
                role: 'system',
                content:
                  'You are a helpful voice assistant. Keep responses concise and conversational since they will be spoken aloud. Aim for 1-3 sentences unless the user asks for detail.',
              },
            ];

            // Include last 5 turns for context
            const recentTurns = turns.slice(-5);
            for (const turn of recentTurns) {
              contextMessages.push({ role: 'user', content: turn.userText });
              contextMessages.push({ role: 'assistant', content: turn.aiText });
            }

            contextMessages.push({ role: 'user', content: userText });

            const llmResponse = await invoke<LLMResponse>('llm_send_message', {
              messages: contextMessages,
              model: selectedModel ?? 'claude-haiku-4.5',
              provider: selectedProvider ?? 'anthropic',
              maxTokens: 300,
              preferCloudCredits: false,
            });

            const aiText = llmResponse?.content?.trim() ?? '';

            if (!aiText) {
              set({
                phase: 'idle',
                aiResponse: '',
                error: 'No response from AI',
                _recorder: null,
                _mediaStream: null,
                _audioChunks: [],
                _analyser: null,
                _audioContext: null,
              });
              return;
            }

            // Record the turn
            const newTurn: VoiceTurn = {
              id: uid(),
              userText,
              aiText,
              timestamp: Date.now(),
            };

            set((s) => ({
              aiResponse: aiText,
              turns: [...s.turns, newTurn],
            }));

            // Step 3: Speak the response via TTS (with barge-in if enabled)
            set({ phase: 'speaking', _isSpeaking: true });

            try {
              if (get().bargeInEnabled) {
                await voiceTtsSpeakWithBargeIn(aiText);
              } else {
                await voiceTtsSpeak(aiText);
              }
            } catch {
              // TTS failed -- still show the response, just don't speak
            }

            // After speaking completes, return to idle -- but only if still in
            // the speaking phase and the overlay is still open. The user may have
            // closed the overlay or interrupted while TTS was playing.
            const postTtsState = get();
            if (postTtsState.phase === 'speaking' && postTtsState.isOpen) {
              set({
                phase: 'idle',
                _isSpeaking: false,
                _recorder: null,
                _mediaStream: null,
                _audioChunks: [],
                _analyser: null,
                _audioContext: null,
              });
            }
          } catch (e) {
            set({
              phase: 'idle',
              error: String(e),
              _recorder: null,
              _mediaStream: null,
              _audioChunks: [],
              _analyser: null,
              _audioContext: null,
            });
          }
        },

        stopSpeaking: async () => {
          // Stop backend TTS playback
          try {
            await voiceTtsStop();
          } catch {
            // Fallback: just update local state
          }
          set({
            phase: 'idle',
            _isSpeaking: false,
          });
        },

        reset: () => {
          const { _mediaStream, _recorder, _audioContext, _animFrameId, _isSpeaking } = get();

          // Stop backend TTS if speaking
          if (_isSpeaking) {
            voiceTtsStop().catch(() => {});
          }

          if (_recorder && _recorder.state !== 'inactive') {
            try {
              _recorder.stop();
            } catch {
              // ignore
            }
          }
          _mediaStream?.getTracks().forEach((t) => t.stop());
          if (_animFrameId !== null) {
            cancelAnimationFrame(_animFrameId);
          }
          if (_audioContext) {
            try {
              _audioContext.close();
            } catch {
              // ignore
            }
          }

          set({
            phase: 'idle',
            userTranscript: '',
            aiResponse: '',
            error: null,
            turns: [],
            audioLevel: 0,
            _mediaStream: null,
            _recorder: null,
            _audioChunks: [],
            _analyser: null,
            _audioContext: null,
            _animFrameId: null,
            _isSpeaking: false,
          });
        },

        // =====================================================================
        // Backend voice command wrappers
        // =====================================================================

        fetchCapabilities: async () => {
          try {
            const caps = await voiceGetCapabilities();
            set({
              capabilities: caps,
              wakeWordActive: caps?.wakeWordEnabled ?? false,
              bargeInEnabled: caps?.bargeInEnabled ?? false,
            });
            return caps;
          } catch (error) {
            console.warn('[voiceMode] fetchCapabilities failed:', error);
            return null;
          }
        },

        getBackendSettings: async () => {
          try {
            return await voiceGetSettings();
          } catch (error) {
            console.warn('[voiceMode] getBackendSettings failed:', error);
            return null;
          }
        },

        configureBackend: async (provider?: string, model?: string, language?: string) => {
          try {
            await voiceConfigure(provider, model, language);
          } catch (e) {
            set({ error: String(e) });
          }
        },

        // -- TTS commands --

        speakWithBargeIn: async (text: string) => {
          set({ phase: 'speaking', _isSpeaking: true });
          try {
            await voiceTtsSpeakWithBargeIn(text);
          } catch (error) {
            console.warn('[voiceMode] speakWithBargeIn failed, trying regular TTS:', error);
            // Fallback to regular TTS
            try {
              await voiceTtsSpeak(text);
            } catch (fallbackError) {
              console.warn(
                '[voiceMode] speakWithBargeIn regular TTS fallback also failed:',
                fallbackError,
              );
            }
          }
          if (get().phase === 'speaking') {
            set({ phase: 'idle', _isSpeaking: false });
          }
        },

        stopTts: async () => {
          try {
            const stopped = await voiceTtsStop();
            set({ _isSpeaking: false });
            if (get().phase === 'speaking') {
              set({ phase: 'idle' });
            }
            return stopped;
          } catch {
            set({ _isSpeaking: false });
            return false;
          }
        },

        isTtsPlaying: async () => {
          try {
            return await voiceTtsIsPlaying();
          } catch {
            return false;
          }
        },

        listTtsVoices: async () => {
          try {
            return await voiceTtsListVoices();
          } catch {
            return [];
          }
        },

        configureTts: async (config: TtsConfig) => {
          try {
            await voiceTtsConfigure(config);
          } catch (e) {
            set({ error: String(e) });
          }
        },

        speakLocal: async (text: string, rate?: number, volume?: number) => {
          try {
            await voiceTtsSpeakLocal(text, rate, volume);
          } catch (e) {
            set({ error: String(e) });
          }
        },

        // -- Wake word commands --

        enableWakeWord: async (config?: WakeWordConfig) => {
          try {
            await voiceWakeEnable(config);
            set({ wakeWordActive: true });
          } catch (e) {
            set({ error: String(e) });
          }
        },

        disableWakeWord: async () => {
          try {
            await voiceWakeDisable();
            set({ wakeWordActive: false });
          } catch (e) {
            set({ error: String(e) });
          }
        },

        getWakeWordStatus: async () => {
          try {
            const active = await voiceWakeStatus();
            set({ wakeWordActive: active });
            return active;
          } catch {
            return false;
          }
        },

        configureWakeWord: async (config: WakeWordConfig) => {
          try {
            await voiceWakeConfigure(config);
          } catch (e) {
            set({ error: String(e) });
          }
        },

        // -- PTT commands --

        configurePtt: async (config: PttConfig) => {
          try {
            await voicePttConfigure(config);
          } catch (e) {
            set({ error: String(e) });
          }
        },

        getPttState: async () => {
          try {
            return await voicePttState();
          } catch {
            return 'idle';
          }
        },

        pttKeyDown: async () => {
          try {
            await voicePttKeyDown();
          } catch (e) {
            set({ error: String(e) });
          }
        },

        pttKeyUp: async () => {
          try {
            return await voicePttKeyUp();
          } catch {
            return null;
          }
        },

        // -- Global PTT commands --

        startGlobalPtt: async () => {
          try {
            await voiceStartGlobalPtt();
            set({ globalPttActive: true });
          } catch (e) {
            set({ error: String(e) });
          }
        },

        stopGlobalPtt: async () => {
          try {
            await voiceStopGlobalPtt();
            set({ globalPttActive: false });
          } catch (e) {
            set({ error: String(e) });
          }
        },

        injectText: async (text: string) => {
          try {
            await voiceInjectText(text);
          } catch (e) {
            set({ error: String(e) });
          }
        },

        // -- Deepgram streaming commands --

        configureDeepgram: async (config: DeepgramConfig) => {
          try {
            await voiceDeepgramConfigure(config);
          } catch (e) {
            set({ error: String(e) });
          }
        },

        startDeepgramStream: async () => {
          try {
            await voiceStartDeepgramStream();
            set({ deepgramStreaming: true });
          } catch (e) {
            set({ error: String(e) });
          }
        },

        stopDeepgramStream: async () => {
          try {
            const stats = await voiceStopDeepgramStream();
            set({ deepgramStreaming: false });
            return stats;
          } catch {
            set({ deepgramStreaming: false });
            return null;
          }
        },

        sendDeepgramAudio: async (audioData: number[]) => {
          try {
            await voiceDeepgramSendAudio(audioData);
          } catch (e) {
            set({ error: String(e) });
          }
        },

        getDeepgramStatus: async () => {
          try {
            const status = await voiceDeepgramStatus();
            if (status) {
              set({ deepgramStreaming: status.isStreaming });
            }
            return status;
          } catch {
            return null;
          }
        },

        // -- Barge-in commands --

        enableBargeIn: async (enabled: boolean) => {
          try {
            const result = await voiceEnableBargeIn(enabled);
            set({ bargeInEnabled: result });
            return result;
          } catch (e) {
            set({ error: String(e) });
            return false;
          }
        },

        getBargeInStatus: async () => {
          try {
            const status = await voiceGetBargeInStatus();
            if (status) {
              set({ bargeInEnabled: status.enabled });
            }
            return status;
          } catch {
            return null;
          }
        },

        configureBargeIn: async (
          sensitivity?: number,
          minSpeechMs?: number,
          consecutiveFramesThreshold?: number,
        ) => {
          try {
            return await voiceConfigureBargeIn(
              sensitivity,
              minSpeechMs,
              consecutiveFramesThreshold,
            );
          } catch (e) {
            set({ error: String(e) });
            return null;
          }
        },

        startBargeInMonitoring: async () => {
          try {
            return await voiceStartBargeInMonitoring();
          } catch (e) {
            set({ error: String(e) });
            return false;
          }
        },

        stopBargeInMonitoring: async () => {
          try {
            return await voiceStopBargeInMonitoring();
          } catch {
            return false;
          }
        },

        // -- Native speech recording commands (Wispr Flow) --

        startNativeRecording: async (provider?: string) => {
          try {
            await speechStartRecording(provider ?? 'cloud');
          } catch (e) {
            set({ error: String(e) });
          }
        },

        stopNativeRecordingAndTranscribe: async (provider?: string, language?: string) => {
          try {
            return await speechStopAndTranscribe(provider ?? 'cloud', language ?? 'en');
          } catch (e) {
            set({ error: String(e) });
            return null;
          }
        },

        // -- Local model management --

        listLocalModels: async () => {
          try {
            return await voiceListLocalModels();
          } catch {
            return null;
          }
        },

        downloadWhisperModel: async (modelSize: string) => {
          try {
            const path = await voiceDownloadWhisperModel(modelSize);
            return path || null;
          } catch (e) {
            set({ error: String(e) });
            return null;
          }
        },

        listWhisperModels: async () => {
          try {
            return await voiceListWhisperModels();
          } catch {
            return [];
          }
        },

        setWhisperModel: async (modelSize: string) => {
          try {
            await voiceSetWhisperModel(modelSize);
          } catch (e) {
            set({ error: String(e) });
          }
        },

        downloadPiperVoice: async (voiceId: string) => {
          try {
            const path = await voiceDownloadPiperVoice(voiceId);
            return path || null;
          } catch (e) {
            set({ error: String(e) });
            return null;
          }
        },

        listPiperVoices: async () => {
          try {
            return await voiceListPiperVoices();
          } catch {
            return [];
          }
        },

        setPiperVoice: async (voiceId: string) => {
          try {
            await voiceSetPiperVoice(voiceId);
          } catch (e) {
            set({ error: String(e) });
          }
        },
      }),
      {
        name: 'agiworkforce-voice-mode',
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          wakeWordActive: state.wakeWordActive,
          bargeInEnabled: state.bargeInEnabled,
        }),
      },
    ),
    { name: 'VoiceModeStore', enabled: import.meta.env.DEV },
  ),
);

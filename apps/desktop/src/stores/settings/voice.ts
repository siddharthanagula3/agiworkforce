import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import {
  listen as voiceListen,
  isTauri as voiceIsTauri,
  invoke,
  type UnlistenFn as VoiceUnlistenFn,
} from '@/lib/tauri-mock';
import { storageFallback } from '@/lib/storageFallback';
import { getProviderDefaultModel, getTaskModelForProvider } from '@/constants/llm';
import { getDefaultModelFor } from '@agiworkforce/types';
import { useModelStore } from '../modelStore';
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
} from '@/api/voice';
import type {
  VoiceCapabilities,
  VoiceSettings as VoiceSettingsApi,
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
} from '@/api/voice';
import { cleanupVoiceDictation, detectVoiceCommand } from '@agiworkforce/utils';

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

export type VoiceSettingsBackend = VoiceSettingsApi;
export type VoiceModePhase = 'idle' | 'listening' | 'processing' | 'speaking';

export interface VoiceTurn {
  id: string;
  userText: string;
  aiText: string;
  timestamp: number;
}

interface VoiceDeepgramTranscriptEvent {
  transcript?: string;
  text?: string;
  isFinal?: boolean;
  is_final?: boolean;
}

interface VoiceLLMResponse {
  content: string;
}

interface VoiceModeState {
  isOpen: boolean;
  phase: VoiceModePhase;
  userTranscript: string;
  aiResponse: string;
  error: string | null;
  turns: VoiceTurn[];
  audioLevel: number;
  capabilities: VoiceCapabilities | null;
  wakeWordActive: boolean;
  globalPttActive: boolean;
  deepgramStreaming: boolean;
  bargeInEnabled: boolean;
  _mediaStream: MediaStream | null;
  _recorder: MediaRecorder | null;
  _audioChunks: Blob[];
  _analyser: AnalyserNode | null;
  _audioContext: AudioContext | null;
  _animFrameId: number | null;
  _isSpeaking: boolean;
  _deepgramUnlisten: VoiceUnlistenFn | null;
  open: () => void;
  close: () => void;
  startListening: () => Promise<void>;
  stopListeningAndProcess: (onSend?: (text: string) => void) => Promise<void>;
  stopSpeaking: () => Promise<void>;
  reset: () => void;
  fetchCapabilities: () => Promise<VoiceCapabilities | null>;
  getBackendSettings: () => Promise<VoiceSettingsBackend | null>;
  configureBackend: (provider?: string, model?: string, language?: string) => Promise<void>;
  speakWithBargeIn: (text: string) => Promise<void>;
  stopTts: () => Promise<boolean>;
  isTtsPlaying: () => Promise<boolean>;
  listTtsVoices: () => Promise<TtsVoice[]>;
  configureTts: (config: TtsConfig) => Promise<void>;
  speakLocal: (text: string, rate?: number, volume?: number) => Promise<void>;
  enableWakeWord: (config?: WakeWordConfig) => Promise<void>;
  disableWakeWord: () => Promise<void>;
  getWakeWordStatus: () => Promise<boolean>;
  configureWakeWord: (config: WakeWordConfig) => Promise<void>;
  configurePtt: (config: PttConfig) => Promise<void>;
  getPttState: () => Promise<string>;
  pttKeyDown: () => Promise<void>;
  pttKeyUp: () => Promise<number | null>;
  startGlobalPtt: () => Promise<void>;
  stopGlobalPtt: () => Promise<void>;
  injectText: (text: string) => Promise<void>;
  configureDeepgram: (config: DeepgramConfig) => Promise<void>;
  startDeepgramStream: () => Promise<void>;
  stopDeepgramStream: () => Promise<DeepgramStreamingStats | null>;
  sendDeepgramAudio: (audioData: number[]) => Promise<void>;
  getDeepgramStatus: () => Promise<DeepgramStreamStatus | null>;
  enableBargeIn: (enabled: boolean) => Promise<boolean>;
  getBargeInStatus: () => Promise<BargeInStatus | null>;
  configureBargeIn: (
    sensitivity?: number,
    minSpeechMs?: number,
    consecutiveFramesThreshold?: number,
  ) => Promise<BargeInConfig | null>;
  startBargeInMonitoring: () => Promise<boolean>;
  stopBargeInMonitoring: () => Promise<boolean>;
  startNativeRecording: (provider?: string) => Promise<void>;
  stopNativeRecordingAndTranscribe: (
    provider?: string,
    language?: string,
  ) => Promise<SpeechTranscriptResult | null>;
  listLocalModels: () => Promise<LocalModelsInfo | null>;
  downloadWhisperModel: (modelSize: string) => Promise<string | null>;
  listWhisperModels: () => Promise<WhisperModelInfo[]>;
  setWhisperModel: (modelSize: string) => Promise<void>;
  downloadPiperVoice: (voiceId: string) => Promise<string | null>;
  listPiperVoices: () => Promise<PiperVoiceInfo[]>;
  setPiperVoice: (voiceId: string) => Promise<void>;
}

function voiceUid(): string {
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
        _deepgramUnlisten: null,

        open: () => {
          set({ isOpen: true, phase: 'idle', error: null, userTranscript: '', aiResponse: '' });
          get()
            .fetchCapabilities()
            .catch((err: unknown) => {
              console.warn('[voiceMode] fetchCapabilities failed', err);
            });
        },

        close: () => {
          const { _mediaStream, _recorder, _audioContext, _animFrameId, _deepgramUnlisten } = get();
          if (get()._isSpeaking) {
            voiceTtsStop().catch((err: unknown) => {
              console.warn('[voiceMode] voiceTtsStop on close failed', err);
            });
          }
          if (_recorder && _recorder.state !== 'inactive') {
            try {
              _recorder.stop();
            } catch (err) {
              console.warn('[voiceMode] recorder.stop on close failed', err);
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
              /* ignore */
            }
          }
          _deepgramUnlisten?.();
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
            _deepgramUnlisten: null,
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
              audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
            });
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
              audioContext = null;
              analyser = null;
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
          if (!voiceIsTauri) return;
          const { phase, _recorder, _mediaStream, _audioContext, _animFrameId } = get();
          if (phase !== 'listening' || !_recorder) return;
          if (_animFrameId !== null) {
            cancelAnimationFrame(_animFrameId);
          }
          set({ phase: 'processing', audioLevel: 0, _animFrameId: null });
          await new Promise<void>((resolve) => {
            _recorder.onstop = () => resolve();
            _recorder.stop();
          });
          _mediaStream?.getTracks().forEach((t) => t.stop());
          if (_audioContext) {
            try {
              _audioContext.close();
            } catch {
              /* ignore */
            }
          }
          const { _audioChunks } = get();
          try {
            const blob = new Blob(_audioChunks, { type: _audioChunks[0]?.type ?? 'audio/webm' });
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
            onSend?.(userText);
            const { selectedModel, selectedProvider } = useModelStore.getState();
            const fallbackProvider = selectedProvider ?? 'anthropic';
            const fallbackModel =
              selectedModel ??
              getTaskModelForProvider(fallbackProvider, 'fast_completion') ??
              getProviderDefaultModel(fallbackProvider) ??
              getDefaultModelFor(null, 'voice');
            const { turns } = get();
            const contextMessages: Array<{ role: string; content: string }> = [
              {
                role: 'system',
                content:
                  'You are a helpful voice assistant. Keep responses concise and conversational since they will be spoken aloud. Aim for 1-3 sentences unless the user asks for detail.',
              },
            ];
            const recentTurns = turns.slice(-5);
            for (const turn of recentTurns) {
              contextMessages.push({ role: 'user', content: turn.userText });
              contextMessages.push({ role: 'assistant', content: turn.aiText });
            }
            contextMessages.push({ role: 'user', content: userText });
            const llmResponse = await invoke<VoiceLLMResponse>('llm_send_message', {
              messages: contextMessages,
              model: fallbackModel,
              provider: fallbackProvider,
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
            const newTurn: VoiceTurn = { id: voiceUid(), userText, aiText, timestamp: Date.now() };
            set((s) => ({ aiResponse: aiText, turns: [...s.turns, newTurn] }));
            set({ phase: 'speaking', _isSpeaking: true });
            try {
              if (get().bargeInEnabled) {
                await voiceTtsSpeakWithBargeIn(aiText);
              } else {
                await voiceTtsSpeak(aiText);
              }
            } catch (ttsErr) {
              console.warn('[voiceMode] TTS speak failed', ttsErr);
            }
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
          if (!voiceIsTauri) {
            set({ phase: 'idle', _isSpeaking: false });
            return;
          }
          try {
            await voiceTtsStop();
          } catch (stopErr) {
            console.warn('[voiceMode] voiceTtsStop on reset failed', stopErr);
          }
          set({ phase: 'idle', _isSpeaking: false });
        },

        reset: () => {
          const {
            _mediaStream,
            _recorder,
            _audioContext,
            _animFrameId,
            _isSpeaking,
            _deepgramUnlisten,
          } = get();
          if (_isSpeaking) {
            voiceTtsStop().catch((err: unknown) => {
              console.warn('[voiceMode] voiceTtsStop on cancel failed', err);
            });
          }
          if (_recorder && _recorder.state !== 'inactive') {
            try {
              _recorder.stop();
            } catch (err) {
              console.warn('[voiceMode] recorder.stop on cancel failed', err);
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
              /* ignore */
            }
          }
          _deepgramUnlisten?.();
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
            _deepgramUnlisten: null,
          });
        },

        fetchCapabilities: async () => {
          if (!voiceIsTauri) return null;
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
          if (!voiceIsTauri) return null;
          try {
            return await voiceGetSettings();
          } catch (error) {
            console.warn('[voiceMode] getBackendSettings failed:', error);
            return null;
          }
        },

        configureBackend: async (provider?: string, model?: string, language?: string) => {
          if (!voiceIsTauri) return;
          try {
            await voiceConfigure(provider, model, language);
          } catch (e) {
            set({ error: String(e) });
          }
        },

        speakWithBargeIn: async (text: string) => {
          if (!voiceIsTauri) return;
          set({ phase: 'speaking', _isSpeaking: true });
          try {
            await voiceTtsSpeakWithBargeIn(text);
          } catch (error) {
            console.warn('[voiceMode] speakWithBargeIn failed, trying regular TTS:', error);
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
          if (!voiceIsTauri) {
            set({ _isSpeaking: false });
            return false;
          }
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
          if (!voiceIsTauri) return false;
          try {
            return await voiceTtsIsPlaying();
          } catch {
            return false;
          }
        },
        listTtsVoices: async () => {
          if (!voiceIsTauri) return [];
          try {
            return await voiceTtsListVoices();
          } catch {
            return [];
          }
        },
        configureTts: async (config: TtsConfig) => {
          if (!voiceIsTauri) return;
          try {
            await voiceTtsConfigure(config);
          } catch (e) {
            set({ error: String(e) });
          }
        },
        speakLocal: async (text: string, rate?: number, volume?: number) => {
          if (!voiceIsTauri) return;
          try {
            await voiceTtsSpeakLocal(text, rate, volume);
          } catch (e) {
            set({ error: String(e) });
          }
        },
        enableWakeWord: async (config?: WakeWordConfig) => {
          if (!voiceIsTauri) return;
          try {
            await voiceWakeEnable(config);
            set({ wakeWordActive: true });
          } catch (e) {
            set({ error: String(e) });
          }
        },
        disableWakeWord: async () => {
          if (!voiceIsTauri) return;
          try {
            await voiceWakeDisable();
            set({ wakeWordActive: false });
          } catch (e) {
            set({ error: String(e) });
          }
        },
        getWakeWordStatus: async () => {
          if (!voiceIsTauri) return false;
          try {
            const active = await voiceWakeStatus();
            set({ wakeWordActive: active });
            return active;
          } catch {
            return false;
          }
        },
        configureWakeWord: async (config: WakeWordConfig) => {
          if (!voiceIsTauri) return;
          try {
            await voiceWakeConfigure(config);
          } catch (e) {
            set({ error: String(e) });
          }
        },
        configurePtt: async (config: PttConfig) => {
          if (!voiceIsTauri) return;
          try {
            await voicePttConfigure(config);
          } catch (e) {
            set({ error: String(e) });
          }
        },
        getPttState: async () => {
          if (!voiceIsTauri) return 'idle';
          try {
            return await voicePttState();
          } catch {
            return 'idle';
          }
        },
        pttKeyDown: async () => {
          if (!voiceIsTauri) return;
          try {
            await voicePttKeyDown();
          } catch (e) {
            set({ error: String(e) });
          }
        },
        pttKeyUp: async () => {
          if (!voiceIsTauri) return null;
          try {
            return await voicePttKeyUp();
          } catch {
            return null;
          }
        },
        startGlobalPtt: async () => {
          if (!voiceIsTauri) return;
          try {
            await voiceStartGlobalPtt();
            set({ globalPttActive: true });
          } catch (e) {
            set({ error: String(e) });
          }
        },
        stopGlobalPtt: async () => {
          if (!voiceIsTauri) return;
          try {
            await voiceStopGlobalPtt();
            set({ globalPttActive: false });
          } catch (e) {
            set({ error: String(e) });
          }
        },
        injectText: async (text: string) => {
          if (!voiceIsTauri) return;
          try {
            await voiceInjectText(text);
          } catch (e) {
            set({ error: String(e) });
          }
        },
        configureDeepgram: async (config: DeepgramConfig) => {
          if (!voiceIsTauri) return;
          try {
            await voiceDeepgramConfigure(config);
          } catch (e) {
            set({ error: String(e) });
          }
        },

        startDeepgramStream: async () => {
          if (!voiceIsTauri) return;
          try {
            get()._deepgramUnlisten?.();
            const unlisten = await voiceListen<VoiceDeepgramTranscriptEvent>(
              'deepgram:transcript',
              (event) => {
                const payload = event.payload ?? {};
                const nextTranscript = payload.text ?? payload.transcript ?? '';
                if (!nextTranscript) return;
                set((state) => ({
                  userTranscript:
                    (payload.isFinal ?? payload.is_final)
                      ? nextTranscript
                      : state.userTranscript
                        ? `${state.userTranscript} ${nextTranscript}`.trim()
                        : nextTranscript,
                }));
              },
            );
            await voiceStartDeepgramStream();
            set({ deepgramStreaming: true, error: null, _deepgramUnlisten: unlisten });
          } catch (e) {
            get()._deepgramUnlisten?.();
            set({ _deepgramUnlisten: null, error: String(e) });
          }
        },

        stopDeepgramStream: async () => {
          if (!voiceIsTauri) return null;
          try {
            const stats = await voiceStopDeepgramStream();
            get()._deepgramUnlisten?.();
            set({ deepgramStreaming: false, _deepgramUnlisten: null });
            return stats;
          } catch {
            get()._deepgramUnlisten?.();
            set({ deepgramStreaming: false, _deepgramUnlisten: null });
            return null;
          }
        },

        sendDeepgramAudio: async (audioData: number[]) => {
          if (!voiceIsTauri) return;
          try {
            await voiceDeepgramSendAudio(audioData);
          } catch (e) {
            set({ error: String(e) });
          }
        },
        getDeepgramStatus: async () => {
          if (!voiceIsTauri) return null;
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
        enableBargeIn: async (enabled: boolean) => {
          if (!voiceIsTauri) return false;
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
          if (!voiceIsTauri) return null;
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
          if (!voiceIsTauri) return null;
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
          if (!voiceIsTauri) return false;
          try {
            return await voiceStartBargeInMonitoring();
          } catch (e) {
            set({ error: String(e) });
            return false;
          }
        },
        stopBargeInMonitoring: async () => {
          if (!voiceIsTauri) return false;
          try {
            return await voiceStopBargeInMonitoring();
          } catch {
            return false;
          }
        },
        startNativeRecording: async (provider?: string) => {
          if (!voiceIsTauri) return;
          try {
            await speechStartRecording(provider ?? 'cloud');
          } catch (e) {
            set({ error: String(e) });
          }
        },
        stopNativeRecordingAndTranscribe: async (provider?: string, language?: string) => {
          if (!voiceIsTauri) return null;
          try {
            return await speechStopAndTranscribe(provider ?? 'cloud', language ?? 'en');
          } catch (e) {
            set({ error: String(e) });
            return null;
          }
        },
        listLocalModels: async () => {
          if (!voiceIsTauri) return null;
          try {
            return await voiceListLocalModels();
          } catch {
            return null;
          }
        },
        downloadWhisperModel: async (modelSize: string) => {
          if (!voiceIsTauri) return null;
          try {
            const path = await voiceDownloadWhisperModel(modelSize);
            return path || null;
          } catch (e) {
            set({ error: String(e) });
            return null;
          }
        },
        listWhisperModels: async () => {
          if (!voiceIsTauri) return [];
          try {
            return await voiceListWhisperModels();
          } catch {
            return [];
          }
        },
        setWhisperModel: async (modelSize: string) => {
          if (!voiceIsTauri) return;
          try {
            await voiceSetWhisperModel(modelSize);
          } catch (e) {
            set({ error: String(e) });
          }
        },
        downloadPiperVoice: async (voiceId: string) => {
          if (!voiceIsTauri) return null;
          try {
            const path = await voiceDownloadPiperVoice(voiceId);
            return path || null;
          } catch (e) {
            set({ error: String(e) });
            return null;
          }
        },
        listPiperVoices: async () => {
          if (!voiceIsTauri) return [];
          try {
            return await voiceListPiperVoices();
          } catch {
            return [];
          }
        },
        setPiperVoice: async (voiceId: string) => {
          if (!voiceIsTauri) return;
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

// -- VoiceInput Store --

type VoiceInputMode = 'idle' | 'listening' | 'transcribing' | 'processing' | 'preview';
export type PostProcessingMode = 'ai' | 'basic' | 'none';
export { detectVoiceCommand };

interface VoiceLLMResponsePayload {
  content: string;
}
interface VoiceTranscriptResult {
  text: string;
  isCommand: boolean;
}

interface VoiceInputState {
  voiceMode: VoiceInputMode;
  transcript: string;
  pendingTranscript: string;
  lastTranscriptIsCommand: boolean;
  voiceError: string | null;
  hotkey: 'option' | 'ctrl+space' | 'ctrl+shift+v' | 'caps_lock';
  voiceProvider: 'local_whisper' | 'deepgram' | 'openai_whisper';
  voiceLanguage: string;
  postProcessingMode: PostProcessingMode;
  _mediaStream: MediaStream | null;
  _recorder: MediaRecorder | null;
  _audioChunks: Blob[];
  _startAborted: boolean;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  confirmTranscript: () => void;
  setHotkey: (hotkey: VoiceInputState['hotkey']) => void;
  setProvider: (provider: VoiceInputState['voiceProvider']) => void;
  setLanguage: (language: string) => void;
  setPostProcessingMode: (mode: PostProcessingMode) => void;
  clearTranscript: () => void;
  processTranscript: (rawTranscript: string) => Promise<VoiceTranscriptResult>;
}

export const useVoiceInputStore = create<VoiceInputState>()(
  devtools(
    persist(
      (set, get) => ({
        voiceMode: 'idle',
        transcript: '',
        pendingTranscript: '',
        lastTranscriptIsCommand: false,
        voiceError: null,
        hotkey: 'option',
        voiceProvider: 'local_whisper',
        voiceLanguage: 'en',
        postProcessingMode: 'ai',
        _mediaStream: null,
        _recorder: null,
        _audioChunks: [],
        _startAborted: false,

        startListening: async () => {
          set({
            voiceMode: 'listening',
            transcript: '',
            voiceError: null,
            lastTranscriptIsCommand: false,
            _startAborted: false,
          });
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (get()._startAborted) {
              stream.getTracks().forEach((t) => t.stop());
              set({ voiceMode: 'idle', _startAborted: false });
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
                ? 'Microphone access denied.'
                : err.name === 'NotFoundError'
                  ? 'No microphone found.'
                  : String(e);
            set({ voiceMode: 'idle', voiceError: msg });
          }
        },

        stopListening: async () => {
          const { voiceMode, _recorder, _mediaStream } = get();
          if (voiceMode !== 'listening') return;
          if (!_recorder) {
            set({ _startAborted: true, voiceMode: 'idle' });
            return;
          }
          set({ voiceMode: 'transcribing' });
          await new Promise<void>((resolve) => {
            _recorder.onstop = () => resolve();
            _recorder.stop();
          });
          _mediaStream?.getTracks().forEach((t) => t.stop());
          const { _audioChunks } = get();
          try {
            const blob = new Blob(_audioChunks, { type: _audioChunks[0]?.type ?? 'audio/webm' });
            if (blob.size === 0) {
              set({
                voiceMode: 'idle',
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
            const { voiceProvider, voiceLanguage } = get();
            const result = await voiceTranscribeBlob(
              audioData,
              format,
              voiceProvider,
              voiceLanguage,
            );
            const rawText = result?.text?.trim() ?? '';
            if (!rawText) {
              set({
                voiceMode: 'idle',
                _recorder: null,
                _mediaStream: null,
                _audioChunks: [],
                _startAborted: false,
              });
              return;
            }
            if (get().postProcessingMode === 'ai') set({ voiceMode: 'processing' });
            const { text: cleanText, isCommand } = await get().processTranscript(rawText);
            set({
              voiceMode: 'preview',
              pendingTranscript: cleanText,
              lastTranscriptIsCommand: isCommand,
              _recorder: null,
              _mediaStream: null,
              _audioChunks: [],
              _startAborted: false,
            });
          } catch (e) {
            set({
              voiceMode: 'idle',
              voiceError: String(e),
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
            voiceMode: 'idle',
            transcript: pendingTranscript,
            pendingTranscript: '',
            lastTranscriptIsCommand,
          });
        },

        processTranscript: async (rawTranscript: string): Promise<VoiceTranscriptResult> => {
          const raw = rawTranscript.trim();
          if (raw.length < 3) return { text: raw, isCommand: false };
          const isCommand = detectVoiceCommand(raw);
          const { postProcessingMode } = get();
          if (postProcessingMode === 'none') return { text: raw, isCommand };
          if (postProcessingMode === 'basic')
            return { text: cleanupVoiceDictation(raw), isCommand };
          try {
            const { selectedModel, selectedProvider } = useModelStore.getState();
            const systemContent = isCommand
              ? 'You are a voice command interpreter. Output ONLY the cleaned command instruction. No explanation.'
              : 'You are a voice transcription editor. Clean up dictation: remove fillers, fix run-ons, add punctuation. Output ONLY cleaned text.';
            const response = await invoke<VoiceLLMResponsePayload>('llm_send_message', {
              messages: [
                { role: 'system', content: systemContent },
                { role: 'user', content: raw },
              ],
              model: selectedModel ?? 'auto-economy',
              provider: selectedProvider ?? 'anthropic',
              max_tokens: 500,
              prefer_cloud_credits: false,
            });
            const cleaned = response?.content?.trim() ?? '';
            return { text: cleaned || cleanupVoiceDictation(raw), isCommand };
          } catch {
            return { text: cleanupVoiceDictation(raw), isCommand };
          }
        },

        setHotkey: (hotkey) => set({ hotkey }),
        setProvider: (provider) => set({ voiceProvider: provider }),
        setLanguage: (language) => set({ voiceLanguage: language }),
        setPostProcessingMode: (mode) => set({ postProcessingMode: mode }),
        clearTranscript: () =>
          set({ transcript: '', pendingTranscript: '', lastTranscriptIsCommand: false }),
      }),
      {
        name: 'agiworkforce-voice-input',
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          hotkey: state.hotkey,
          voiceProvider: state.voiceProvider,
          voiceLanguage: state.voiceLanguage,
          postProcessingMode: state.postProcessingMode,
        }),
      },
    ),
    { name: 'voice-input-store' },
  ),
);

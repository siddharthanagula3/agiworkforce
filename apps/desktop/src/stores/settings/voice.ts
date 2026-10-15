import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { toast } from 'sonner';
import { isTauri as voiceIsTauri, invoke } from '@/lib/tauri-mock';
import { storageFallback } from '@/lib/storageFallback';
import { isLocalProvider } from '@/types/provider';
import { selectIsCloud, useAppModeStore } from '../appModeStore';
import { useModelStore } from '../modelStore';
import {
  voiceGetCapabilities,
  voiceWakeEnable,
  voiceWakeDisable,
  voiceStartGlobalPtt,
  voiceStopGlobalPtt,
  voiceEnableBargeIn,
  voiceDownloadWhisperModel,
  voiceListWhisperModels,
  voiceDownloadPiperVoice,
  voiceListPiperVoices,
  voiceTranscribeBlob,
} from '@/api/voice';
import type { VoiceCapabilities, WhisperModelInfo, PiperVoiceInfo } from '@/api/voice';
import { getRoutingSlotModel } from '@agiworkforce/types';
import type { TerminalLifecycleStatus } from '@agiworkforce/types';
import { cleanupVoiceDictation, detectVoiceCommand } from '@agiworkforce/utils';
import { AUTO_DETECT_LANGUAGE, toProviderLanguage } from '@/lib/voiceLanguage';
import { DEFAULT_GLOBAL_VOICE_ACCELERATOR } from '@/lib/globalVoiceShortcut';

export type { VoiceCapabilities, WhisperModelInfo, PiperVoiceInfo };

interface VoiceModeState {
  error: string | null;
  capabilities: VoiceCapabilities | null;
  wakeWordActive: boolean;
  globalPttActive: boolean;
  bargeInEnabled: boolean;
  speakRepliesEnabled: boolean;
  fetchCapabilities: () => Promise<VoiceCapabilities | null>;
  enableWakeWord: () => Promise<void>;
  disableWakeWord: () => Promise<void>;
  startGlobalPtt: () => Promise<void>;
  stopGlobalPtt: () => Promise<void>;
  enableBargeIn: (enabled: boolean) => Promise<boolean>;
  setSpeakRepliesEnabled: (enabled: boolean) => void;
  downloadWhisperModel: (modelSize: string) => Promise<string | null>;
  listWhisperModels: () => Promise<WhisperModelInfo[]>;
  downloadPiperVoice: (voiceId: string) => Promise<string | null>;
  listPiperVoices: () => Promise<PiperVoiceInfo[]>;
}

export const useVoiceModeStore = create<VoiceModeState>()(
  devtools(
    persist(
      (set) => ({
        error: null,
        capabilities: null,
        wakeWordActive: false,
        globalPttActive: false,
        bargeInEnabled: false,
        speakRepliesEnabled: false,

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
        enableWakeWord: async () => {
          if (!voiceIsTauri) return;
          try {
            await voiceWakeEnable();
            set({ wakeWordActive: true, error: null });
          } catch (e) {
            set({ error: String(e) });
          }
        },
        disableWakeWord: async () => {
          if (!voiceIsTauri) return;
          try {
            await voiceWakeDisable();
            set({ wakeWordActive: false, error: null });
          } catch (e) {
            set({ error: String(e) });
          }
        },
        startGlobalPtt: async () => {
          if (!voiceIsTauri) return;
          try {
            await voiceStartGlobalPtt(DEFAULT_GLOBAL_VOICE_ACCELERATOR);
            set({ globalPttActive: true, error: null });
          } catch (e) {
            set({ error: String(e) });
          }
        },
        stopGlobalPtt: async () => {
          if (!voiceIsTauri) return;
          try {
            await voiceStopGlobalPtt();
            set({ globalPttActive: false, error: null });
          } catch (e) {
            set({ error: String(e) });
          }
        },
        enableBargeIn: async (enabled: boolean) => {
          if (!voiceIsTauri) return false;
          try {
            const result = await voiceEnableBargeIn(enabled);
            set({ bargeInEnabled: result, error: null });
            return result;
          } catch (e) {
            set({ error: String(e) });
            return false;
          }
        },
        setSpeakRepliesEnabled: (enabled: boolean) => {
          set({ speakRepliesEnabled: enabled });
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
      }),
      {
        name: 'agiworkforce-voice-mode',
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          wakeWordActive: state.wakeWordActive,
          bargeInEnabled: state.bargeInEnabled,
          speakRepliesEnabled: state.speakRepliesEnabled,
        }),
      },
    ),
    { name: 'VoiceModeStore', enabled: import.meta.env.DEV },
  ),
);

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

async function advanceDictationSession(sessionId: string | null, phase: string): Promise<void> {
  if (!sessionId) return;
  try {
    await invoke('dictation_session_advance', { sessionId, phase });
  } catch (e) {
    console.warn('dictation_session_advance failed:', e);
  }
}

type DictationOutcome = Exclude<TerminalLifecycleStatus, 'completed_partial'>;

async function endDictationSession(
  sessionId: string | null,
  outcome: DictationOutcome,
): Promise<void> {
  if (!sessionId) return;
  try {
    await invoke('dictation_session_end', { sessionId, outcome });
  } catch (e) {
    console.warn('dictation_session_end failed:', e);
  }
}

export type DictationProvider = 'local_whisper' | 'openai_whisper' | 'managed_cloud';

export function normalizeDictationProvider(value: unknown): DictationProvider {
  if (value === 'local_whisper' || value === 'openai_whisper' || value === 'managed_cloud') {
    return value;
  }
  return 'local_whisper';
}

export const DICTATION_CLEANUP_SKIPPED_NOTE =
  'AI cleanup was skipped because no local model is available. Your dictation was inserted as spoken.';

const NO_CANDIDATES_ERROR_CODE = '[ERR_NO_CANDIDATES]';

interface DictationCleanupRoute {
  provider: string;
  model: string;
  trust_mode: 'local' | 'managed';
  prefer_cloud_credits: boolean;
}

export function resolveDictationCleanupRoute(): DictationCleanupRoute | null {
  if (selectIsCloud(useAppModeStore.getState())) {
    return {
      provider: 'managed_cloud',
      model: getRoutingSlotModel('voice_rewrite'),
      trust_mode: 'managed',
      prefer_cloud_credits: true,
    };
  }
  const { selectedModel, selectedProvider } = useModelStore.getState();
  if (!selectedModel || !selectedProvider || !isLocalProvider(selectedProvider)) return null;
  return {
    provider: selectedProvider,
    model: selectedModel,
    trust_mode: 'local',
    prefer_cloud_credits: false,
  };
}

function keepRawDictation(raw: string, isCommand: boolean): VoiceTranscriptResult {
  toast.info(DICTATION_CLEANUP_SKIPPED_NOTE, { id: 'dictation-cleanup-skipped' });
  return { text: raw, isCommand };
}

const MAX_DICTATION_RECORDING_BYTES = 50 * 1024 * 1024;

export type VoiceInputHotkey = 'option' | 'ctrl+space' | 'ctrl+shift+v' | 'caps_lock';

interface VoiceInputState {
  voiceMode: VoiceInputMode;
  transcript: string;
  pendingTranscript: string;
  lastTranscriptIsCommand: boolean;
  voiceError: string | null;
  hotkey: VoiceInputHotkey;
  voiceProvider: DictationProvider;
  inputDeviceId: string | null;
  inputDeviceLabel: string | null;
  voiceLanguage: string;
  postProcessingMode: PostProcessingMode;
  _mediaStream: MediaStream | null;
  _recorder: MediaRecorder | null;
  _audioChunks: Blob[];
  _startAborted: boolean;
  _dictationSessionId: string | null;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  confirmTranscript: () => void;
  setHotkey: (hotkey: VoiceInputState['hotkey']) => void;
  setProvider: (provider: VoiceInputState['voiceProvider']) => void;
  setInputDevice: (deviceId: string | null, label: string | null) => void;
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
        inputDeviceId: null,
        inputDeviceLabel: null,
        voiceLanguage: AUTO_DETECT_LANGUAGE,
        postProcessingMode: 'ai',
        _mediaStream: null,
        _recorder: null,
        _audioChunks: [],
        _startAborted: false,
        _dictationSessionId: null,

        startListening: async () => {
          let dictationSessionId: string | null = null;
          try {
            dictationSessionId = await invoke<string>('dictation_session_begin', {
              source: 'in_app',
            });
          } catch (e) {
            const message = String(e);
            if (message.includes('already active')) {
              set({
                voiceMode: 'idle',
                voiceError: 'Another dictation session is already active.',
              });
              return;
            }
            console.warn('dictation_session_begin failed:', e);
          }

          set({
            voiceMode: 'listening',
            transcript: '',
            voiceError: null,
            lastTranscriptIsCommand: false,
            _startAborted: false,
            _dictationSessionId: dictationSessionId,
          });
          try {
            const { inputDeviceId } = get();
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: inputDeviceId ? { deviceId: { ideal: inputDeviceId } } : true,
            });
            if (get()._startAborted) {
              stream.getTracks().forEach((t) => t.stop());
              set({ voiceMode: 'idle', _startAborted: false, _dictationSessionId: null });
              await endDictationSession(dictationSessionId, 'cancelled');
              return;
            }
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
              ? 'audio/webm;codecs=opus'
              : MediaRecorder.isTypeSupported('audio/webm')
                ? 'audio/webm'
                : 'audio/mp4';
            const recorder = new MediaRecorder(stream, { mimeType });
            const chunks: Blob[] = [];
            let recordedBytes = 0;
            recorder.ondataavailable = (e) => {
              if (e.data.size === 0) return;
              chunks.push(e.data);
              recordedBytes += e.data.size;
              if (recordedBytes > MAX_DICTATION_RECORDING_BYTES && get()._recorder === recorder) {
                void get().stopListening();
              }
            };
            for (const track of stream.getAudioTracks()) {
              track.addEventListener('ended', () => {
                if (get()._recorder === recorder && get().voiceMode === 'listening') {
                  void get().stopListening();
                }
              });
            }
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
            set({ voiceMode: 'idle', voiceError: msg, _dictationSessionId: null });
            await endDictationSession(dictationSessionId, 'failed');
          }
        },

        stopListening: async () => {
          const { voiceMode, _recorder, _mediaStream, _dictationSessionId } = get();
          if (voiceMode !== 'listening') return;
          if (!_recorder) {
            set({ _startAborted: true, voiceMode: 'idle', _dictationSessionId: null });
            await endDictationSession(_dictationSessionId, 'cancelled');
            return;
          }
          set({ voiceMode: 'transcribing' });
          await advanceDictationSession(_dictationSessionId, 'transcribing');
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
                _dictationSessionId: null,
              });
              await endDictationSession(_dictationSessionId, 'cancelled');
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
              toProviderLanguage(voiceLanguage),
            );
            const rawText = result?.text?.trim() ?? '';
            if (!rawText) {
              set({
                voiceMode: 'idle',
                _recorder: null,
                _mediaStream: null,
                _audioChunks: [],
                _startAborted: false,
                _dictationSessionId: null,
              });
              await endDictationSession(_dictationSessionId, 'cancelled');
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
              _dictationSessionId: null,
            });
            await endDictationSession(_dictationSessionId, 'completed');
          } catch (e) {
            set({
              voiceMode: 'idle',
              voiceError: String(e),
              _recorder: null,
              _mediaStream: null,
              _audioChunks: [],
              _startAborted: false,
              _dictationSessionId: null,
            });
            await endDictationSession(_dictationSessionId, 'failed');
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
          const route = resolveDictationCleanupRoute();
          if (!route) return keepRawDictation(raw, isCommand);
          try {
            const systemContent = isCommand
              ? 'You are a voice command interpreter. Output ONLY the cleaned command instruction. No explanation.'
              : 'You are a voice transcription editor. Clean up dictation: remove fillers, fix run-ons, add punctuation. Output ONLY cleaned text.';
            const response = await invoke<VoiceLLMResponsePayload>('llm_send_message', {
              request: {
                messages: [
                  { role: 'system', content: systemContent },
                  { role: 'user', content: raw },
                ],
                model: route.model,
                provider: route.provider,
                max_tokens: 500,
                prefer_cloud_credits: route.prefer_cloud_credits,
                trust_mode: route.trust_mode,
              },
            });
            const cleaned = response?.content?.trim() ?? '';
            return { text: cleaned || cleanupVoiceDictation(raw), isCommand };
          } catch (error) {
            if (route.trust_mode === 'local' && String(error).includes(NO_CANDIDATES_ERROR_CODE)) {
              return keepRawDictation(raw, isCommand);
            }
            return { text: cleanupVoiceDictation(raw), isCommand };
          }
        },

        setHotkey: (hotkey) => set({ hotkey }),
        setProvider: (provider) => set({ voiceProvider: provider }),
        setInputDevice: (deviceId, label) =>
          set({ inputDeviceId: deviceId, inputDeviceLabel: label }),
        setLanguage: (language) => set({ voiceLanguage: language }),
        setPostProcessingMode: (mode) => set({ postProcessingMode: mode }),
        clearTranscript: () =>
          set({ transcript: '', pendingTranscript: '', lastTranscriptIsCommand: false }),
      }),
      {
        name: 'agiworkforce-voice-input',
        version: 2,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          hotkey: state.hotkey,
          voiceProvider: state.voiceProvider,
          inputDeviceId: state.inputDeviceId,
          inputDeviceLabel: state.inputDeviceLabel,
          voiceLanguage: state.voiceLanguage,
          postProcessingMode: state.postProcessingMode,
        }),
        migrate: (persisted) => {
          const state = (persisted ?? {}) as Partial<VoiceInputState>;
          return {
            ...state,
            voiceProvider: normalizeDictationProvider(state.voiceProvider),
          };
        },
      },
    ),
    { name: 'voice-input-store' },
  ),
);

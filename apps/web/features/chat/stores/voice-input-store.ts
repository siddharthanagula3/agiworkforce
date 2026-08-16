
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getRoutingSlotModel } from '@agiworkforce/types';

const CLOUD_TRANSCRIPTION_MODEL = getRoutingSlotModel('voice_transcription');

export type VoiceInputMode = 'idle' | 'listening' | 'transcribing' | 'error';

export interface VoiceInputState {
  mode: VoiceInputMode;
  transcript: string;
  error: string | null;
  language: string;
  preferServerTranscription: boolean;
}

interface VoiceInputActions {
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  clearTranscript: () => void;
  setLanguage: (lang: string) => void;
  setPreferServerTranscription: (prefer: boolean) => void;
  clearError: () => void;
}

interface RuntimeRefs {
  mediaStream: MediaStream | null;
  mediaRecorder: MediaRecorder | null;
  audioChunks: Blob[];
  recognition: SpeechRecognitionLike | null;
  stopResolve: (() => void) | null;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const rt: RuntimeRefs = {
  mediaStream: null,
  mediaRecorder: null,
  audioChunks: [],
  recognition: null,
  stopResolve: null,
};

/**
 * Reset all module-level runtime refs to their initial state.
 * Exported for test isolation only · do not call in production code.
 *
 * @internal
 */
export function _resetRuntimeRefs(): void {
  rt.mediaStream = null;
  rt.mediaRecorder = null;
  rt.audioChunks = [];
  rt.recognition = null;
  rt.stopResolve = null;
}

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, SpeechRecognitionConstructor | undefined>;
  return w['SpeechRecognition'] ?? w['webkitSpeechRecognition'] ?? null;
}

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

function getBestMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const mime of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

async function transcribeViaServer(blob: Blob, language: string): Promise<string> {
  const form = new FormData();
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
  form.append('file', blob, `recording.${ext}`);
  form.append('model', CLOUD_TRANSCRIPTION_MODEL);
  if (language) form.append('language', language);

  const response = await fetch('/api/voice/transcribe', {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Server transcription failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as { text?: string };
  return data?.text?.trim() ?? '';
}

export const useVoiceInputStore = create<VoiceInputState & VoiceInputActions>()(
  persist(
    (set, get) => ({
      mode: 'idle',
      transcript: '',
      error: null,
      language: typeof navigator !== 'undefined' ? (navigator.language ?? 'en-US') : 'en-US',
      preferServerTranscription: false,

      startListening: async () => {
        if (get().mode !== 'idle') return;

        set({ mode: 'listening', error: null, transcript: '' });

        const { language, preferServerTranscription } = get();
        const SpeechRecognitionCtor = getSpeechRecognitionCtor();

        if (SpeechRecognitionCtor && !preferServerTranscription) {
          try {
            const recognition = new SpeechRecognitionCtor();
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.lang = language;

            rt.recognition = recognition;

            recognition.onresult = (event: SpeechRecognitionEvent) => {
              const transcript = event.results[event.resultIndex]?.[0]?.transcript?.trim() ?? '';
              if (transcript) {
                set({ transcript });
              }
            };

            recognition.onerror = (event) => {
              const err = (event as unknown as { error?: string }).error ?? 'unknown';
              if (err !== 'aborted') {
                set({ error: buildErrorMessage(err), mode: 'idle' });
              }
              rt.recognition = null;
            };

            recognition.onend = () => {
              if (get().mode === 'listening') {
                set({ mode: 'idle' });
              }
              rt.recognition = null;
            };

            recognition.start();
          } catch (err) {
            set({
              mode: 'error',
              error: `Could not start voice recognition: ${String(err)}`,
            });
          }
          return;
        }

        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });

          rt.mediaStream = stream;
          rt.audioChunks = [];

          const mimeType = getBestMimeType();
          const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
          rt.mediaRecorder = recorder;

          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) rt.audioChunks.push(e.data);
          };

          recorder.onstop = () => {
            rt.stopResolve?.();
            rt.stopResolve = null;
          };

          recorder.start(100);
        } catch (err) {
          rt.mediaStream?.getTracks()?.forEach((t) => t.stop());
          rt.mediaStream = null;
          rt.mediaRecorder = null;
          set({ mode: 'error', error: buildMediaError(err) });
        }
      },

      stopListening: async () => {
        const { mode, language } = get();
        if (mode !== 'listening') return;

        if (rt.recognition) {
          set({ mode: 'transcribing' });
          rt.recognition.stop();
          set({ mode: 'idle' });
          rt.recognition = null;
          return;
        }

        if (!rt.mediaRecorder) {
          set({ mode: 'idle' });
          return;
        }

        set({ mode: 'transcribing' });

        await new Promise<void>((resolve) => {
          rt.stopResolve = resolve;
          rt.mediaRecorder!.stop();
        });

        rt.mediaStream?.getTracks().forEach((t) => t.stop());
        rt.mediaStream = null;
        rt.mediaRecorder = null;

        const chunks = rt.audioChunks.slice();
        rt.audioChunks = [];

        if (chunks.length === 0) {
          set({ mode: 'idle' });
          return;
        }

        const mimeType = chunks[0]?.type ?? 'audio/webm';
        const blob = new Blob(chunks, { type: mimeType });

        try {
          const text = await transcribeViaServer(blob, language);
          set({ transcript: text, mode: 'idle' });
        } catch (err) {
          set({ mode: 'error', error: `Transcription failed: ${String(err)}` });
        }
      },

      clearTranscript: () => set({ transcript: '' }),
      setLanguage: (lang) => set({ language: lang }),
      setPreferServerTranscription: (prefer) => set({ preferServerTranscription: prefer }),
      clearError: () => set({ error: null, mode: 'idle' }),
    }),
    {
      name: 'agi-web-voice-input',
      version: 1,
      partialize: (state) => ({
        language: state.language,
        preferServerTranscription: state.preferServerTranscription,
      }),
    },
  ),
);

function buildErrorMessage(errorCode: string): string {
  switch (errorCode) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone permission denied. Please allow access in your browser settings.';
    case 'no-speech':
      return 'No speech detected. Please try again.';
    case 'audio-capture':
      return 'No microphone found. Please check your audio settings.';
    case 'network':
      return 'Network error during voice recognition. Please check your connection.';
    case 'language-not-supported':
      return 'Selected language is not supported by your browser.';
    default:
      return `Voice recognition error: ${errorCode}`;
  }
}

function buildMediaError(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      return 'Microphone permission denied. Please allow access in your browser settings.';
    }
    if (err.name === 'NotFoundError') {
      return 'No microphone found. Please connect a microphone and try again.';
    }
    return `Microphone error: ${err.message}`;
  }
  return `Unexpected error: ${String(err)}`;
}

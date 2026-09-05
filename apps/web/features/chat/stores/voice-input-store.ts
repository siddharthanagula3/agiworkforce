import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getRoutingSlotModel } from '@agiworkforce/types';
import { getCsrfToken } from '@/lib/client/csrf';

const CLOUD_TRANSCRIPTION_MODEL = getRoutingSlotModel('voice_transcription');

const STORE_NAME = 'agi-web-voice-input';
const STORE_VERSION = 1;
const DEFAULT_LANGUAGE = 'en-US';
const TRANSCRIBE_ENDPOINT = '/api/voice/transcribe';
const CSRF_HEADER = 'x-csrf-token';
const RECORDER_TIMESLICE_MS = 100;

export type VoiceInputMode = 'idle' | 'listening' | 'transcribing' | 'error';

export interface VoiceInputState {
  mode: VoiceInputMode;
  transcript: string;
  error: string | null;
  language: string;
  captureStream: MediaStream | null;
}

interface VoiceInputActions {
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  cancelListening: () => void;
  clearTranscript: () => void;
  setLanguage: (lang: string) => void;
  clearError: () => void;
}

interface RuntimeRefs {
  mediaStream: MediaStream | null;
  mediaRecorder: MediaRecorder | null;
  audioChunks: Blob[];
  stopResolve: (() => void) | null;
}

const rt: RuntimeRefs = {
  mediaStream: null,
  mediaRecorder: null,
  audioChunks: [],
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
  rt.stopResolve = null;
}

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

const MP4_CONTAINER = 'mp4';
const DEFAULT_RECORDING_MIME = 'audio/webm';
const DEFAULT_RECORDING_EXTENSION = 'webm';

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_PAYMENT_REQUIRED = 402;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR = 500;

class TranscriptionError extends Error {
  constructor(readonly status: number) {
    super(`transcription_failed_${status}`);
    this.name = 'TranscriptionError';
  }
}

function transcriptionErrorMessage(error: unknown): string {
  if (error instanceof TranscriptionError) {
    if (error.status === HTTP_UNAUTHORIZED || error.status === HTTP_FORBIDDEN) {
      return 'Sign in again to use voice input. Your recording was not saved.';
    }
    if (error.status === HTTP_PAYMENT_REQUIRED) {
      return 'Voice input needs an active plan. Nothing was charged for this recording.';
    }
    if (error.status === HTTP_PAYLOAD_TOO_LARGE) {
      return 'That recording was too long to transcribe. Try a shorter one.';
    }
    if (error.status === HTTP_TOO_MANY_REQUESTS) {
      return 'Too many recordings just now. Wait a moment, then try again.';
    }
    if (error.status >= HTTP_SERVER_ERROR) {
      return 'Transcription is unavailable right now. Your recording was not saved. Try again shortly.';
    }
    return 'That recording could not be transcribed. Try again, or type instead.';
  }
  return 'Could not reach transcription. Check your connection and try again.';
}

function getBestMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const mime of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

function releaseCapture(): void {
  if (rt.mediaRecorder && rt.mediaRecorder.state !== 'inactive') {
    rt.mediaRecorder.stop();
  }
  rt.mediaRecorder = null;
  rt.mediaStream?.getTracks().forEach((track) => track.stop());
  rt.mediaStream = null;
  rt.audioChunks = [];
  rt.stopResolve?.();
  rt.stopResolve = null;
}

async function transcribeViaServer(blob: Blob, language: string): Promise<string> {
  const form = new FormData();
  const ext = blob.type.includes(MP4_CONTAINER) ? MP4_CONTAINER : DEFAULT_RECORDING_EXTENSION;
  form.append('file', blob, `recording.${ext}`);
  form.append('model', CLOUD_TRANSCRIPTION_MODEL);
  if (language) form.append('language', language);

  const response = await fetch(TRANSCRIBE_ENDPOINT, {
    method: 'POST',
    headers: { [CSRF_HEADER]: await getCsrfToken() },
    body: form,
  });

  if (!response.ok) {
    throw new TranscriptionError(response.status);
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
      language:
        typeof navigator !== 'undefined'
          ? (navigator.language ?? DEFAULT_LANGUAGE)
          : DEFAULT_LANGUAGE,
      captureStream: null,

      startListening: async () => {
        if (get().mode !== 'idle') return;

        set({ mode: 'listening', error: null, transcript: '' });

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

          recorder.start(RECORDER_TIMESLICE_MS);
          set({ captureStream: stream });
        } catch (err) {
          rt.mediaStream?.getTracks()?.forEach((t) => t.stop());
          rt.mediaStream = null;
          rt.mediaRecorder = null;
          set({ mode: 'error', error: buildMediaError(err), captureStream: null });
        }
      },

      stopListening: async () => {
        const { mode, language } = get();
        if (mode !== 'listening') return;

        if (!rt.mediaRecorder) {
          set({ mode: 'idle', captureStream: null });
          return;
        }

        set({ mode: 'transcribing', captureStream: null });

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

        const mimeType = chunks[0]?.type ?? DEFAULT_RECORDING_MIME;
        const blob = new Blob(chunks, { type: mimeType });

        try {
          const text = await transcribeViaServer(blob, language);
          set({ transcript: text, mode: 'idle' });
        } catch (err) {
          set({ mode: 'error', error: transcriptionErrorMessage(err) });
        }
      },

      cancelListening: () => {
        if (get().mode === 'idle') return;
        releaseCapture();
        set({ mode: 'idle', transcript: '', error: null, captureStream: null });
      },

      clearTranscript: () => set({ transcript: '' }),
      setLanguage: (lang) => set({ language: lang }),
      clearError: () => set({ error: null, mode: 'idle' }),
    }),
    {
      name: STORE_NAME,
      version: STORE_VERSION,
      partialize: (state) => ({
        language: state.language,
      }),
    },
  ),
);

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

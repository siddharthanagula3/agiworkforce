/**
 * Voice Mode Store
 *
 * Manages the full voice interaction loop:
 *   idle -> listening -> processing -> speaking -> idle
 *
 * Orchestrates recording (via MediaRecorder), transcription (via Rust backend),
 * LLM response generation, and TTS playback to create a hands-free
 * conversational experience similar to ChatGPT voice mode.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { invoke } from '../lib/tauri-mock';

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

  // -- Internal runtime refs (not persisted) --
  _mediaStream: MediaStream | null;
  _recorder: MediaRecorder | null;
  _audioChunks: Blob[];
  _analyser: AnalyserNode | null;
  _audioContext: AudioContext | null;
  _animFrameId: number | null;
  _isSpeaking: boolean;

  // -- Actions --
  open: () => void;
  close: () => void;
  startListening: () => Promise<void>;
  stopListeningAndProcess: (onSend?: (text: string) => void) => Promise<void>;
  stopSpeaking: () => void;
  reset: () => void;
}

/** Generate a simple unique ID */
function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useVoiceModeStore = create<VoiceModeState>()(
  devtools(
    (set, get) => ({
      isOpen: false,
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

      open: () => {
        set({ isOpen: true, phase: 'idle', error: null, userTranscript: '', aiResponse: '' });
      },

      close: () => {
        const { _mediaStream, _recorder, _audioContext, _animFrameId } = get();

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
          const audioContext = new AudioContext();
          const source = audioContext.createMediaStreamSource(stream);
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.8;
          source.connect(analyser);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);

          const updateLevel = () => {
            if (get().phase !== 'listening') return;
            analyser.getByteFrequencyData(dataArray);
            // Compute RMS volume
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              const val = dataArray[i] ?? 0;
              sum += val * val;
            }
            const rms = Math.sqrt(sum / dataArray.length) / 255;
            set({ audioLevel: Math.min(1, rms * 2.5) });
            const frameId = requestAnimationFrame(updateLevel);
            set({ _animFrameId: frameId });
          };

          const frameId = requestAnimationFrame(updateLevel);

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
          const transcriptionResult = await invoke<{
            text: string;
            language?: string;
            duration?: number;
            confidence?: number;
          }>('voice_transcribe_blob', {
            audioData,
            format,
            provider: 'local_whisper',
            language: 'en',
          });

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

          // Step 3: Speak the response via TTS
          set({ phase: 'speaking', _isSpeaking: true });

          try {
            await invoke('voice_tts_speak', { text: aiText });
          } catch {
            // TTS failed -- still show the response, just don't speak
          }

          // After speaking completes, return to idle
          if (get().phase === 'speaking') {
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

      stopSpeaking: () => {
        set({
          phase: 'idle',
          _isSpeaking: false,
        });
      },

      reset: () => {
        const { _mediaStream, _recorder, _audioContext, _animFrameId } = get();
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
    }),
    { name: 'voice-mode-store' },
  ),
);

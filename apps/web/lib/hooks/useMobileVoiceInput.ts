'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseMobileVoiceInputOptions {
  onTranscript: (text: string) => void;
  desktopAudioWsUrl?: string;
}

interface UseMobileVoiceInputReturn {
  isSupported: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
}

export function useMobileVoiceInput({
  onTranscript,
  desktopAudioWsUrl,
}: UseMobileVoiceInputOptions): UseMobileVoiceInputReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const isSupported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined';

  const closeSocket = useCallback(() => {
    const socket = wsRef.current;
    wsRef.current = null;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
  }, []);

  const connectSocket = useCallback(() => {
    if (!desktopAudioWsUrl) {
      return;
    }

    try {
      const socket = new WebSocket(desktopAudioWsUrl);
      socket.onclose = () => {
        if (wsRef.current === socket) {
          wsRef.current = null;
        }
      };
      wsRef.current = socket;
    } catch {
      wsRef.current = null;
    }
  }, [desktopAudioWsUrl]);

  const transcribeAudio = useCallback(
    async (audioBlob: Blob) => {
      setIsTranscribing(true);
      setError(null);

      try {
        const formData = new FormData();
        formData.append('file', new File([audioBlob], 'voice.webm', { type: audioBlob.type }));

        const response = await fetch('/api/llm/v1/audio/transcriptions', {
          method: 'POST',
          body: formData,
        });

        const payload = (await response.json().catch(() => null)) as
          | { text?: string; error?: { message?: string } }
          | null;

        if (!response.ok) {
          throw new Error(payload?.error?.message || 'Transcription failed');
        }

        const text = payload?.text?.trim();
        if (text) {
          onTranscript(text);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Voice transcription failed');
      } finally {
        setIsTranscribing(false);
      }
    },
    [onTranscript],
  );

  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (!isSupported || isRecording) {
      return;
    }

    setError(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      connectSocket();

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });

      recorder.ondataavailable = (event) => {
        if (!event.data || event.data.size === 0) {
          return;
        }

        chunksRef.current.push(event.data);

        const socket = wsRef.current;
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(event.data);
        }
      };

      recorderRef.current = recorder;
      recorder.start(300);
      setIsRecording(true);
    } catch (err) {
      stopTracks();
      setError(err instanceof Error ? err.message : 'Microphone permission denied');
    }
  }, [connectSocket, isRecording, isSupported, stopTracks]);

  const stopRecording = useCallback(async () => {
    if (!isRecording) {
      return;
    }

    const recorder = recorderRef.current;
    recorderRef.current = null;

    if (recorder && recorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });
    }

    setIsRecording(false);
    stopTracks();
    closeSocket();

    const allChunks = chunksRef.current;
    chunksRef.current = [];

    if (allChunks.length > 0) {
      const blob = new Blob(allChunks, { type: 'audio/webm' });
      await transcribeAudio(blob);
    }
  }, [closeSocket, isRecording, stopTracks, transcribeAudio]);

  useEffect(() => {
    return () => {
      try {
        recorderRef.current?.stop();
      } catch {
        // ignore recorder shutdown issues
      }
      stopTracks();
      closeSocket();
    };
  }, [closeSocket, stopTracks]);

  return {
    isSupported,
    isRecording,
    isTranscribing,
    error,
    startRecording,
    stopRecording,
  };
}

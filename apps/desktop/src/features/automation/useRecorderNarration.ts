import { useCallback, useEffect, useRef, useState } from 'react';
import { automation, voice } from '@agiworkforce/desktop-command-client';

export type RecorderNarrationPhase = 'off' | 'listening' | 'transcribing';

interface StopNarrationOptions {
  discard?: boolean;
}

function microphoneErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Microphone access was denied. Allow it in System Settings to narrate this recording.';
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return 'No microphone was found.';
  }
  return error instanceof Error ? error.message : 'Could not start microphone narration.';
}

export function useRecorderNarration() {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<RecorderNarrationPhase>('off');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const frameRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const releaseHardware = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext) void audioContext.close().catch(() => undefined);
    setLevel(0);
  }, []);

  useEffect(() => {
    let mounted = true;
    void voice
      .voiceCheckLocalWhisper()
      .then((available) => {
        if (mounted) setIsAvailable(available);
      })
      .catch(() => {
        if (mounted) setIsAvailable(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const stopNarration = useCallback(
    async ({ discard = false }: StopNarrationOptions = {}) => {
      const recorder = recorderRef.current;
      if (!recorder) {
        releaseHardware();
        setPhase('off');
        return;
      }

      recorderRef.current = null;
      if (!discard) setPhase('transcribing');
      await new Promise<void>((resolve) => {
        if (recorder.state === 'inactive') {
          resolve();
          return;
        }
        recorder.onstop = () => resolve();
        recorder.stop();
      });
      releaseHardware();

      const chunks = chunksRef.current;
      chunksRef.current = [];
      if (discard) {
        setPhase('off');
        setError(null);
        return;
      }

      try {
        const blob = new Blob(chunks, { type: chunks[0]?.type ?? 'audio/webm' });
        if (blob.size === 0) {
          setPhase('off');
          return;
        }
        const audioData = Array.from(new Uint8Array(await blob.arrayBuffer()));
        const format = blob.type.includes('mp4') ? 'mp4' : 'webm';
        const transcription = await voice.voiceTranscribeBlob(
          audioData,
          format,
          'local_whisper',
          'en',
        );
        const text = transcription.text.trim();
        if (text) await automation.automationRecordActionNarration(text);
        setError(null);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? `Narration was not added: ${cause.message}`
            : 'Narration could not be transcribed locally.',
        );
      } finally {
        setPhase('off');
      }
    },
    [releaseHardware],
  );

  const startNarration = useCallback(async () => {
    if (phase !== 'off') return;
    setError(null);
    if (!isAvailable) {
      setError('Download the local Whisper model in Voice settings to enable narration.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Microphone recording is not supported on this device.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16_000 },
      });
      streamRef.current = stream;
      chunksRef.current = [];

      try {
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);
        audioContextRef.current = audioContext;
        const levels = new Uint8Array(analyser.frequencyBinCount);
        const updateLevel = () => {
          analyser.getByteFrequencyData(levels);
          let energy = 0;
          for (const sample of levels) energy += sample * sample;
          setLevel(Math.min(1, (Math.sqrt(energy / levels.length) / 255) * 2.5));
          frameRef.current = requestAnimationFrame(updateLevel);
        };
        frameRef.current = requestAnimationFrame(updateLevel);
      } catch {
        // Narration remains useful when an OS webview cannot expose an analyser.
      }

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorderRef.current = recorder;
      recorder.start(100);
      setPhase('listening');
    } catch (cause) {
      releaseHardware();
      setPhase('off');
      setError(microphoneErrorMessage(cause));
    }
  }, [isAvailable, phase, releaseHardware]);

  useEffect(
    () => () => {
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      releaseHardware();
    },
    [releaseHardware],
  );

  return {
    error,
    isAvailable,
    level,
    phase,
    startNarration,
    stopNarration,
  };
}

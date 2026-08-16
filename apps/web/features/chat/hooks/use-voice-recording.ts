/**
 * useVoiceRecording - Hook for voice recording functionality
 *
 * Features:
 * - MediaRecorder API for audio capture
 * - Web Audio API for real-time visualization data
 * - Support for start/stop/pause/resume recording
 * - Returns audio blob when recording is complete
 * - Handles microphone permission requests
 * - Provides real-time audio levels for visualization
 *
 * @example
 * const {
 *   isRecording,
 *   isPaused,
 *   audioBlob,
 *   duration,
 *   audioLevels,
 *   startRecording,
 *   stopRecording,
 *   pauseRecording,
 *   resumeRecording,
 *   clearRecording,
 *   permissionStatus,
 *   error,
 * } = useVoiceRecording();
 */

import { useState, useRef, useCallback, useEffect } from 'react';

export type PermissionStatus = 'prompt' | 'granted' | 'denied' | 'unknown';

export interface VoiceRecordingState {
  isRecording: boolean;
  isPaused: boolean;
  audioBlob: Blob | null;
  audioUrl: string | null;
  duration: number;
  audioLevels: number[];
  permissionStatus: PermissionStatus;
  error: string | null;
  isSupported: boolean;
}

export interface VoiceRecordingActions {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  clearRecording: () => void;
  requestPermission: () => Promise<boolean>;
}

export type UseVoiceRecordingReturn = VoiceRecordingState & VoiceRecordingActions;

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 44100,
};

const MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

function getSupportedMimeType(): string {
  for (const mimeType of MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }
  return '';
}

function checkBrowserSupport(): boolean {
  return !!(
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    window.MediaRecorder &&
    window.AudioContext
  );
}

export function useVoiceRecording(): UseVoiceRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [audioLevels, setAudioLevels] = useState<number[]>([]);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('unknown');
  const [error, setError] = useState<string | null>(null);
  const [isSupported] = useState(() => checkBrowserSupport());

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedDurationRef = useRef<number>(0);
  const updateAudioLevelsRef = useRef<(() => void) | null>(null);

  const cleanup = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    mediaRecorderRef.current = null;
    analyserRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [cleanup, audioUrl]);

  useEffect(() => {
    let permissionResult: globalThis.PermissionStatus | null = null;
    let isMounted = true;

    const handlePermissionChange = () => {
      if (isMounted && permissionResult) {
        setPermissionStatus(permissionResult.state as PermissionStatus);
      }
    };

    const checkPermission = async () => {
      if (!isSupported) {
        queueMicrotask(() => {
          if (isMounted) {
            setPermissionStatus('denied');
          }
        });
        return;
      }

      try {
        const result = await navigator.permissions.query({
          name: 'microphone' as PermissionName,
        });

        if (!isMounted) return;

        permissionResult = result;
        setPermissionStatus(result.state as PermissionStatus);

        result.addEventListener('change', handlePermissionChange);
      } catch {
        if (isMounted) {
          setPermissionStatus('unknown');
        }
      }
    };

    checkPermission();

    return () => {
      isMounted = false;
      if (permissionResult) {
        permissionResult.removeEventListener('change', handlePermissionChange);
      }
    };
  }, [isSupported]);

  const updateAudioLevels = useCallback(() => {
    if (!analyserRef.current || !isRecording || isPaused) {
      return;
    }

    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    const barCount = 32;
    const barsPerSegment = Math.floor(dataArray.length / barCount);
    const levels: number[] = [];

    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      for (let j = 0; j < barsPerSegment; j++) {
        sum += dataArray[i * barsPerSegment + j]!;
      }
      levels.push(sum / barsPerSegment / 255);
    }

    setAudioLevels(levels);

    if (updateAudioLevelsRef.current) {
      animationFrameRef.current = requestAnimationFrame(updateAudioLevelsRef.current);
    }
  }, [isRecording, isPaused]);

  useEffect(() => {
    updateAudioLevelsRef.current = updateAudioLevels;
  }, [updateAudioLevels]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setError('Audio recording is not supported in this browser');
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: AUDIO_CONSTRAINTS,
      });
      stream.getTracks().forEach((track) => track.stop());
      setPermissionStatus('granted');
      setError(null);
      return true;
    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setPermissionStatus('denied');
          setError(
            'Microphone permission was denied. Please allow access in your browser settings.',
          );
        } else if (err.name === 'NotFoundError') {
          setError('No microphone found. Please connect a microphone and try again.');
        } else {
          setError(`Failed to access microphone: ${err.message}`);
        }
      } else {
        setError('An unexpected error occurred while requesting microphone access');
      }
      return false;
    }
  }, [isSupported]);

  const startRecording = useCallback(async (): Promise<void> => {
    if (!isSupported) {
      setError('Audio recording is not supported in this browser');
      return;
    }

    if (isRecording) {
      return;
    }

    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: AUDIO_CONSTRAINTS,
      });
      streamRef.current = stream;
      setPermissionStatus('granted');

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const mimeType = getSupportedMimeType();
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType || undefined,
      });
      mediaRecorderRef.current = mediaRecorder;

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mimeType || 'audio/webm',
        });
        setAudioBlob(blob);

        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

        cleanup();
        setIsRecording(false);
        setIsPaused(false);
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        setError('An error occurred during recording');
        cleanup();
        setIsRecording(false);
        setIsPaused(false);
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setIsPaused(false);
      startTimeRef.current = Date.now();
      pausedDurationRef.current = 0;

      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      setAudioBlob(null);
      setAudioUrl(null);

      durationIntervalRef.current = setInterval(() => {
        if (!isPaused) {
          const elapsed = (Date.now() - startTimeRef.current - pausedDurationRef.current) / 1000;
          setDuration(Math.floor(elapsed));
        }
      }, 100);

      animationFrameRef.current = requestAnimationFrame(updateAudioLevels);
    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setPermissionStatus('denied');
          setError(
            'Microphone permission was denied. Please allow access in your browser settings.',
          );
        } else if (err.name === 'NotFoundError') {
          setError('No microphone found. Please connect a microphone and try again.');
        } else {
          setError(`Failed to start recording: ${err.message}`);
        }
      } else {
        setError('An unexpected error occurred while starting recording');
      }
      cleanup();
    }
  }, [isSupported, isRecording, isPaused, audioUrl, cleanup, updateAudioLevels]);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || !isRecording) {
        resolve(audioBlob);
        return;
      }

      const mediaRecorder = mediaRecorderRef.current;

      const originalOnStop = mediaRecorder.onstop;
      mediaRecorder.onstop = (event) => {
        if (originalOnStop) {
          originalOnStop.call(mediaRecorder, event);
        }

        setTimeout(() => {
          const mimeType = getSupportedMimeType();
          const blob = new Blob(chunksRef.current, {
            type: mimeType || 'audio/webm',
          });
          resolve(blob);
        }, 50);
      };

      mediaRecorder.stop();
    });
  }, [isRecording, audioBlob]);

  const pauseRecording = useCallback(() => {
    if (!mediaRecorderRef.current || !isRecording || isPaused) {
      return;
    }

    if (mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);

      pausedDurationRef.current = Date.now() - startTimeRef.current - duration * 1000;

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }
  }, [isRecording, isPaused, duration]);

  const resumeRecording = useCallback(() => {
    if (!mediaRecorderRef.current || !isRecording || !isPaused) {
      return;
    }

    if (mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);

      animationFrameRef.current = requestAnimationFrame(updateAudioLevels);
    }
  }, [isRecording, isPaused, updateAudioLevels]);

  const clearRecording = useCallback(() => {
    if (isRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }

    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
    setAudioLevels([]);
    setError(null);
    setIsRecording(false);
    setIsPaused(false);

    cleanup();
  }, [isRecording, audioUrl, cleanup]);

  return {
    isRecording,
    isPaused,
    audioBlob,
    audioUrl,
    duration,
    audioLevels,
    permissionStatus,
    error,
    isSupported,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    clearRecording,
    requestPermission,
  };
}

export default useVoiceRecording;

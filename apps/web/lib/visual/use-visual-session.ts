'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  idleVisualSessionStatus,
  VisualCaptureSession,
  visualSessionIsCapturing,
  visualSourceError,
  type VisualCaptureOptions,
  type VisualFrame,
  type VisualSessionStatus,
  type VisualSourceKind,
} from '@agiworkforce/types';

export interface UseVisualSessionOptions {
  source: VisualSourceKind;
  /**
   * The live voice call this stream rides with. A visual source must not
   * outlive the call it was attached to, so the session stops the moment the
   * call does.
   */
  voiceActive?: boolean;
  onFrame?: (frame: VisualFrame) => void;
  capture?: Pick<VisualCaptureOptions, 'config' | 'createGrabber' | 'requestStream' | 'facingMode'>;
}

export interface VisualSessionController {
  status: VisualSessionStatus;
  capturing: boolean;
  frames: readonly VisualFrame[];
  latestFrame: VisualFrame | null;
  mediaStream: MediaStream | null;
  start: () => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
}

export function useVisualSession(options: UseVisualSessionOptions): VisualSessionController {
  const { source, voiceActive, onFrame, capture } = options;
  const sessionRef = useRef<VisualCaptureSession | null>(null);
  const onFrameRef = useRef(onFrame);
  const captureRef = useRef(capture);
  const [status, setStatus] = useState<VisualSessionStatus>(() => idleVisualSessionStatus(source));
  const [frames, setFrames] = useState<readonly VisualFrame[]>([]);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  onFrameRef.current = onFrame;
  captureRef.current = capture;

  const stop = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    session?.stop();
    setFrames([]);
    setMediaStream(null);
    if (session) setStatus(session.status);
  }, []);

  const start = useCallback(async () => {
    if (sessionRef.current) return;
    setStatus({ ...idleVisualSessionStatus(source), state: 'starting' });
    try {
      const session = await VisualCaptureSession.start({
        ...captureRef.current,
        source,
        onStatus: setStatus,
        onFrame: (frame, buffer) => {
          setFrames(buffer);
          onFrameRef.current?.(frame);
        },
      });
      sessionRef.current = session;
      setMediaStream(session.mediaStream);
      setStatus(session.status);
    } catch (error) {
      const failure = visualSourceError(error);
      setStatus({
        ...idleVisualSessionStatus(source),
        state: failure.state,
        error: failure.message,
      });
    }
  }, [source]);

  const pause = useCallback(() => sessionRef.current?.pause(), []);
  const resume = useCallback(() => sessionRef.current?.resume(), []);

  useEffect(() => {
    if (voiceActive === false) stop();
  }, [voiceActive, stop]);

  useEffect(() => stop, [stop]);

  return {
    status,
    capturing: visualSessionIsCapturing(status),
    frames,
    latestFrame: frames.at(-1) ?? null,
    mediaStream,
    start,
    stop,
    pause,
    resume,
  };
}

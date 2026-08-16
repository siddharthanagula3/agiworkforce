'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';

import { cn } from '@shared/lib/utils';

interface CameraCaptureDialogProps {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

type CameraState = 'starting' | 'ready' | 'denied' | 'unavailable';

export function CameraCaptureDialog({ open, onClose, onCapture }: CameraCaptureDialogProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>('starting');

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setState('starting');

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setState('unavailable');
      return;
    }

    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('denied');
      });

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, stopStream]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video || state !== 'ready') return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) return;
      onCapture(new File([blob], `photo-${Date.now()}.png`, { type: 'image/png' }));
      stopStream();
      onClose();
    }, 'image/png');
  }, [state, onCapture, onClose, stopStream]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Take a photo"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium text-foreground">Take a photo</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative flex aspect-video items-center justify-center bg-muted/40">
          {/* Mirrored so it reads like a mirror, which is what users expect of a
              front camera. The CAPTURED frame is deliberately not mirrored —
              flipping the saved image would produce reversed text. */}
          <video
            ref={videoRef}
            playsInline
            muted
            className={cn('h-full w-full object-cover', state !== 'ready' && 'invisible')}
            style={{ transform: 'scaleX(-1)' }}
          />
          {state !== 'ready' && (
            <p className="absolute px-6 text-center text-sm text-muted-foreground">
              {state === 'starting' && 'Waiting for camera access…'}
              {state === 'denied' &&
                'Camera access was blocked. Allow it in your browser settings to take a photo.'}
              {state === 'unavailable' && 'This browser does not provide camera access.'}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-border px-3 text-sm text-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCapture}
            disabled={state !== 'ready'}
            className={cn(
              'flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors',
              'bg-primary text-primary-foreground hover:opacity-90',
              state !== 'ready' && 'cursor-not-allowed opacity-50',
            )}
          >
            <Camera className="h-4 w-4" aria-hidden="true" />
            Capture
          </button>
        </div>
      </div>
    </div>
  );
}

export default CameraCaptureDialog;

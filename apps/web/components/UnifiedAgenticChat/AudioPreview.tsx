import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, X, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AudioPreviewProps {
  /** Audio source URL or base64 data */
  src: string;
  /** File name to display */
  name?: string;
  /** Duration in seconds (if known) */
  duration?: number;
  /** Callback when remove button is clicked */
  onRemove?: () => void;
  /** Optional className */
  className?: string;
  /** Whether the preview is compact */
  compact?: boolean;
}

export const AudioPreview: React.FC<AudioPreviewProps> = ({
  src,
  name = 'Audio recording',
  duration: initialDuration,
  onRemove,
  className,
  compact = false,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  // Stored as a ref because AudioContext is not rendered — avoids stale-closure lint warnings.
  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize audio context and analyser for waveform visualization
  useEffect(() => {
    if (!audioRef.current) return;

    const audio = audioRef.current;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [src]);

  // Set up audio analyser for visualization
  const setupAudioAnalyser = useCallback(() => {
    if (!audioRef.current || audioContextRef.current) return;

    try {
      // Safari fallback for webkitAudioContext
      const AudioContextClass =
        window.AudioContext ||
        (window as { webkitAudioContext?: typeof window.AudioContext }).webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error('AudioContext not supported');
      }
      const ctx = new AudioContextClass();
      const analyserNode = ctx.createAnalyser();
      analyserNode.fftSize = 256;

      const source = ctx.createMediaElementSource(audioRef.current);
      source.connect(analyserNode);
      analyserNode.connect(ctx.destination);

      audioContextRef.current = ctx;
      setAnalyser(analyserNode);
    } catch (err) {
      console.error('[AudioPreview] Failed to create audio analyser:', err);
    }
  }, []);

  // Draw waveform visualization
  const drawWaveform = useCallback(() => {
    if (!canvasRef.current || !analyser) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!isPlaying) {
        // Draw static waveform when paused
        ctx.fillStyle = 'rgba(0, 0, 0, 0)';
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const barWidth = canvas.width / 32;
        const barGap = 2;

        for (let i = 0; i < 32; i++) {
          const barHeight = Math.random() * (canvas.height * 0.6) + canvas.height * 0.2;
          const x = i * (barWidth + barGap);
          const y = (canvas.height - barHeight) / 2;

          ctx.fillStyle = 'rgba(156, 163, 175, 0.5)';
          ctx.fillRect(x, y, barWidth, barHeight);
        }
        return;
      }

      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.fillStyle = 'rgba(0, 0, 0, 0)';
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const value = dataArray[i] ?? 0;
        const barHeight = (value / 255) * canvas.height;
        const y = (canvas.height - barHeight) / 2;

        // Gradient color based on frequency
        const hue = (i / bufferLength) * 60 + 200; // Blue to purple range
        ctx.fillStyle = `hsla(${hue}, 70%, 60%, 0.8)`;
        ctx.fillRect(x, y, barWidth - 1, barHeight);

        x += barWidth;
      }
    };

    draw();
  }, [analyser, isPlaying]);

  // Update visualization when playing state changes
  useEffect(() => {
    if (isPlaying) {
      drawWaveform();
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, drawWaveform]);

  // Initial static waveform
  useEffect(() => {
    if (canvasRef.current && !isPlaying) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barCount = 32;
      const barWidth = canvas.width / barCount - 2;
      const barGap = 2;

      for (let i = 0; i < barCount; i++) {
        // Create a pseudo-random but consistent pattern
        const seed = (i * 7 + 3) % 17;
        const barHeight = (seed / 17) * (canvas.height * 0.5) + canvas.height * 0.15;
        const x = i * (barWidth + barGap);
        const y = (canvas.height - barHeight) / 2;

        ctx.fillStyle = 'rgba(156, 163, 175, 0.4)';
        ctx.roundRect?.(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }
    }
  }, [isPlaying, src]);

  const togglePlayPause = useCallback(() => {
    if (!audioRef.current) return;

    // Set up analyser on first play
    if (!audioContextRef.current) {
      setupAudioAnalyser();
    }

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.error);
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, setupAudioAnalyser]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (compact) {
    return (
      <div
        className={cn(
          'group relative inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-charcoal-700 px-3 py-2 text-sm',
          className,
        )}
      >
        <audio ref={audioRef} src={src} preload="metadata" />

        <button
          type="button"
          onClick={togglePlayPause}
          className="p-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>

        <Volume2 size={14} className="text-gray-400" />

        <span className="truncate max-w-[120px] text-gray-700 dark:text-gray-300">{name}</span>

        <span className="text-xs text-gray-400 tabular-nums">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X size={14} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-charcoal-700/50 p-3 overflow-hidden',
        className,
      )}
    >
      <audio ref={audioRef} src={src} preload="metadata" />

      <div className="flex items-center gap-3">
        {/* Play/Pause button */}
        <button
          type="button"
          onClick={togglePlayPause}
          className={cn(
            'flex-shrink-0 p-2.5 rounded-full transition-all duration-200',
            isPlaying
              ? 'bg-primary text-white shadow-md shadow-primary/25'
              : 'bg-primary/10 text-primary hover:bg-primary/20',
          )}
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>

        {/* Waveform visualization */}
        <div className="flex-1 min-w-0">
          <div className="relative h-10 rounded-lg overflow-hidden bg-gray-100 dark:bg-charcoal-800">
            <canvas ref={canvasRef} width={200} height={40} className="w-full h-full" />
            {/* Progress overlay */}
            <div
              className="absolute inset-y-0 left-0 bg-primary/20 pointer-events-none transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Time display */}
          <div className="flex items-center justify-between mt-1.5 px-1">
            <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
              {formatTime(currentTime)}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[150px] mx-2">
              {name}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Remove button */}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200 dark:hover:bg-charcoal-600 transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
};

export default AudioPreview;

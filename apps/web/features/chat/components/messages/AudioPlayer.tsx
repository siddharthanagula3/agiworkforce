
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@shared/lib/utils';
import { Button } from '@shared/components/ui/button';
import { Play, Pause, Trash2, Send, RotateCcw } from 'lucide-react';

export interface AudioPlayerProps {
  src: string;
  audioBlob?: Blob;
  onSend?: (audioFile: File) => void;
  onDiscard?: () => void;
  onReRecord?: () => void;
  showActions?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  compact?: boolean;
}

function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) {
    return '00:00';
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const AudioPlayer = React.memo(function AudioPlayer({
  src,
  audioBlob,
  onSend,
  onDiscard,
  onReRecord,
  showActions = true,
  className,
  size = 'md',
  compact = false,
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [waveformMeasured, setWaveformMeasured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);

  const sizeConfig = {
    sm: {
      height: 32,
      barWidth: 2,
      barGap: 1,
      buttonSize: 'h-7 w-7' as const,
      iconSize: 'h-3 w-3' as const,
      textSize: 'text-xs' as const,
    },
    md: {
      height: 48,
      barWidth: 3,
      barGap: 2,
      buttonSize: 'h-8 w-8' as const,
      iconSize: 'h-4 w-4' as const,
      textSize: 'text-sm' as const,
    },
    lg: {
      height: 64,
      barWidth: 4,
      barGap: 2,
      buttonSize: 'h-10 w-10' as const,
      iconSize: 'h-5 w-5' as const,
      textSize: 'text-base' as const,
    },
  };

  const config = sizeConfig[size];
  const barCount = useMemo(() => {
    return compact ? 24 : 48;
  }, [compact]);

  const placeholderWaveform = useMemo(
    () => Array.from({ length: barCount }, () => 0.35),
    [barCount],
  );

  useEffect(() => {
    if (!audioBlob) {
      queueMicrotask(() => {
        setWaveformData(placeholderWaveform);
        setWaveformMeasured(false);
      });
      return;
    }

    const analyzeAudio = async () => {
      try {
        const audioContext = new AudioContext();
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        const rawData = audioBuffer.getChannelData(0);
        const samples = barCount;
        const blockSize = Math.floor(rawData.length / samples);
        const filteredData: number[] = [];

        for (let i = 0; i < samples; i++) {
          let sum = 0;
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(rawData[i * blockSize + j]!);
          }
          filteredData.push(sum / blockSize);
        }

        const maxVal = Math.max(...filteredData);
        const normalizedData = filteredData.map((val) => (maxVal > 0 ? val / maxVal : 0.2));

        setWaveformData(normalizedData);
        setWaveformMeasured(true);
        audioContext.close();
      } catch (error) {
        console.error('Error analyzing audio:', error);
        setWaveformData(placeholderWaveform);
        setWaveformMeasured(false);
      }
    };

    analyzeAudio();
  }, [audioBlob, barCount, placeholderWaveform]);

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoading(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      audio.currentTime = 0;
    };

    const handleError = () => {
      console.error('Error loading audio');
      setIsLoading(false);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [src]);

  const togglePlayPause = useCallback(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!audioRef.current || !progressRef.current || duration === 0) return;

      const rect = progressRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percentage = clickX / rect.width;
      const newTime = percentage * duration;

      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    },
    [duration],
  );

  const handleSend = useCallback(() => {
    if (!audioBlob || !onSend) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = audioBlob.type.includes('webm') ? 'webm' : 'mp3';
    const fileName = `voice-message-${timestamp}.${extension}`;
    const audioFile = new File([audioBlob], fileName, { type: audioBlob.type });

    onSend(audioFile);
  }, [audioBlob, onSend]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && document.activeElement === document.body) {
        e.preventDefault();
        togglePlayPause();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayPause]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border bg-card p-3',
        compact && 'p-2',
        className,
      )}
    >
      {/* Play/Pause Button */}
      <Button
        variant="outline"
        size="icon"
        className={cn(config.buttonSize, 'shrink-0')}
        onClick={togglePlayPause}
        disabled={isLoading}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <Pause className={config.iconSize} />
        ) : (
          <Play className={cn(config.iconSize, 'ml-0.5')} />
        )}
      </Button>

      {/* Waveform / Progress */}
      <div
        ref={progressRef}
        className="relative flex flex-1 cursor-pointer items-center"
        style={{ height: config.height }}
        onClick={handleSeek}
        role="slider"
        aria-label="Audio progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPercent}
        tabIndex={0}
      >
        {/* Waveform bars — measured amplitudes, or a neutral placeholder (STB-28) */}
        <div
          className="flex h-full w-full items-center justify-between"
          title={waveformMeasured ? undefined : 'Waveform preview unavailable for this clip'}
        >
          {waveformData.map((level, index) => {
            const barProgress = (index / waveformData.length) * 100;
            const isPlayed = barProgress <= progressPercent;

            return (
              <div
                key={index}
                className={cn(
                  'rounded-full transition-colors duration-100',
                  isPlayed ? 'bg-primary' : 'bg-muted-foreground/30',
                  !waveformMeasured && 'opacity-50',
                )}
                style={{
                  width: config.barWidth,
                  height: `${Math.max(20, level * 100)}%`,
                  marginLeft: index === 0 ? 0 : config.barGap,
                }}
              />
            );
          })}
        </div>

        {/* Progress overlay (alternative to bar coloring) */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 bg-primary/10"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Duration / Current Time */}
      <div className={cn('shrink-0 font-mono tabular-nums text-muted-foreground', config.textSize)}>
        {formatDuration(currentTime)} / {formatDuration(duration)}
      </div>

      {/* Action Buttons */}
      {showActions && (
        <div className="flex items-center gap-1">
          {onReRecord && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(config.buttonSize, 'text-muted-foreground hover:text-foreground')}
              onClick={onReRecord}
              title="Re-record"
              aria-label="Re-record voice message"
            >
              <RotateCcw className={config.iconSize} aria-hidden="true" />
            </Button>
          )}

          {onDiscard && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(config.buttonSize, 'text-destructive hover:text-destructive')}
              onClick={onDiscard}
              title="Discard recording"
              aria-label="Discard voice recording"
            >
              <Trash2 className={config.iconSize} aria-hidden="true" />
            </Button>
          )}

          {onSend && audioBlob && (
            <Button
              variant="default"
              size="icon"
              className={config.buttonSize}
              onClick={handleSend}
              title="Send voice message"
              aria-label="Send voice message"
            >
              <Send className={config.iconSize} aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
});

export default AudioPlayer;

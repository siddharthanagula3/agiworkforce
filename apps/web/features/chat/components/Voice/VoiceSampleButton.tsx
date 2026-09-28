'use client';

import { useEffect, useRef, useState } from 'react';
import { Square, Volume2 } from '@agiworkforce/icons';

const SAMPLE_BASE_URL = process.env.NEXT_PUBLIC_LIVE_VOICE_SAMPLE_BASE_URL ?? '';

function sampleUrl(voiceUri: string): string | null {
  if (!SAMPLE_BASE_URL) return null;
  return `${SAMPLE_BASE_URL.replace(/\/+$/, '')}/${encodeURIComponent(voiceUri)}.mp3`;
}

export function VoiceSampleButton({
  voiceUri,
  voiceName,
}: {
  voiceUri: string;
  voiceName: string;
}) {
  const [available, setAvailable] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const url = sampleUrl(voiceUri);

  useEffect(() => {
    setAvailable(false);
    setPlaying(false);
    audioRef.current?.pause();
    audioRef.current = null;
    if (!url) return undefined;
    const controller = new AbortController();
    void fetch(url, { method: 'HEAD', signal: controller.signal }).then(
      (response) => setAvailable(response.ok),
      () => setAvailable(false),
    );
    return () => {
      controller.abort();
      audioRef.current?.pause();
    };
  }, [url]);

  if (!url || !available) return null;

  const toggle = () => {
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    const audio = audioRef.current ?? new Audio(url);
    audioRef.current = audio;
    audio.currentTime = 0;
    audio.onended = () => setPlaying(false);
    audio.onerror = () => {
      setPlaying(false);
      setAvailable(false);
    };
    void audio.play().then(
      () => setPlaying(true),
      () => setPlaying(false),
    );
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={playing}
      aria-label={playing ? `Stop the ${voiceName} sample` : `Play a sample of ${voiceName}`}
      data-testid="voice-sample-toggle"
      className="mx-auto inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--chat-border-strong)] px-4 py-2 text-sm font-medium text-[var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]"
    >
      {playing ? (
        <Square className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Volume2 className="h-4 w-4" aria-hidden="true" />
      )}
      {playing ? 'Stop' : 'Play sample'}
    </button>
  );
}

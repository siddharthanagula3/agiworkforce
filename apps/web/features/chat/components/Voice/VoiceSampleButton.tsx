'use client';

import { useEffect, useRef, useState } from 'react';
import { Square, Volume2 } from '@agiworkforce/icons';

import {
  parseVoiceSampleManifest,
  VOICE_SAMPLE_MANIFEST_URL,
  voiceSampleUrl,
} from '@features/chat/lib/voice-samples';

let samplesRequest: Promise<Record<string, string>> | null = null;

function loadVoiceSamples(): Promise<Record<string, string>> {
  samplesRequest ??= fetch(VOICE_SAMPLE_MANIFEST_URL)
    .then((response) => (response.ok ? response.json() : null))
    .then(parseVoiceSampleManifest, () => {
      samplesRequest = null;
      return {};
    });
  return samplesRequest;
}

export function VoiceSampleButton({
  voiceUri,
  voiceName,
}: {
  voiceUri: string;
  voiceName: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setPlaying(false);
    void loadVoiceSamples().then((samples) => {
      const file = samples[voiceUri];
      if (active && file) setUrl(voiceSampleUrl(file));
    });
    return () => {
      active = false;
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, [voiceUri]);

  if (!url) return null;

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
      setUrl(null);
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

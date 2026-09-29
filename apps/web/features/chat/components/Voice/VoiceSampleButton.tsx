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
  const [starting, setStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setPlaying(false);
    setErrorMessage(null);
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
      setStarting(false);
      setErrorMessage('The sample could not play. Try again later.');
    };
    setErrorMessage(null);
    setStarting(true);
    void audio.play().then(
      () => {
        setStarting(false);
        setPlaying(true);
      },
      () => {
        setStarting(false);
        setPlaying(false);
        setErrorMessage('The sample could not play. Try again later.');
      },
    );
  };

  return (
    <div className="mx-auto flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={playing}
        aria-busy={starting}
        aria-label={playing ? `Stop the ${voiceName} sample` : `Play a sample of ${voiceName}`}
        data-testid="voice-sample-toggle"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--chat-border-strong)] px-4 py-2 text-sm font-medium text-[var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]"
      >
        {playing ? (
          <Square className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Volume2 className="h-4 w-4" aria-hidden="true" />
        )}
        {playing ? 'Stop' : 'Play sample'}
      </button>
      {errorMessage ? (
        <p role="status" className="text-xs text-[var(--chat-text-secondary)]">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

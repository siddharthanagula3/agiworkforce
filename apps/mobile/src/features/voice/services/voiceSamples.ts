import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { API_URL } from '@/lib/constants';
import { guardedFetch } from '@/lib/egressGuard';

const SAMPLE_FILE = /^[a-z0-9-]+\.(?:mp3|wav)$/;

let manifest: Promise<Record<string, string>> | null = null;
let activePlayer: AudioPlayer | null = null;

function parseManifest(value: unknown): Record<string, string> {
  const samples = (value as { samples?: unknown } | null)?.samples;
  if (!samples || typeof samples !== 'object' || Array.isArray(samples)) return {};
  return Object.fromEntries(
    Object.entries(samples as Record<string, unknown>).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === 'string' && SAMPLE_FILE.test(entry[1]),
    ),
  );
}

export function loadVoiceSamples(): Promise<Record<string, string>> {
  manifest ??= guardedFetch(`${API_URL}/voice-samples/manifest.json`)
    .then((response) => (response.ok ? response.json() : null))
    .then(parseManifest, () => {
      manifest = null;
      return {};
    });
  return manifest;
}

export function stopVoiceSample(): void {
  activePlayer?.remove();
  activePlayer = null;
}

export function playVoiceSample(file: string, onEnd: () => void): void {
  stopVoiceSample();
  const player = createAudioPlayer(`${API_URL}/voice-samples/${encodeURIComponent(file)}`);
  activePlayer = player;
  player.addListener('playbackStatusUpdate', (status) => {
    if (!status.didJustFinish && !status.error) return;
    if (activePlayer === player) stopVoiceSample();
    onEnd();
  });
  player.play();
}

export const VOICE_SAMPLE_DIRECTORY = 'voice-samples';

export const VOICE_SAMPLE_MANIFEST_FILE = 'manifest.json';

export const VOICE_SAMPLE_MANIFEST_URL = `/${VOICE_SAMPLE_DIRECTORY}/${VOICE_SAMPLE_MANIFEST_FILE}`;

export function voiceSampleUrl(file: string): string {
  return `/${VOICE_SAMPLE_DIRECTORY}/${encodeURIComponent(file)}`;
}

export function parseVoiceSampleManifest(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  const samples = (value as { samples?: unknown }).samples;
  if (!samples || typeof samples !== 'object' || Array.isArray(samples)) return {};
  return Object.fromEntries(
    Object.entries(samples as Record<string, unknown>).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === 'string' && /^[a-z0-9-]+\.(?:mp3|wav)$/.test(entry[1]),
    ),
  );
}

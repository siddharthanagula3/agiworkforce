import { getRoutingSlotModel } from '@agiworkforce/types';
import { isSupportedLanguage } from '@agiworkforce/i18n/languages';
import { MAX_DICTATION_BYTES } from '../../protocol/dictationLimits';

export const DICTATION_LANGUAGE_KEY = 'agiWorkforce.dictationLanguage';

export function dictationLanguageCode(language?: string): string | undefined {
  const code = language?.split('-')[0]?.toLowerCase();
  return isSupportedLanguage(code) ? code : undefined;
}

export async function transcribeDictation(
  origin: string,
  token: string,
  audio: { mimeType: string; base64: string; language?: string },
  signal: AbortSignal,
): Promise<string> {
  const bytes = Buffer.from(audio.base64, 'base64');
  if (!bytes.length || bytes.length > MAX_DICTATION_BYTES) throw new Error('Invalid audio size.');
  const extension = audio.mimeType.split('/')[1];
  const form = new FormData();
  form.append(
    'file',
    new Blob([Uint8Array.from(bytes)], { type: audio.mimeType }),
    `dictation.${extension}`,
  );
  form.append('model', getRoutingSlotModel('voice_transcription'));
  const language = dictationLanguageCode(audio.language);
  if (language) form.append('language', language);
  const endpoint = new URL('/api/voice/transcribe?surface=vscode', origin);
  const response = await fetch(endpoint, {
    method: 'POST',
    redirect: 'error',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal,
  });
  if (!response.ok) throw new Error(`Transcription failed (HTTP ${response.status}).`);
  const data = (await response.json()) as { text?: unknown };
  if (typeof data.text !== 'string' || !data.text.trim())
    throw new Error('No speech was recognized.');
  return data.text.trim();
}

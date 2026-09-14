import * as vscode from 'vscode';
import { getExtensionUserAgent } from '../../platform/version';
import { SOURCE_SURFACE } from '../../platform/surface';
import { getCloudApiEndpoint, getCloudCredential } from '../../utils/api';

export const TRANSCRIPTION_PATH = '/audio/transcriptions';
export const MAX_DICTATION_BYTES = 25 * 1024 * 1024;

const AUDIO_EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/flac': 'flac',
};

export type DictationFetch = (input: string, init?: RequestInit) => Promise<Response>;

export class DictationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'DictationError';
  }
}

export interface DictationRequest {
  audio: Uint8Array;
  mimeType: string;
  language?: string;
}

export function audioMimeEssence(mimeType: string): string {
  return mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
}

export function dictationFileName(mimeType: string): string {
  return `dictation.${AUDIO_EXTENSIONS[audioMimeEssence(mimeType)] ?? 'webm'}`;
}

export function dictationErrorMessage(status: number): string {
  if (status === 401 || status === 403) {
    return 'Sign in to AGI Cloud again to use voice input. The recording was not kept.';
  }
  if (status === 402) {
    return 'Voice input needs an active plan. Nothing was charged for this recording.';
  }
  if (status === 413) {
    return 'That recording was too long to transcribe. Try a shorter one.';
  }
  if (status === 415) {
    return 'That audio format is not supported for transcription.';
  }
  if (status === 429) {
    return 'Too many recordings just now. Wait a moment, then try again.';
  }
  if (status >= 500) {
    return 'Transcription is unavailable right now. The recording was not kept.';
  }
  return 'That recording could not be transcribed. Try again, or type instead.';
}

export async function transcribeDictation(
  secrets: vscode.SecretStorage,
  request: DictationRequest,
  fetchImpl: DictationFetch = globalThis.fetch.bind(globalThis),
): Promise<string> {
  if (request.audio.byteLength === 0) {
    throw new DictationError('Nothing was recorded. Try again.', 400);
  }
  if (request.audio.byteLength > MAX_DICTATION_BYTES) {
    throw new DictationError(dictationErrorMessage(413), 413);
  }

  const credential = await getCloudCredential(secrets);
  if (credential.kind === 'none') {
    throw new DictationError(
      credential.accountStatus === 'expired'
        ? 'Your AGI Cloud session expired. Sign in again to use voice input.'
        : 'Sign in to AGI Cloud to use voice input.',
      401,
    );
  }

  const mimeType = audioMimeEssence(request.mimeType);
  const bytes = new Uint8Array(request.audio.byteLength);
  bytes.set(request.audio);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mimeType }), dictationFileName(mimeType));
  if (request.language !== undefined && request.language !== '') {
    form.append('language', request.language);
  }

  let response: Response;
  try {
    response = await fetchImpl(`${getCloudApiEndpoint()}${TRANSCRIPTION_PATH}`, {
      method: 'POST',
      body: form,
      headers: {
        Authorization: `Bearer ${credential.token}`,
        Accept: 'application/json',
        'User-Agent': getExtensionUserAgent(),
        'X-Client': 'vscode-extension',
        'X-AGI-Surface': SOURCE_SURFACE,
      },
    });
  } catch (error) {
    throw new DictationError(
      `Could not reach transcription: ${error instanceof Error ? error.message : String(error)}`,
      0,
    );
  }

  if (!response.ok) {
    throw new DictationError(dictationErrorMessage(response.status), response.status);
  }

  const body = (await response.json().catch(() => undefined)) as { text?: unknown } | undefined;
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (text === '') {
    throw new DictationError('No speech was recognised in that recording.', response.status);
  }
  return text;
}

import { z } from 'zod';
import { GOOGLE_DOCS_EXPORT_REFUSALS } from './google-docs-export';

export const ARTIFACT_DRIVE_SAVE_PATH = '/api/artifacts/save-to-drive';
export const ARTIFACT_ONEDRIVE_SAVE_PATH = '/api/artifacts/save-to-onedrive';

export const ARTIFACT_CLOUD_SAVE_MAX_BYTES = 3_000_000;
const MAX_CONTENT_CHARS = Math.ceil(ARTIFACT_CLOUD_SAVE_MAX_BYTES / 3) * 4;
const MAX_FILE_NAME_CHARS = 200;
const FALLBACK_FILE_NAME = 'artifact';

const RESERVED_FILE_NAME_CHARS = /[\\/:*?"<>|]/g;
const MIME_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** A name both Drive and OneDrive accept as one path segment: no separators, no reserved characters, no trailing dot or space. */
export function artifactCloudFileName(raw: string): string {
  const cleaned = Array.from(raw, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 ? '-' : character;
  })
    .join('')
    .replace(RESERVED_FILE_NAME_CHARS, '-')
    .trim()
    .slice(0, MAX_FILE_NAME_CHARS)
    .replace(/[. ]+$/, '');
  return cleaned || FALLBACK_FILE_NAME;
}

export const ArtifactCloudSaveRequestSchema = z
  .object({
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(MAX_FILE_NAME_CHARS)
      .refine((name) => artifactCloudFileName(name) === name, 'Invalid file name'),
    mimeType: z.string().trim().max(127).regex(MIME_TYPE),
    encoding: z.enum(['utf8', 'base64']),
    content: z.string().min(1).max(MAX_CONTENT_CHARS),
  })
  .refine((request) => request.encoding === 'utf8' || BASE64.test(request.content), {
    path: ['content'],
    message: 'Content is not valid base64',
  });
export type ArtifactCloudSaveRequest = z.input<typeof ArtifactCloudSaveRequestSchema>;

export interface ArtifactCloudSaveResponse {
  fileName: string;
  url?: string;
}

export const ARTIFACT_CLOUD_SAVE_REFUSALS = {
  ...GOOGLE_DOCS_EXPORT_REFUSALS,
  onedrive_not_connected: 'Connect OneDrive to save files to it.',
  onedrive_reconnect_required: 'Reconnect OneDrive to save files to it.',
  onedrive_write_not_granted:
    'OneDrive is connected for reading only. Reconnect it and allow it to save files.',
} as const;
export type ArtifactCloudSaveRefusalCode = keyof typeof ARTIFACT_CLOUD_SAVE_REFUSALS;

export function isArtifactCloudSaveRefusalCode(code: string): code is ArtifactCloudSaveRefusalCode {
  return Object.prototype.hasOwnProperty.call(ARTIFACT_CLOUD_SAVE_REFUSALS, code);
}

export function artifactCloudSaveByteLength(request: ArtifactCloudSaveRequest): number {
  if (request.encoding === 'utf8') return new TextEncoder().encode(request.content).byteLength;
  const padding = request.content.endsWith('==') ? 2 : request.content.endsWith('=') ? 1 : 0;
  return Math.floor((request.content.length * 3) / 4) - padding;
}

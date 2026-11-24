export const MAX_DICTATION_BYTES = 3 * 1024 * 1024;
export const MAX_DICTATION_BASE64_CHARS = Math.ceil(MAX_DICTATION_BYTES / 3) * 4;
export const MAX_DICTATION_MS = 120_000;
export const DICTATION_MIME_TYPES = ['audio/webm', 'audio/mp4', 'audio/ogg'] as const;

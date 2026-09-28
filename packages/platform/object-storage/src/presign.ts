import { type PresignGetInput, type PresignPutInput, type PresignUploadPartInput } from './types';

export const PRESIGNED_URL_MAX_TTL_SECONDS = 3_600;
export const MAX_MULTIPART_PART_NUMBER = 10_000;

const MILLISECONDS_PER_SECOND = 1_000;
const SIGV4_DATE_PARAM = 'X-Amz-Date';
const SIGV4_EXPIRES_PARAM = 'X-Amz-Expires';
const MEMORY_EXPIRES_PARAM = 'expiresAt';
const SIGV4_DATE_PATTERN = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/u;

export interface BoundPresignUpload {
  contentType: string;
  contentLength: number;
  expiresInSeconds: number;
}

/**
 * A presigned upload that binds neither size nor type is a writable hole: the
 * holder of the URL chooses both, and the key then serves whatever they sent.
 * An unbounded lifetime is the same hole left open forever.
 */
function boundContentLength(contentLength: number): number {
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
    throw new Error('A presigned upload must bind a positive content length.');
  }
  return contentLength;
}

function boundLifetime(expiresInSeconds: number): number {
  if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new Error('A presigned upload must expire; give it a positive lifetime in seconds.');
  }
  if (expiresInSeconds > PRESIGNED_URL_MAX_TTL_SECONDS) {
    throw new Error(`A presigned upload may not outlive ${PRESIGNED_URL_MAX_TTL_SECONDS} seconds.`);
  }
  return expiresInSeconds;
}

export function bindPresignedUpload(input: PresignPutInput): BoundPresignUpload {
  const contentLength = boundContentLength(input.contentLength);
  const contentType = input.contentType.trim();
  if (!contentType) {
    throw new Error('A presigned upload must bind a content type.');
  }
  return { contentType, contentLength, expiresInSeconds: boundLifetime(input.expiresInSeconds) };
}

export interface BoundPresignDownload {
  expiresInSeconds: number;
  contentDisposition: string | undefined;
}

function attachmentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export function bindPresignedDownload(input: PresignGetInput): BoundPresignDownload {
  const fileName = input.downloadFileName?.trim();
  return {
    expiresInSeconds: boundLifetime(input.expiresInSeconds),
    contentDisposition: fileName ? attachmentDisposition(fileName) : undefined,
  };
}

export interface BoundPresignUploadPart {
  partNumber: number;
  contentLength: number;
  expiresInSeconds: number;
}

export function bindPresignedUploadPart(input: PresignUploadPartInput): BoundPresignUploadPart {
  if (
    !Number.isSafeInteger(input.partNumber) ||
    input.partNumber < 1 ||
    input.partNumber > MAX_MULTIPART_PART_NUMBER
  ) {
    throw new Error(
      `A presigned part must name a part number between 1 and ${MAX_MULTIPART_PART_NUMBER}.`,
    );
  }
  if (!input.uploadId) {
    throw new Error('A presigned part must name the multipart upload it belongs to.');
  }
  return {
    partNumber: input.partNumber,
    contentLength: boundContentLength(input.contentLength),
    expiresInSeconds: boundLifetime(input.expiresInSeconds),
  };
}

function sigv4SignedAt(value: string): number | null {
  const match = SIGV4_DATE_PATTERN.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
}

/**
 * The instant a signed URL stops being honoured, read from the URL itself so
 * the expiry a caller asserts is the one the holder of the link is bound by.
 */
export function presignedUrlExpiresAt(url: string): number | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const memoryExpiry = parsed.searchParams.get(MEMORY_EXPIRES_PARAM);
  if (memoryExpiry) {
    const value = Number(memoryExpiry);
    return Number.isFinite(value) ? value : null;
  }

  const signedAtRaw = parsed.searchParams.get(SIGV4_DATE_PARAM);
  const ttlRaw = parsed.searchParams.get(SIGV4_EXPIRES_PARAM);
  if (!signedAtRaw || !ttlRaw) return null;
  const signedAt = sigv4SignedAt(signedAtRaw);
  const ttlSeconds = Number(ttlRaw);
  if (signedAt === null || !Number.isFinite(ttlSeconds)) return null;
  return signedAt + ttlSeconds * MILLISECONDS_PER_SECOND;
}

export function isPresignedUrlExpired(url: string, nowMs: number = Date.now()): boolean {
  const expiresAt = presignedUrlExpiresAt(url);
  if (expiresAt === null) return true;
  return nowMs >= expiresAt;
}

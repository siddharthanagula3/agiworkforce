import { type PresignPutInput } from './types';

export interface BoundPresignUpload {
  contentType: string;
  contentLength: number;
}

/**
 * A presigned upload that binds neither size nor type is a writable hole: the
 * holder of the URL chooses both, and the key then serves whatever they sent.
 */
export function bindPresignedUpload(input: PresignPutInput): BoundPresignUpload {
  if (!Number.isSafeInteger(input.contentLength) || input.contentLength <= 0) {
    throw new Error('A presigned upload must bind a positive content length.');
  }
  const contentType = input.contentType.trim();
  if (!contentType) {
    throw new Error('A presigned upload must bind a content type.');
  }
  return { contentType, contentLength: input.contentLength };
}
